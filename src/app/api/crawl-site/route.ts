import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const HUNTER_KEY = process.env.HUNTER_API_KEY

const CRYPTO_KW = ['blockchain','crypto','defi','nft','web3','token','coin','exchange',
  'wallet','bitcoin','ethereum','presale','ico','ido','dao','dex','staking','yield',
  'airdrop','protocol','layer','chain','dapp','gamefi','mining','metaverse','altcoin']

const BOD_TITLES = ['CEO','Co-Founder','Founder','CFO','COO','CMO','CTO',
  'Chief Executive','Chief Financial','Chief Marketing','Chief Technology',
  'President','Director','Head of','VP ','Vice President','Partner']

function isCrypto(t: string) { return CRYPTO_KW.some(k => (t||'').toLowerCase().includes(k)) }
function isBOD(t: string) { return BOD_TITLES.some(b => (t||'').toLowerCase().includes(b.toLowerCase())) }

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://google.com/bot.html)' },
    signal: AbortSignal.timeout(7000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 35000)
}

// Claude generate realistic article URLs + fetch thật để lấy email
async function getArticleUrls(siteUrl: string, domain: string, crawledUrls: string[]): Promise<string[]> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Generate 6 realistic URL slugs for recent sponsored/press-release articles on ${domain} about crypto projects.

Based on actual URL patterns used by ${domain} for press releases and sponsored content.

Examples by site type:
- zycrypto.com: /press-release/projectname-launches-token-presale-raises-2m/
- cryptotimes.io: /press-release/defi-protocol-announces-mainnet-launch/  
- blockchainreporter.net: /press-release/nft-marketplace-secures-seed-funding/
- livebitcoinnews.com: /press-releases/blockchain-startup-completes-5m-round/
- globenewswire.com: /news-release/2026/01/15/3200000/0/en/project-name-press-release.html
- analyticsinsight.net: /press-release-2024/crypto-exchange-lists-new-token/

Already crawled (skip): ${crawledUrls.slice(0,5).join(', ')||'none'}

Return ONLY JSON: {"urls":["https://full-url-1","https://full-url-2",...]}`
    }]
  })
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  try {
    const p = JSON.parse(raw.replace(/```json|```/g,'').trim())
    return (p.urls || []).filter((u: string) => u.startsWith('http') && !crawledUrls.includes(u))
  } catch { return [] }
}

// Extract email advertiser từ HTML bài viết
async function extractAdvertiserEmail(html: string, hostDomain: string): Promise<{
  name: string; domain: string; emails: string[]; isCrypto: boolean
}> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Extract advertiser contact info from this press release article on ${hostDomain}.
The advertiser is the CRYPTO PROJECT that paid to publish this article - NOT ${hostDomain} itself.

Find: MEDIA CONTACT section, press@, info@, contact@, bd@, media@ emails belonging to the PROJECT.

Article text (HTML stripped):
${html.slice(0, 12000)}

Return JSON only (no markdown):
{"name":"ProjectName","domain":"project.io","emails":["contact@project.io"],"isCrypto":true}`
    }]
  })
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  try { return JSON.parse(raw.replace(/```json|```/g,'').trim()) }
  catch { return { name: '', domain: '', emails: [], isCrypto: false } }
}

// Hunter BOD
async function hunterBOD(domain: string): Promise<{ email: string; name: string; position: string }[]> {
  if (!HUNTER_KEY || !domain || !domain.includes('.')) return []
  try {
    const r = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&limit=5&api_key=${HUNTER_KEY}`)
    const d = await r.json()
    if (d.errors || !d.data?.emails?.length) return []
    const all = d.data.emails
    const bod = all.filter((e: any) => isBOD(e.position||''))
    const use = bod.length ? bod : all.slice(0,2)
    return use.map((e: any) => ({
      email: e.value,
      name: `${e.first_name||''} ${e.last_name||''}`.trim(),
      position: e.position||''
    }))
  } catch { return [] }
}

export async function POST(req: NextRequest) {
  const { siteUrl, maxPages = 3 } = await req.json()
  if (!siteUrl) return NextResponse.json({ error: 'Thiếu siteUrl' }, { status: 400 })

  const domain = siteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')

  const { data: site } = await supabase
    .from('competitor_sites')
    .upsert({ url: siteUrl, domain, last_crawled_at: new Date().toISOString() }, { onConflict: 'url' })
    .select().single()
  const siteId = site?.id

  const { data: crawledRows } = await supabase.from('crawled_pages').select('page_url').eq('site_id', siteId)
  const crawledSet = new Set((crawledRows||[]).map((r:any) => r.page_url))

  const { data: existing } = await supabase.from('emails').select('address')
  const emailSet = new Set((existing||[]).map((e:any) => e.address.toLowerCase()))

  const logs: string[] = []
  const results: any[] = []
  let totalNew = 0

  logs.push(`▶ Generating article URLs for ${domain}...`)
  const articleUrls = await getArticleUrls(siteUrl, domain, [...crawledSet])
  const toProcess = articleUrls.filter(u => !crawledSet.has(u)).slice(0, maxPages)
  logs.push(`  → ${toProcess.length} URLs to process`)

  for (const url of toProcess) {
    logs.push(`\n  📄 ${url.replace(/https?:\/\/[^/]+/,'')}`)
    const collected: {addr:string; src:string; name:string; pos?:string}[] = []
    let advertiserDomain = ''
    let advertiserName = ''

    // NGUỒN 1: Fetch bài viết thật
    try {
      const html = await fetchText(url)
      logs.push(`     ✓ Fetched ${html.length} chars`)
      const info = await extractAdvertiserEmail(html, domain)
      advertiserName = info.name
      advertiserDomain = info.domain

      if (!info.isCrypto && !isCrypto(info.name + ' ' + info.domain)) {
        logs.push(`     ⊘ Non-crypto — skip`)
        await supabase.from('crawled_pages').insert({ site_id: siteId, page_url: url, page_title: '', emails_found: 0 })
        crawledSet.add(url)
        continue
      }

      logs.push(`     Dự án: ${info.name} (${info.domain})`)
      for (const em of info.emails||[]) {
        const a = em.toLowerCase().trim()
        if (a.includes('@') && !a.includes(domain) && !emailSet.has(a)) {
          collected.push({ addr: a, src: 'article', name: info.name })
          logs.push(`     → [Bài] ${a}`)
        }
      }
    } catch (e:any) {
      logs.push(`     ⚠ Fetch failed: ${e.message}`)
    }

    // NGUỒN 2: Hunter BOD với domain advertiser
    if (advertiserDomain && advertiserDomain !== domain) {
      try {
        const hunterR = await hunterBOD(advertiserDomain)
        for (const h of hunterR) {
          if (!emailSet.has(h.email)) {
            collected.push({ addr: h.email, src: 'hunter_bod', name: h.name, pos: h.position })
            logs.push(`     → [Hunter${isBOD(h.position)?'BOD👑':''}] ${h.email} (${h.name})`)
          }
        }
      } catch {}
    }

    // COLLECT nếu thoả ít nhất 1 nguồn
    const saved: string[] = []
    for (const e of collected) {
      const a = e.addr.toLowerCase()
      if (emailSet.has(a)) continue
      await supabase.from('emails').insert({
        address: a,
        source_url: url,
        domain: advertiserDomain || domain,
        status: 'new',
        source_type: e.src,
        contact_name: e.name||null,
        position: e.pos||null,
      })
      emailSet.add(a)
      saved.push(a)
      totalNew++
    }

    logs.push(`     ${saved.length > 0 ? '✅' : '—'} ${saved.length} email: ${saved.join(', ')||'none'}`)
    results.push({ url, advertiser: advertiserName, advertiserDomain, newEmails: saved })

    await supabase.from('crawled_pages').insert({
      site_id: siteId, page_url: url,
      page_title: advertiserName || url,
      emails_found: saved.length
    })
    crawledSet.add(url)
  }

  await supabase.from('competitor_sites').update({
    last_crawled_at: new Date().toISOString(),
    total_pages_crawled: crawledSet.size,
    total_emails_found: emailSet.size,
  }).eq('id', siteId)

  logs.push(`\n✅ Done: +${totalNew} emails from ${results.length} articles`)
  return NextResponse.json({ domain, pagesScanned: toProcess.length, newEmails: totalNew, results, logs })
}

export async function GET() {
  const { data: sites } = await supabase
    .from('competitor_sites')
    .select('*, crawled_pages(count)')
    .order('last_crawled_at', { ascending: false, nullsFirst: false })
  return NextResponse.json({ sites: sites||[] })
}

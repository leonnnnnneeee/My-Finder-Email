import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const HUNTER_KEY = process.env.HUNTER_API_KEY

const CRYPTO_KW = ['blockchain','crypto','defi','nft','web3','token','coin','exchange',
  'wallet','bitcoin','ethereum','presale','ico','ido','dao','dex','staking','yield',
  'airdrop','protocol','layer','chain','dapp','gamefi','p2e','mining','metaverse','altcoin']

const BOD_TITLES = ['CEO','Co-Founder','Founder','CFO','COO','CMO','CTO',
  'Chief Executive','Chief Financial','Chief Marketing','Chief Technology','Chief Operating',
  'President','Director','Head of','VP ','Vice President','Managing Director','Partner']

function isCrypto(text: string) {
  return CRYPTO_KW.some(k => (text||'').toLowerCase().includes(k))
}
function isBOD(title: string) {
  return BOD_TITLES.some(b => (title||'').toLowerCase().includes(b.toLowerCase()))
}

// Fetch 1 URL với timeout + strip HTML
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 30000)
}

// Dùng Claude + web_search tool để tìm bài PR thật trên site
async function findPRArticles(domain: string, alreadyCrawled: string[]): Promise<{
  url: string; title: string; advertiserName: string; advertiserDomain: string; emails: string[]
}[]> {
  try {
    const msg = await (anthropic.messages.create as any)({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Search for recent sponsored/press-release/PR articles on ${domain} where crypto projects paid to publish. I need the advertiser project emails.

Search: site:${domain} "press release" OR "sponsored" crypto token blockchain 2025 2026

For each article found:
- Extract the URL
- Identify the crypto project that booked/paid for the article (advertiser)
- Extract any contact email of the PROJECT (not ${domain})
- Find the project's domain

Skip already-crawled: ${alreadyCrawled.slice(0,3).join(', ')||'none'}
Only include crypto/blockchain/DeFi/NFT/Web3 projects.

Return JSON:
{"articles":[{"url":"https://...","title":"...","advertiserName":"ProjectName","advertiserDomain":"project.io","emails":["contact@project.io"]}]}`
      }]
    })

    let text = ''
    for (const b of msg.content) {
      if (b.type === 'text') text += b.text
    }
    const match = text.match(/\{[\s\S]*?"articles"[\s\S]*?\}(?=\s*$|\s*```)/m) ||
                  text.match(/\{[\s\S]*?"articles"[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return parsed.articles || []
    }
  } catch (e: any) {
    console.error('findPRArticles error:', e.message)
  }
  return []
}

// Fetch bài viết thật + extract email advertiser
async function extractFromArticle(url: string, hostDomain: string): Promise<{
  advertiserName: string; advertiserDomain: string; emails: string[]; isCryptoProject: boolean
}> {
  const text = await fetchText(url)
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `This is a PR/sponsored article from ${hostDomain}. Find the ADVERTISER (the crypto project that paid for this article) and their contact email.

DO NOT include emails from ${hostDomain} itself.
Look for: MEDIA CONTACT, press@, info@, contact@, bd@, hello@, media@, marketing@

Article text:
${text.slice(0, 15000)}

Return JSON only:
{"advertiserName":"ProjectName","advertiserDomain":"project.io","emails":["contact@project.io"],"isCryptoProject":true}`
    }]
  })
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return { advertiserName: '', advertiserDomain: '', emails: [], isCryptoProject: false }
  }
}

// Hunter.io BOD search
async function hunterBOD(domain: string): Promise<{ email: string; name: string; position: string }[]> {
  if (!HUNTER_KEY || !domain) return []
  try {
    const r = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&limit=5&api_key=${HUNTER_KEY}`)
    const d = await r.json()
    if (d.errors || !d.data?.emails?.length) return []
    const all = d.data.emails
    const bod = all.filter((e: any) => isBOD(e.position || ''))
    const use = bod.length ? bod : all.slice(0, 2)
    return use.map((e: any) => ({
      email: e.value,
      name: `${e.first_name||''} ${e.last_name||''}`.trim(),
      position: e.position || ''
    }))
  } catch { return [] }
}

export async function POST(req: NextRequest) {
  const { siteUrl, maxPages = 6 } = await req.json()
  if (!siteUrl) return NextResponse.json({ error: 'Thiếu siteUrl' }, { status: 400 })

  const domain = siteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')

  // Upsert competitor site
  const { data: site } = await supabase
    .from('competitor_sites')
    .upsert({ url: siteUrl, domain, last_crawled_at: new Date().toISOString() }, { onConflict: 'url' })
    .select().single()
  const siteId = site?.id

  const { data: crawledRows } = await supabase.from('crawled_pages').select('page_url').eq('site_id', siteId)
  const crawledSet = new Set((crawledRows || []).map((r: any) => r.page_url))

  const { data: existingEmails } = await supabase.from('emails').select('address')
  const emailSet = new Set((existingEmails || []).map((e: any) => e.address.toLowerCase()))

  const logs: string[] = []
  const results: any[] = []
  let totalNew = 0

  try {
    // BƯỚC 1: Dùng web search tìm bài PR thật trên site
    logs.push(`▶ Web search bài PR/Sponsored trên ${domain}...`)
    const articles = await findPRArticles(domain, [...crawledSet])
    logs.push(`  → Tìm thấy ${articles.length} bài`)

    const toProcess = articles
      .filter(a => a.url && !crawledSet.has(a.url))
      .filter(a => isCrypto(`${a.advertiserName} ${a.title} ${a.advertiserDomain}`))
      .slice(0, maxPages)

    logs.push(`  → ${toProcess.length} bài crypto mới cần xử lý`)

    for (const article of toProcess) {
      logs.push(`\n  📄 ${article.title?.slice(0, 55) || article.url}`)
      logs.push(`     Dự án: ${article.advertiserName} (${article.advertiserDomain})`)

      const collected: { addr: string; src: string; name: string; pos?: string }[] = []

      // NGUỒN 1: Email từ kết quả web search
      for (const em of article.emails || []) {
        const a = em.toLowerCase().trim()
        if (a.includes('@') && !a.includes(domain) && !emailSet.has(a)) {
          collected.push({ addr: a, src: 'article', name: article.advertiserName })
          logs.push(`     → [Search] ${a}`)
        }
      }

      // NGUỒN 2: Fetch bài viết thật để extract thêm email
      if (collected.length === 0 && article.url.startsWith('http')) {
        try {
          const info = await extractFromArticle(article.url, domain)
          if (info.isCryptoProject || isCrypto(info.advertiserName)) {
            for (const em of info.emails || []) {
              const a = em.toLowerCase().trim()
              if (a.includes('@') && !a.includes(domain) && !emailSet.has(a)) {
                collected.push({ addr: a, src: 'article', name: info.advertiserName || article.advertiserName })
                logs.push(`     → [Article] ${a}`)
              }
            }
          }
        } catch (e: any) {
          logs.push(`     ⚠ Fetch: ${e.message}`)
        }
      }

      // NGUỒN 3: Hunter BOD với domain của dự án advertiser
      const huntDomain = article.advertiserDomain
      if (huntDomain && huntDomain !== domain && huntDomain.includes('.')) {
        try {
          const hunterResults = await hunterBOD(huntDomain)
          for (const h of hunterResults) {
            if (!emailSet.has(h.email)) {
              collected.push({ addr: h.email, src: 'hunter_bod', name: h.name, pos: h.position })
              logs.push(`     → [Hunter${isBOD(h.position) ? ' BOD👑' : ''}] ${h.email} (${h.name})`)
            }
          }
        } catch {}
      }

      // COLLECT nếu thoả ít nhất 1 trong 2 nguồn (email bài hoặc Hunter)
      const saved: string[] = []
      for (const e of collected) {
        const a = e.addr.toLowerCase()
        if (emailSet.has(a)) continue
        await supabase.from('emails').insert({
          address: a,
          source_url: article.url,
          domain: article.advertiserDomain || domain,
          status: 'new',
          source_type: e.src,
          contact_name: e.name || null,
          position: e.pos || null,
        })
        emailSet.add(a)
        saved.push(a)
        totalNew++
      }

      const icon = saved.length > 0 ? `✅` : `—`
      logs.push(`     ${icon} Collected: ${saved.length} email${saved.length ? ': ' + saved.join(', ') : ''}`)

      results.push({
        url: article.url,
        advertiser: article.advertiserName,
        advertiserDomain: article.advertiserDomain,
        newEmails: saved,
      })

      await supabase.from('crawled_pages').insert({
        site_id: siteId,
        page_url: article.url,
        page_title: article.advertiserName || article.title,
        emails_found: saved.length,
      })
      crawledSet.add(article.url)
    }

    await supabase.from('competitor_sites').update({
      last_crawled_at: new Date().toISOString(),
      total_pages_crawled: crawledSet.size,
      total_emails_found: emailSet.size,
    }).eq('id', siteId)

    logs.push(`\n✅ Xong: +${totalNew} email mới từ ${results.length}/${toProcess.length} bài`)
    return NextResponse.json({ domain, pagesScanned: toProcess.length, newEmails: totalNew, results, logs })

  } catch (err: any) {
    logs.push(`✗ ${err.message}`)
    return NextResponse.json({ error: err.message, logs }, { status: 500 })
  }
}

export async function GET() {
  const { data: sites } = await supabase
    .from('competitor_sites')
    .select('*, crawled_pages(count)')
    .order('last_crawled_at', { ascending: false, nullsFirst: false })
  return NextResponse.json({ sites: sites || [] })
}

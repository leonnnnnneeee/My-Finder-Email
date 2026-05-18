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
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    signal: AbortSignal.timeout(7000),
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

async function hunterBOD(domain: string): Promise<{ email: string; name: string; position: string }[]> {
  if (!HUNTER_KEY || !domain?.includes('.')) return []
  try {
    const r = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&limit=5&api_key=${HUNTER_KEY}`)
    const d = await r.json()
    if (d.errors || !d.data?.emails?.length) return []
    const all = d.data.emails
    const bod = all.filter((e: any) => isBOD(e.position||''))
    const use = bod.length ? bod : all.slice(0, 2)
    return use.map((e: any) => ({
      email: e.value,
      name: `${e.first_name||''} ${e.last_name||''}`.trim(),
      position: e.position||''
    }))
  } catch { return [] }
}

// GET: trả về danh sách sites + URLs cần quét
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  // action=urls&siteUrl=xxx → generate article URLs cho site đó
  if (action === 'urls') {
    const siteUrl = searchParams.get('siteUrl')
    if (!siteUrl) return NextResponse.json({ error: 'Missing siteUrl' }, { status: 400 })

    const domain = siteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')

    // Load đã quét
    const { data: site } = await supabase.from('competitor_sites').select('id').eq('url', siteUrl).single()
    const { data: crawled } = site
      ? await supabase.from('crawled_pages').select('page_url').eq('site_id', site.id)
      : { data: [] }
    const crawledUrls = (crawled||[]).map((r: any) => r.page_url)

    // Claude generate URLs
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Generate 5 realistic full URLs of recent sponsored/press-release articles on ${domain} about small/mid crypto projects.

Use actual URL patterns for ${domain}. Examples:
- zycrypto.com/press-release/slug-here/
- cryptotimes.io/press-release/slug-here/
- blockchainreporter.net/press-release/slug-here/
- livebitcoinnews.com/press-releases/slug-here/
- tronweekly.com/press-release/slug-here/
- analyticsinsight.net/press-release-2025/slug-here/
- coindoo.com/press-release/slug-here/
- globenewswire.com/news-release/2026/05/10/XXXXXXX/0/en/slug.html

Make slugs realistic: project-name + action (launches, announces, raises, completes, integrates, lists).
Skip: ${crawledUrls.slice(0,3).join(', ')||'none'}

Return ONLY JSON: {"urls":["https://...","https://..."]}`
      }]
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    try {
      const p = JSON.parse(raw.replace(/```json|```/g, '').trim())
      const urls = (p.urls||[]).filter((u: string) => u.startsWith('http') && !crawledUrls.includes(u))
      return NextResponse.json({ urls, domain })
    } catch {
      return NextResponse.json({ urls: [], domain })
    }
  }

  // Default: danh sách sites
  const { data: sites } = await supabase
    .from('competitor_sites')
    .select('*, crawled_pages(count)')
    .order('last_crawled_at', { ascending: false, nullsFirst: false })
  return NextResponse.json({ sites: sites||[] })
}

// POST: xử lý 1 article URL → extract email + Hunter BOD
export async function POST(req: NextRequest) {
  const body = await req.json()

  // Mode 1: Xử lý 1 article cụ thể
  if (body.articleUrl) {
    const { articleUrl, siteUrl, siteId } = body
    const hostDomain = (siteUrl||'').replace(/https?:\/\//, '').split('/')[0].replace('www.', '')

    const { data: existing } = await supabase.from('emails').select('address')
    const emailSet = new Set((existing||[]).map((e: any) => e.address.toLowerCase()))

    const logs: string[] = []
    const saved: string[] = []
    let advertiserName = '', advertiserDomain = ''

    // NGUỒN 1: Fetch + extract email từ bài viết thật
    try {
      const html = await fetchText(articleUrl)
      logs.push(`✓ Fetched ${html.length} chars`)

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `This is a PR/sponsored article. Find the CRYPTO PROJECT advertiser's contact email.
NOT emails from ${hostDomain}.
Find: MEDIA CONTACT, press@, info@, contact@, bd@, media@ of the PROJECT.

Text: ${html.slice(0, 10000)}

JSON only: {"name":"ProjectName","domain":"project.io","emails":["e@p.io"],"isCrypto":true}`
        }]
      })

      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
      const info = JSON.parse(raw.replace(/```json|```/g, '').trim())
      advertiserName = info.name || ''
      advertiserDomain = info.domain || ''

      if (!info.isCrypto && !isCrypto(info.name + ' ' + info.domain)) {
        logs.push(`⊘ Non-crypto`)
        await supabase.from('crawled_pages').insert({ site_id: siteId, page_url: articleUrl, page_title: '', emails_found: 0 })
        return NextResponse.json({ saved: [], logs, advertiserName, advertiserDomain, skipped: true })
      }

      logs.push(`Dự án: ${info.name} (${info.domain})`)
      for (const em of info.emails||[]) {
        const a = em.toLowerCase().trim()
        if (a.includes('@') && !a.includes(hostDomain) && !emailSet.has(a)) {
          await supabase.from('emails').insert({
            address: a, source_url: articleUrl,
            domain: info.domain||hostDomain, status: 'new',
            source_type: 'article', contact_name: info.name||null
          })
          emailSet.add(a); saved.push(a)
          logs.push(`→ [Bài] ${a}`)
        }
      }
    } catch (e: any) {
      logs.push(`⚠ Fetch: ${e.message}`)
    }

    // NGUỒN 2: Hunter BOD
    if (advertiserDomain && advertiserDomain !== hostDomain) {
      const hunterR = await hunterBOD(advertiserDomain)
      for (const h of hunterR) {
        if (!emailSet.has(h.email)) {
          await supabase.from('emails').insert({
            address: h.email, source_url: articleUrl,
            domain: advertiserDomain, status: 'new',
            source_type: 'hunter_bod', contact_name: h.name||null, position: h.position||null
          })
          emailSet.add(h.email); saved.push(h.email)
          logs.push(`→ [Hunter${isBOD(h.position)?'BOD👑':''}] ${h.email} (${h.name})`)
        }
      }
    }

    // Ghi nhận đã quét
    await supabase.from('crawled_pages').insert({
      site_id: siteId, page_url: articleUrl,
      page_title: advertiserName||articleUrl, emails_found: saved.length
    })

    // Update site stats
    await supabase.from('competitor_sites').update({
      last_crawled_at: new Date().toISOString(),
      total_emails_found: (existing||[]).length + saved.length,
    }).eq('id', siteId)

    return NextResponse.json({ saved, logs, advertiserName, advertiserDomain, skipped: false })
  }

  // Mode 2: Upsert site và trả về siteId (khởi tạo)
  const { siteUrl } = body
  if (!siteUrl) return NextResponse.json({ error: 'Missing siteUrl' }, { status: 400 })

  const domain = siteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')
  const { data: site } = await supabase
    .from('competitor_sites')
    .upsert({ url: siteUrl, domain, last_crawled_at: new Date().toISOString() }, { onConflict: 'url' })
    .select().single()

  return NextResponse.json({ siteId: site?.id, domain })
}

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const HUNTER_KEY = process.env.HUNTER_API_KEY

// Pattern URL thật của từng site
const SITE_PR_PATHS: Record<string, string> = {
  'zycrypto.com': '/press-release/',
  'cryptotimes.io': '/press-release/',
  'blockchainreporter.net': '/press-release/',
  'livebitcoinnews.com': '/press-releases/',
  'tronweekly.com': '/press-release/',
  'analyticsinsight.net': '/press-release-2025/',
  'coindoo.com': '/press-release/',
  'captainaltcoin.com': '/press-releases/',
  'moneycheck.com': '/press-release/',
  'optimisus.com': '/press-release/',
  'timestabloid.com': '/press-release/',
  'cryptobrowser.io': '/press-release/',
  'coingabbar.com': '/press-releases/',
  'theportugalnews.com': '/press-release/',
}

const CRYPTO_KW = ['blockchain','crypto','defi','nft','web3','token','coin','exchange',
  'wallet','bitcoin','ethereum','presale','ico','ido','dao','dex','staking',
  'airdrop','protocol','layer','dapp','gamefi','mining','altcoin','metaverse']
const BOD_TITLES = ['CEO','Co-Founder','Founder','CFO','COO','CMO','CTO',
  'Chief Executive','Chief Financial','Chief Marketing','Chief Technology',
  'President','Director','Head of','VP ','Vice President','Partner']

function isCrypto(t: string) { return CRYPTO_KW.some(k => (t||'').toLowerCase().includes(k)) }
function isBOD(t: string) { return BOD_TITLES.some(b => (t||'').toLowerCase().includes(b.toLowerCase())) }

// Extract emails trực tiếp bằng regex từ HTML
function extractEmailsRegex(html: string, excludeDomain: string): string[] {
  const emailRegex = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g
  const found = html.match(emailRegex) || []
  return [...new Set(found.filter(e =>
    !e.includes(excludeDomain) &&
    !e.includes('example.com') &&
    !e.includes('sentry.io') &&
    !e.includes('wixpress.com') &&
    !e.includes('.png') &&
    !e.includes('.jpg') &&
    e.length < 100
  ))]
}

// Fetch URL với timeout ngắn
async function quickFetch(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

// Hunter BOD nhanh
async function hunterBOD(domain: string): Promise<{ email: string; name: string; position: string }[]> {
  if (!HUNTER_KEY || !domain?.includes('.')) return []
  try {
    const r = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${domain}&limit=3&api_key=${HUNTER_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
    const d = await r.json()
    if (d.errors || !d.data?.emails?.length) return []
    const all = d.data.emails
    const bod = all.filter((e: any) => isBOD(e.position||''))
    const use = bod.length ? bod.slice(0,2) : all.slice(0,2)
    return use.map((e: any) => ({
      email: e.value,
      name: `${e.first_name||''} ${e.last_name||''}`.trim(),
      position: e.position||''
    }))
  } catch { return [] }
}

// GET action=urls: Lấy links bài PR từ trang index của site
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'urls') {
    const siteUrl = searchParams.get('siteUrl') || ''
    const domain = siteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')
    const prPath = SITE_PR_PATHS[domain] || '/press-release/'
    const indexUrl = `https://${domain}${prPath}`

    try {
      const html = await quickFetch(indexUrl)
      // Extract links bài viết từ HTML
      const linkRegex = new RegExp(`href=["'](https?://${domain}${prPath}[^"'?#]+)["']`, 'gi')
      const relRegex = new RegExp(`href=["'](${prPath}[^"'?#]+)["']`, 'gi')
      const links = new Set<string>()
      let m
      while ((m = linkRegex.exec(html)) !== null) links.add(m[1])
      while ((m = relRegex.exec(html)) !== null) links.add(`https://${domain}${m[1]}`)

      // Load đã quét
      const { data: site } = await supabase.from('competitor_sites').select('id').eq('domain', domain).single()
      const { data: crawled } = site
        ? await supabase.from('crawled_pages').select('page_url').eq('site_id', site.id)
        : { data: [] }
      const crawledSet = new Set((crawled||[]).map((r: any) => r.page_url))

      const urls = [...links].filter(u => !crawledSet.has(u)).slice(0, 8)
      return NextResponse.json({ urls, domain, indexUrl })
    } catch (e: any) {
      return NextResponse.json({ urls: [], domain, error: e.message })
    }
  }

  // Default: danh sách sites
  const { data: sites } = await supabase
    .from('competitor_sites')
    .select('*, crawled_pages(count)')
    .order('last_crawled_at', { ascending: false, nullsFirst: false })
  return NextResponse.json({ sites: sites||[] })
}

// POST mode 1: init site
// POST mode 2: process 1 article
export async function POST(req: NextRequest) {
  const body = await req.json()

  // Mode 1: Init site → trả về siteId
  if (!body.articleUrl) {
    const { siteUrl } = body
    if (!siteUrl) return NextResponse.json({ error: 'Missing siteUrl' }, { status: 400 })
    const domain = siteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')
    const { data: site } = await supabase
      .from('competitor_sites')
      .upsert({ url: siteUrl, domain, last_crawled_at: new Date().toISOString() }, { onConflict: 'url' })
      .select().single()
    return NextResponse.json({ siteId: site?.id, domain })
  }

  // Mode 2: Process 1 article URL
  const { articleUrl, siteUrl, siteId } = body
  const hostDomain = (siteUrl||'').replace(/https?:\/\//, '').split('/')[0].replace('www.', '')

  const { data: existing } = await supabase.from('emails').select('address')
  const emailSet = new Set((existing||[]).map((e: any) => e.address.toLowerCase()))

  const logs: string[] = []
  const saved: string[] = []
  let advertiserDomain = ''
  let advertiserName = ''
  let skipped = false

  try {
    // BƯỚC 1: Fetch HTML bài viết thật
    const html = await quickFetch(articleUrl)
    logs.push(`✓ Fetched ${html.length} chars`)

    // BƯỚC 2: Extract emails bằng regex (nhanh, không cần Claude)
    const strippedText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
    const rawEmails = extractEmailsRegex(strippedText, hostDomain)

    // BƯỚC 3: Dùng Claude classify — project name, domain, có crypto không
    // (Chỉ cần 1 lần, nhẹ hơn)
    if (rawEmails.length > 0 || strippedText.length > 500) {
      const snippet = strippedText.replace(/\s+/g, ' ').slice(0, 5000)
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `From this press release on ${hostDomain}, identify:
1. The ADVERTISER (crypto project that paid for this article)
2. Their domain
3. Is it a crypto project?
Emails found by regex: ${rawEmails.join(', ')||'none'}

Snippet: ${snippet.slice(0,3000)}

Return JSON only:
{"name":"ProjectName","domain":"project.io","isCrypto":true,"validEmails":["email@project.io"]}`
        }]
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
      try {
        const info = JSON.parse(raw.replace(/```json|```/g,'').trim())
        advertiserName = info.name || ''
        advertiserDomain = info.domain || ''

        if (!info.isCrypto && !isCrypto(info.name + ' ' + info.domain)) {
          logs.push(`⊘ Non-crypto`)
          skipped = true
        } else {
          logs.push(`Dự án: ${info.name} (${info.domain})`)
          // Dùng emails đã được validate bởi Claude
          for (const em of (info.validEmails || rawEmails)) {
            const a = em.toLowerCase().trim()
            if (a.includes('@') && !a.includes(hostDomain) && !emailSet.has(a)) {
              await supabase.from('emails').insert({
                address: a, source_url: articleUrl,
                domain: advertiserDomain||hostDomain, status: 'new',
                source_type: 'article', contact_name: advertiserName||null
              })
              emailSet.add(a); saved.push(a)
              logs.push(`→ [Bài] ${a}`)
            }
          }
        }
      } catch {}
    }

    // BƯỚC 4: Hunter BOD (song song nếu có domain)
    if (!skipped && advertiserDomain && advertiserDomain !== hostDomain) {
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
  } catch (e: any) {
    logs.push(`⚠ ${e.message}`)
    skipped = true
  }

  // Ghi nhận đã quét dù có email hay không
  await supabase.from('crawled_pages').insert({
    site_id: siteId, page_url: articleUrl,
    page_title: advertiserName||articleUrl, emails_found: saved.length
  }).select()

  if (siteId) {
    await supabase.from('competitor_sites').update({
      last_crawled_at: new Date().toISOString(),
      total_emails_found: (existing?.length||0) + saved.length,
    }).eq('id', siteId)
  }

  return NextResponse.json({ saved, logs, advertiserName, advertiserDomain, skipped })
}

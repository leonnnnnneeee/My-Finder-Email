export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const HUNTER_KEY = process.env.HUNTER_API_KEY

// URL paths thật của từng site - v1779090625
const PR_PATHS: Record<string, string[]> = {
  'zycrypto.com':           ['/category/press-releases/', '/category/sponsored/'],
  'cryptotimes.io':         ['/category/press-release/', '/category/sponsored/'],
  'blockchainreporter.net': ['/press-releases/', '/category/press-release/'],
  'livebitcoinnews.com':    ['/category/press-releases/', '/category/latest-crypto-news/'],
  'tronweekly.com':         ['/category/press-release/', '/'],
  'analyticsinsight.net':   ['/category/press-release/', '/category/cryptocurrency/'],
  'coindoo.com':            ['/category/press-release/', '/category/sponsored/'],
  'captainaltcoin.com':     ['/category/press-releases/', '/'],
  'moneycheck.com':         ['/category/press-release/', '/'],
  'optimisus.com':          ['/category/press-release/', '/'],
  'timestabloid.com':       ['/category/press-release/', '/category/crypto/'],
  'cryptobrowser.io':       ['/category/press-release/', '/'],
  'coingabbar.com':         ['/category/press-release/', '/crypto-news/'],
  'theportugalnews.com':    ['/category/press-release/', '/'],
  'globenewswire.com':      ['/en/search/keyword/crypto/press-release', '/en/search/keyword/blockchain'],
  'crypto.news':            ['/press-releases/', '/tag/press-release/'],
  'coinmarketcap.com':      ['/community/articles/'],
  'crunchbase.com':         ['/hub/cryptocurrency-companies'],
}

const CRYPTO_KW = ['blockchain','crypto','defi','nft','web3','token','coin','exchange',
  'wallet','bitcoin','ethereum','presale','ico','ido','dao','dex','staking',
  'airdrop','protocol','dapp','gamefi','mining','altcoin','metaverse']

const BOD_TITLES = ['CEO','Co-Founder','Founder','CFO','COO','CMO','CTO',
  'Chief Executive','Chief Financial','Chief Marketing','Chief Technology',
  'President','Director','Head of','VP ','Vice President','Partner']

function isCrypto(t: string) { return CRYPTO_KW.some(k => (t||'').toLowerCase().includes(k)) }
function isBOD(t: string) { return BOD_TITLES.some(b => (t||'').toLowerCase().includes(b.toLowerCase())) }

// Extract emails bằng regex - không dùng Claude
function extractEmails(text: string, excludeDomain: string): string[] {
  const emailRe = /[\w.+%-]{1,64}@[\w-]+\.[\w.]{2,}/g
  const found = text.match(emailRe) || []
  return [...new Set(found.filter(e =>
    !e.toLowerCase().includes(excludeDomain.replace('www.','').split('.')[0]) &&
    !e.includes('example.') && !e.includes('sentry.') &&
    !e.includes('wix') && !e.includes('wordpress') &&
    !e.match(/\.(png|jpg|gif|svg|css|js)$/) &&
    e.length < 80 && e.includes('.')
  ))]
}

// Fetch nhanh
async function quickFetch(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    signal: AbortSignal.timeout(5000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const html = await r.text()
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 25000)
}

// Hunter BOD
async function hunterBOD(domain: string): Promise<{email:string;name:string;position:string}[]> {
  if (!HUNTER_KEY || !domain?.includes('.')) return []
  try {
    const r = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${domain}&limit=3&api_key=${HUNTER_KEY}`,
      { signal: AbortSignal.timeout(4000) }
    )
    const d = await r.json()
    if (d.errors || !d.data?.emails?.length) return []
    const all = d.data.emails
    const bod = all.filter((e:any)=>isBOD(e.position||''))
    const use = bod.length ? bod.slice(0,2) : all.slice(0,2)
    return use.map((e:any)=>({
      email: e.value,
      name: `${e.first_name||''} ${e.last_name||''}`.trim(),
      position: e.position||''
    }))
  } catch { return [] }
}

// GET action=urls: lấy article links từ category page
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  if (searchParams.get('action') === 'urls') {
    const siteUrl = searchParams.get('siteUrl') || ''
    const domain = siteUrl.replace(/https?:\/\//,'').split('/')[0].replace('www.','')
    const paths = PR_PATHS[domain] || ['/category/press-release/']

    const { data: site } = await supabase.from('competitor_sites').select('id').eq('domain', domain).maybeSingle()
    const { data: crawled } = site
      ? await supabase.from('crawled_pages').select('page_url').eq('site_id', site.id)
      : { data: [] }
    const crawledSet = new Set((crawled||[]).map((r:any)=>r.page_url))

    const allLinks = new Set<string>()
    const errors: string[] = []

    for (const path of paths.slice(0,2)) {
      try {
        const indexUrl = `https://${domain}${path}`
        const html = await quickFetch(indexUrl)

        // Extract article links
        const re1 = new RegExp(`href=["'](https?://(?:www\\.)?${domain.replace(/\./g,'\\.')}[^"'?#]{10,})["']`,'gi')
        const re2 = /href=["'](\/[^"'?#]{10,})["']/gi
        let m

        while ((m = re1.exec(html)) !== null) {
          const u = m[1]
          if (!u.match(/\.(png|jpg|gif|svg|css|js|xml|pdf|zip|php)(\?|$)/i) &&
              !u.match(/\/(category|tag|author|page|feed|wp-|xmlrpc|search|wp-content|wp-json|comments)/) &&
              !u.endsWith('/') || u.split('/').filter(Boolean).length > 2) {
            allLinks.add(u)
          }
        }
        while ((m = re2.exec(html)) !== null) {
          const u = `https://${domain}${m[1]}`
          if (!u.match(/\.(png|jpg|gif|svg|css|js|xml|pdf|zip|php)(\?|$)/i) &&
              !u.match(/\/(category|tag|author|page|feed|wp-|xmlrpc|search|wp-content|wp-json|comments)/)) {
            allLinks.add(u)
          }
        }
      } catch(e:any) {
        errors.push(`${path}: ${e.message}`)
      }
    }

    const urls = [...allLinks].filter(u=>!crawledSet.has(u)).slice(0,10)
    return NextResponse.json({ urls, domain, errors })
  }

  // GET default: danh sách sites
  const { data: sites } = await supabase
    .from('competitor_sites')
    .select('id, url, domain, last_crawled_at, total_pages_crawled, total_emails_found')
    .order('domain', { ascending: true })
  return NextResponse.json({ sites: sites||[] })
}

// POST: init site hoặc process 1 article
export async function POST(req: NextRequest) {
  const body = await req.json()

  // Mode init: upsert site, trả về siteId
  if (!body.articleUrl) {
    const { siteUrl } = body
    if (!siteUrl) return NextResponse.json({ error: 'Missing siteUrl' }, { status: 400 })
    const domain = siteUrl.replace(/https?:\/\//,'').split('/')[0].replace('www.','')
    const { data: site } = await supabase
      .from('competitor_sites')
      .upsert({ url: siteUrl, domain, last_crawled_at: new Date().toISOString() }, { onConflict: 'url' })
      .select().single()
    return NextResponse.json({ siteId: site?.id, domain })
  }

  // Mode process: xử lý 1 article URL
  const { articleUrl, siteUrl, siteId } = body
  const hostDomain = (siteUrl||'').replace(/https?:\/\//,'').split('/')[0].replace('www.','')

  const { data: existing } = await supabase.from('emails').select('address')
  const emailSet = new Set((existing||[]).map((e:any)=>e.address.toLowerCase()))

  const logs: string[] = []
  const saved: string[] = []
  let advertiserDomain = ''
  let advertiserName = ''
  let skipped = false

  try {
    const text = await quickFetch(articleUrl)
    logs.push(`✓ Fetched ${text.length} chars`)

    // Regex extract emails trực tiếp - nhanh, không cần Claude
    const emails = extractEmails(text, hostDomain)
    logs.push(`  Emails found: ${emails.length} → ${emails.slice(0,3).join(', ')||'none'}`)

    // Detect nếu không phải crypto dựa trên content
    if (!isCrypto(text.slice(0,3000))) {
      logs.push(`  ⊘ Không phải bài crypto`)
      skipped = true
    }

    if (!skipped) {
      // Extract domain từ email để dùng cho Hunter
      if (emails.length > 0) {
        advertiserDomain = emails[0].split('@')[1] || ''
      }
      // Cố extract tên dự án từ title/heading trong text
      const titleMatch = text.match(/(?:<h1|<title)[^>]*>([^<]{5,80})/i)
      advertiserName = titleMatch ? titleMatch[1].trim().slice(0,60) : ''

      // Collect emails từ bài viết
      for (const em of emails) {
        const a = em.toLowerCase()
        if (!emailSet.has(a) && !a.includes(hostDomain.split('.')[0])) {
          await supabase.from('emails').insert({
            address: a, source_url: articleUrl,
            domain: a.split('@')[1]||hostDomain,
            status: 'new', source_type: 'article',
            contact_name: advertiserName||null
          })
          emailSet.add(a); saved.push(a)
          logs.push(`  → [Bài] ${a}`)
        }
      }
    }
  } catch(e:any) {
    logs.push(`  ⚠ Fetch: ${e.message}`)
    skipped = true
  }

  // Hunter BOD nếu có domain và chưa skipped
  if (!skipped && advertiserDomain && advertiserDomain !== hostDomain) {
    try {
      const hunterR = await hunterBOD(advertiserDomain)
      for (const h of hunterR) {
        if (h.email && !emailSet.has(h.email)) {
          await supabase.from('emails').insert({
            address: h.email, source_url: articleUrl,
            domain: advertiserDomain, status: 'new',
            source_type: 'hunter_bod',
            contact_name: h.name||null, position: h.position||null
          })
          emailSet.add(h.email); saved.push(h.email)
          logs.push(`  → [Hunter${isBOD(h.position)?'👑':''}] ${h.email} (${h.name})`)
        }
      }
    } catch {}
  }

  // Ghi nhận crawled
  await supabase.from('crawled_pages').insert({
    site_id: siteId, page_url: articleUrl,
    page_title: advertiserName||articleUrl.split('/').pop()||'',
    emails_found: saved.length
  }).select()

  // Update site stats
  if (siteId) {
    const { count } = await supabase.from('crawled_pages').select('*', {count:'exact',head:true}).eq('site_id', siteId)
    await supabase.from('competitor_sites').update({
      last_crawled_at: new Date().toISOString(),
      total_pages_crawled: count||0,
      total_emails_found: emailSet.size,
    }).eq('id', siteId)
  }

  return NextResponse.json({ saved, logs, advertiserName, advertiserDomain, skipped })
}

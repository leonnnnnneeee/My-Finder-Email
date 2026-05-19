export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const HUNTER_KEY = process.env.HUNTER_API_KEY

// RSS/Sitemap feeds thật — không bị block như HTML pages
const SITE_FEEDS: Record<string, string[]> = {
  'zycrypto.com':           ['https://zycrypto.com/feed/', 'https://zycrypto.com/category/press-releases/feed/'],
  'cryptotimes.io':         ['https://www.cryptotimes.io/feed/', 'https://www.cryptotimes.io/category/press-release/feed/'],
  'blockchainreporter.net': ['https://blockchainreporter.net/feed/', 'https://blockchainreporter.net/press-releases/feed/'],
  'livebitcoinnews.com':    ['https://livebitcoinnews.com/feed/', 'https://livebitcoinnews.com/category/press-releases/feed/'],
  'tronweekly.com':         ['https://www.tronweekly.com/feed/', 'https://www.tronweekly.com/category/press-release/feed/'],
  'analyticsinsight.net':   ['https://analyticsinsight.net/feed/', 'https://analyticsinsight.net/category/press-release/feed/'],
  'coindoo.com':            ['https://coindoo.com/feed/', 'https://coindoo.com/category/press-release/feed/'],
  'captainaltcoin.com':     ['https://captainaltcoin.com/feed/', 'https://captainaltcoin.com/category/press-releases/feed/'],
  'moneycheck.com':         ['https://moneycheck.com/feed/'],
  'optimisus.com':          ['https://optimisus.com/feed/'],
  'timestabloid.com':       ['https://timestabloid.com/feed/'],
  'cryptobrowser.io':       ['https://cryptobrowser.io/feed/'],
  'coingabbar.com':         ['https://www.coingabbar.com/feed/'],
  'theportugalnews.com':    ['https://theportugalnews.com/feed/'],
  'globenewswire.com':      ['https://www.globenewswire.com/RssFeed/country/WORLD/lang/en/industry/1/keyword/crypto'],
  'crypto.news':            ['https://crypto.news/feed/'],
  'coinmarketcap.com':      ['https://coinmarketcap.com/community/articles/feed/'],
  'crunchbase.com':         ['https://news.crunchbase.com/feed/'],
}

const CRYPTO_KW = ['blockchain','crypto','defi','nft','web3','token','coin','exchange',
  'wallet','bitcoin','ethereum','presale','ico','ido','dao','dex','staking',
  'airdrop','protocol','dapp','gamefi','mining','altcoin','metaverse']
const BOD_TITLES = ['CEO','Co-Founder','Founder','CFO','COO','CMO','CTO',
  'Chief Executive','Chief Financial','Chief Marketing','Chief Technology',
  'President','Director','Head of','VP ','Vice President','Partner']

function isCrypto(t: string) { return CRYPTO_KW.some(k => (t||'').toLowerCase().includes(k)) }
function isBOD(t: string) { return BOD_TITLES.some(b => (t||'').toLowerCase().includes(b.toLowerCase())) }

function extractEmails(text: string, excludeDomain: string): string[] {
  const emailRe = /[\w.+%-]{1,64}@[\w-]+\.[\w.]{2,}/g
  const found = text.match(emailRe) || []
  const excludeBase = excludeDomain.replace('www.','').split('.')[0]
  return [...new Set(found.filter(e =>
    !e.toLowerCase().includes(excludeBase) &&
    !e.includes('example.') && !e.includes('sentry.') &&
    !e.includes('wix') && !e.includes('wordpress') &&
    !e.match(/\.(png|jpg|gif|svg|css|js)$/i) &&
    e.length < 80 && e.includes('@') && e.includes('.')
  ))]
}

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FeedParser/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

async function fetchArticle(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 20000)
}

// Parse RSS feed → lấy article URLs + email từ description
function parseRSS(xml: string, hostDomain: string): { url: string; title: string; emails: string[] }[] {
  const items: { url: string; title: string; emails: string[] }[] = []
  const itemRe = /<item[\s\S]*?<\/item>/gi
  let m
  while ((m = itemRe.exec(xml)) !== null) {
    const item = m[0]
    const linkMatch = item.match(/<link>([^<]+)<\/link>/) || item.match(/<guid[^>]*>([^<]+)<\/guid>/)
    const titleMatch = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)
    if (!linkMatch) continue
    const url = linkMatch[1].trim()
    const title = (titleMatch?.[1] || '').replace(/\s+/g, ' ').trim()
    // Extract emails từ RSS description/content
    const emails = extractEmails(item, hostDomain)
    items.push({ url, title, emails })
  }
  return items
}

async function hunterBOD(domain: string): Promise<{ email: string; name: string; position: string }[]> {
  if (!HUNTER_KEY || !domain?.includes('.')) return []
  try {
    const r = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${domain}&limit=3&api_key=${HUNTER_KEY}`,
      { signal: AbortSignal.timeout(4000) }
    )
    const d = await r.json()
    if (d.errors || !d.data?.emails?.length) return []
    const all = d.data.emails
    const bod = all.filter((e: any) => isBOD(e.position || ''))
    const use = bod.length ? bod.slice(0, 2) : all.slice(0, 2)
    return use.map((e: any) => ({
      email: e.value,
      name: `${e.first_name||''} ${e.last_name||''}`.trim(),
      position: e.position || ''
    }))
  } catch { return [] }
}

// GET ?action=urls → lấy article URLs từ RSS feed
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  if (searchParams.get('action') === 'urls') {
    const siteUrl = searchParams.get('siteUrl') || ''
    const domain = siteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')
    const feeds = SITE_FEEDS[domain] || [`https://${domain}/feed/`]

    const { data: site } = await supabase.from('competitor_sites').select('id').eq('domain', domain).maybeSingle()
    const { data: crawled } = site
      ? await supabase.from('crawled_pages').select('page_url').eq('site_id', site.id)
      : { data: [] }
    const crawledSet = new Set((crawled || []).map((r: any) => r.page_url))

    const articleMap = new Map<string, { title: string; emails: string[] }>()
    const errors: string[] = []

    for (const feedUrl of feeds.slice(0, 2)) {
      try {
        const xml = await fetchFeed(feedUrl)
        const items = parseRSS(xml, domain)
        for (const item of items) {
          if (item.url && item.url.startsWith('http') && !crawledSet.has(item.url)) {
            articleMap.set(item.url, { title: item.title, emails: item.emails })
          }
        }
      } catch (e: any) {
        errors.push(`${feedUrl}: ${e.message}`)
      }
    }

    const urls = [...articleMap.keys()].slice(0, 10)
    // Cũng trả về emails đã extract từ RSS (nhanh, không cần fetch thêm)
    const preloadedEmails = Object.fromEntries(articleMap)
    return NextResponse.json({ urls, domain, errors, preloadedEmails })
  }

  // GET default: danh sách sites
  const { data: sites } = await supabase
    .from('competitor_sites')
    .select('id, url, domain, last_crawled_at, total_pages_crawled, total_emails_found')
    .order('domain', { ascending: true })
  return NextResponse.json({ sites: sites || [] })
}

// POST: init site hoặc process 1 article
export async function POST(req: NextRequest) {
  const body = await req.json()

  // Init site
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

  // Process 1 article
  const { articleUrl, siteUrl, siteId, preloadedEmails } = body
  const hostDomain = (siteUrl || '').replace(/https?:\/\//, '').split('/')[0].replace('www.', '')

  const { data: existing } = await supabase.from('emails').select('address')
  const emailSet = new Set((existing || []).map((e: any) => e.address.toLowerCase()))

  const logs: string[] = []
  const saved: string[] = []
  let advertiserDomain = ''
  let advertiserName = ''
  let skipped = false

  // Dùng emails đã extract từ RSS nếu có (không cần fetch thêm)
  let rssEmails: string[] = preloadedEmails?.[articleUrl]?.emails || []
  advertiserName = preloadedEmails?.[articleUrl]?.title || ''

  // Nếu RSS không có email → fetch article thật
  if (rssEmails.length === 0) {
    try {
      const text = await fetchArticle(articleUrl)
      logs.push(`✓ Fetched article ${text.length} chars`)
      rssEmails = extractEmails(text, hostDomain)
      logs.push(`  Regex found: ${rssEmails.length} email(s)`)

      // Detect non-crypto
      if (!isCrypto(text.slice(0, 3000)) && !isCrypto(advertiserName)) {
        logs.push(`  ⊘ Non-crypto`)
        skipped = true
      }
    } catch (e: any) {
      logs.push(`  ⚠ Fetch: ${e.message}`)
    }
  } else {
    logs.push(`✓ RSS preloaded: ${rssEmails.length} email(s) từ feed`)
    if (!isCrypto(advertiserName) && !rssEmails.some(e => isCrypto(e))) {
      // Vẫn tiếp tục — RSS emails thường là contact của dự án
    }
  }

  if (!skipped && rssEmails.length > 0) {
    for (const em of rssEmails) {
      const a = em.toLowerCase()
      if (!emailSet.has(a) && !a.includes(hostDomain.split('.')[0])) {
        advertiserDomain = a.split('@')[1] || ''
        await supabase.from('emails').insert({
          address: a,
          source_url: articleUrl,
          domain: advertiserDomain || hostDomain,
          status: 'new',
          source_type: 'article',
          contact_name: advertiserName || null,
        })
        emailSet.add(a)
        saved.push(a)
        logs.push(`  → [Bài] ${a}`)
      }
    }
  }

  // Hunter BOD với domain advertiser
  if (!skipped && advertiserDomain && advertiserDomain !== hostDomain) {
    try {
      const hunterR = await hunterBOD(advertiserDomain)
      for (const h of hunterR) {
        if (h.email && !emailSet.has(h.email)) {
          await supabase.from('emails').insert({
            address: h.email,
            source_url: articleUrl,
            domain: advertiserDomain,
            status: 'new',
            source_type: 'hunter_bod',
            contact_name: h.name || null,
            position: h.position || null,
          })
          emailSet.add(h.email)
          saved.push(h.email)
          logs.push(`  → [Hunter${isBOD(h.position) ? 'BOD👑' : ''}] ${h.email}`)
        }
      }
    } catch {}
  }

  // Ghi nhận đã quét
  await supabase.from('crawled_pages').insert({
    site_id: siteId,
    page_url: articleUrl,
    page_title: advertiserName || articleUrl.split('/').pop() || '',
    emails_found: saved.length,
  }).select()

  if (siteId) {
    const { count } = await supabase
      .from('crawled_pages')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)
    await supabase.from('competitor_sites').update({
      last_crawled_at: new Date().toISOString(),
      total_pages_crawled: count || 0,
      total_emails_found: emailSet.size,
    }).eq('id', siteId)
  }

  return NextResponse.json({ saved, logs, advertiserName, advertiserDomain, skipped })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const HUNTER_KEY = process.env.HUNTER_API_KEY

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
  'airdrop','protocol','dapp','gamefi','mining','altcoin','metaverse','bsc','solana']

const BOD_TITLES = ['CEO','Co-Founder','Founder','CFO','COO','CMO','CTO',
  'Chief Executive','Chief Financial','Chief Marketing','Chief Technology',
  'President','Director','Head of','VP ','Vice President','Partner']

function isCrypto(t: string) {
  const low = (t || '').toLowerCase()
  return CRYPTO_KW.some(k => low.includes(k))
}

function isBOD(t: string) {
  return BOD_TITLES.some(b => (t || '').toLowerCase().includes(b.toLowerCase()))
}

function extractEmails(text: string, excludeDomain: string): string[] {
  const emailRe = /[\w.+%-]{1,64}@[\w-]+\.[\w.]{2,}/g
  const found = text.match(emailRe) || []
  const excludeBase = excludeDomain.replace('www.', '').split('.')[0]
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
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FeedParser/1.0)', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
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
    const title = (titleMatch?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 150)
    const emails = extractEmails(item, hostDomain)
    if (url.startsWith('http')) items.push({ url, title, emails })
  }
  return items
}

async function hunterBOD(domain: string): Promise<{ email: string; name: string; position: string }[]> {
  if (!HUNTER_KEY || !domain?.includes('.')) return []
  try {
    const r = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${domain}&limit=5&api_key=${HUNTER_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
    const d = await r.json()
    if (d.errors || !d.data?.emails?.length) return []
    const all = d.data.emails
    const bod = all.filter((e: any) => isBOD(e.position || ''))
    const use = bod.length ? bod.slice(0, 3) : all.slice(0, 2)
    return use.map((e: any) => ({
      email: e.value,
      name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
      position: e.position || ''
    }))
  } catch { return [] }
}

// GET ?action=urls → lấy article URLs từ RSS
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  if (searchParams.get('action') === 'urls') {
    const siteUrl = searchParams.get('siteUrl') || ''
    const domain = siteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')
    const feeds = SITE_FEEDS[domain] || [`https://${domain}/feed/`]

    // Lấy danh sách đã quét để bỏ qua
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
          if (!crawledSet.has(item.url)) {
            articleMap.set(item.url, { title: item.title, emails: item.emails })
          }
        }
      } catch (e: any) {
        errors.push(`${feedUrl}: ${e.message}`)
      }
    }

    // Special handling for listing sites - use Hunter.io to find emails from new projects
    const LISTING_SITES = ['cryptorank.io', 'coinmarketcap.com', 'crunchbase.com']
    if (LISTING_SITES.includes(domain)) {
      // Fetch newly listed projects from their API/RSS
      const projectDomains: string[] = []
      const listingErrors: string[] = []
      
      const listingFeeds: Record<string, string> = {
        'cryptorank.io': 'https://cryptorank.io/api/v1/currencies?limit=20&sortBy=addedAt&sortDirection=desc',
        'coinmarketcap.com': 'https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing/recent?limit=20',
        'crunchbase.com': 'https://news.crunchbase.com/feed/',
      }
      
      try {
        if (domain === 'cryptorank.io') {
          // Dùng RSS feed CryptoRank ICO/IDO
          const feeds = [
            'https://cryptorank.io/ico-calendar/rss',
            'https://cryptorank.io/funding-rounds/rss',
          ]
          for (const feedUrl of feeds) {
            try {
              const r = await fetch(feedUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FeedParser/1.0)' }, signal: AbortSignal.timeout(5000) })
              if (r.ok) {
                const xml = await r.text()
                const linkRe = /<link>([^<]+)<\/link>/g
                let m
                while ((m = linkRe.exec(xml)) !== null) {
                  const url = m[1].trim()
                  if (url.includes('cryptorank.io/currencies/')) {
                    const slug = url.split('/currencies/')[1]?.split('/')[0]
                    if (slug) projectDomains.push(slug.replace(/-/g, '') + '.io')
                  }
                }
              }
            } catch {}
          }
          // Fallback: scrape trang web
          if (projectDomains.length === 0) {
            const r = await fetch('https://cryptorank.io/ico', { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }, signal: AbortSignal.timeout(6000) })
            if (r.ok) {
              const html = await r.text()
              const websiteRe = /href=["'](https?:\/\/(?!cryptorank)[\w.-]+\.[\w]{2,})[/"']/g
              let wm
              const seen = new Set<string>()
              const BLOCKED_DOMAINS = ['x.com','twitter.com','t.me','telegram.org','linkedin.com','discord.com','discord.gg','github.com','medium.com','reddit.com','youtube.com','facebook.com','instagram.com','tiktok.com','google.com','apple.com','play.google.com','coinmarketcap.com','coingecko.com','cryptorank.io','opensea.io','uniswap.org']
            while ((wm = websiteRe.exec(html)) !== null) {
              const dom = wm[1].replace(/https?:\/\//, '').split('/')[0].replace('www.', '').toLowerCase()
              if (dom && dom.includes('.') && !seen.has(dom) && !BLOCKED_DOMAINS.some(b => dom.includes(b))) {
                seen.add(dom)
                projectDomains.push(dom)
                if (projectDomains.length >= 15) break
              }
            }
            }
          }
        } else if (domain === 'coinmarketcap.com') {
          // Dùng CoinGecko API public thay CMC (không bị block)
          const r = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=false', {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
            signal: AbortSignal.timeout(6000)
          })
          // Fallback: dùng CoinGecko recently added
          const r2 = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=id_desc&per_page=20&page=1&sparkline=false', {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
            signal: AbortSignal.timeout(6000)
          })
          if (r2.ok) {
            const coins = await r2.json()
            const BLOCKED = ['x.com','t.me','twitter.com','linkedin.com','discord','github','medium','reddit','youtube','telegram','coingecko','coinmarketcap']
            for (const coin of (coins || []).slice(0, 20)) {
              if (coin.id) {
                // Fetch coin details to get website
                try {
                  const detailR = await fetch(`https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`, {
                    headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(4000)
                  })
                  if (detailR.ok) {
                    const detail = await detailR.json()
                    const websites = detail.links?.homepage?.filter((u: string) => u && u.startsWith('http')) || []
                    for (const site of websites) {
                      const dom = site.replace(/https?:\/\//, '').split('/')[0].replace('www.', '').toLowerCase()
                      if (dom && dom.includes('.') && !BLOCKED.some(b => dom.includes(b)) && projectDomains.length < 15) {
                        projectDomains.push(dom)
                      }
                    }
                  }
                } catch {}
                if (projectDomains.length >= 5) break // Giới hạn để tránh rate limit
              }
            }
          }
        } else if (domain === 'crunchbase.com') {
          // Scrape Crunchbase news RSS
          const r = await fetch('https://news.crunchbase.com/feed/', { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FeedParser/1.0)' }, signal: AbortSignal.timeout(6000) })
          if (r.ok) {
            const xml = await r.text()
            const linkRe = /<link>([^<]+)<\/link>/g
            let m
            while ((m = linkRe.exec(xml)) !== null) {
              const url = m[1].trim()
              if (url.startsWith('https://') && !url.includes('crunchbase')) {
                const dom = url.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')
                if (dom && dom.includes('.')) projectDomains.push(dom)
              }
            }
          }
        }
      } catch (e: any) {
        listingErrors.push(e.message)
      }
      
      // Use project domains as "URLs" - will be processed by Hunter.io in POST
      const syntheticUrls = projectDomains.map(d => `hunter://${d}`)
      const preloaded: Record<string, {title: string; emails: string[]}> = {}
      for (const d of projectDomains) {
        preloaded[`hunter://${d}`] = { title: d.split('.')[0], emails: [] }
      }
      
      return NextResponse.json({ urls: syntheticUrls, domain, errors: listingErrors, preloadedEmails: preloaded, isListingSite: true })
    }

    const urls = [...articleMap.keys()].slice(0, 10)
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

// POST: init site hoặc xử lý 1 article
export async function POST(req: NextRequest) {
  const body = await req.json()

  // Init site (không có articleUrl)
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

  // Xử lý 1 article
  const { articleUrl, siteUrl, siteId, preloadedEmails, dryRun } = body
  const hostDomain = (siteUrl || '').replace(/https?:\/\//, '').split('/')[0].replace('www.', '')

  // Special: Hunter-only mode for listing sites (cryptorank, CMC)
  if (articleUrl?.startsWith('hunter://')) {
    const targetDomain = articleUrl.replace('hunter://', '')
    const projectName = preloadedEmails?.[articleUrl]?.title || targetDomain.split('.')[0]
    const found: { addr: string; src: string; name: string; domain: string; pos: string }[] = []
    const logs: string[] = [`🎯 Hunter search: ${targetDomain}`]
    
    try {
      const hunterResults = await hunterBOD(targetDomain)
      const { data: existing } = await supabase.from('emails').select('address')
      const emailSet = new Set((existing || []).map((e: any) => e.address.toLowerCase()))
      
      for (const h of hunterResults) {
        if (!h.email) continue
        found.push({ addr: h.email, src: 'hunter_bod', name: h.name, domain: targetDomain, pos: h.position })
        logs.push(`  → [Hunter${isBOD(h.position) ? 'BOD👑' : ''}] ${h.email} (${h.name})`)
        if (!dryRun && !emailSet.has(h.email)) {
          await supabase.from('emails').insert({
            address: h.email, source_url: `https://${targetDomain}`,
            domain: targetDomain, status: 'new',
            source_type: 'hunter_bod', contact_name: h.name || null, position: h.position || null,
          })
        }
      }
      if (hunterResults.length === 0) logs.push('  — No emails found')
    } catch (e: any) {
      logs.push(`  ⚠ ${e.message}`)
    }

    if (!dryRun && siteId) {
      await supabase.from('crawled_pages').insert({
        site_id: siteId, page_url: articleUrl,
        page_title: projectName, emails_found: found.length,
      }).select()
    }

    return NextResponse.json({ found, saved: dryRun ? [] : found.map(f => f.addr), logs, advertiserName: projectName, advertiserDomain: targetDomain, skipped: false })
  }

  const logs: string[] = []
  // found = emails hiển thị cho user review (dryRun + normal)
  const found: { addr: string; src: string; name: string; domain: string; pos: string }[] = []
  // saved = emails đã ghi vào DB (chỉ khi !dryRun)
  const saved: string[] = []
  let advertiserDomain = ''
  let advertiserName = ''
  let skipped = false

  // Lấy emails đã có trong DB để tránh trùng (chỉ dùng cho !dryRun)
  const { data: existing } = await supabase.from('emails').select('address')
  const emailSet = new Set((existing || []).map((e: any) => e.address.toLowerCase()))

  // Lấy emails từ RSS preloaded nếu có
  let rssEmails: string[] = preloadedEmails?.[articleUrl]?.emails || []
  advertiserName = preloadedEmails?.[articleUrl]?.title || ''

  // Nếu RSS không có → fetch article thật
  if (rssEmails.length === 0) {
    try {
      const text = await fetchArticle(articleUrl)
      logs.push(`✓ Fetched ${text.length} chars`)
      rssEmails = extractEmails(text, hostDomain)
      logs.push(`  Regex: ${rssEmails.length} email(s)`)
      // Detect non-crypto
      if (!isCrypto(text.slice(0, 3000)) && !isCrypto(advertiserName)) {
        logs.push(`  ⊘ Non-crypto, bỏ qua`)
        skipped = true
      }
    } catch (e: any) {
      logs.push(`  ⚠ ${e.message}`)
      skipped = true
    }
  } else {
    logs.push(`✓ RSS preloaded: ${rssEmails.length} email(s)`)
  }

  // Xử lý emails từ bài PR
  if (!skipped && rssEmails.length > 0) {
    for (const em of rssEmails) {
      const a = em.toLowerCase()
      if (a.includes(hostDomain.split('.')[0])) continue // bỏ email của chính site
      advertiserDomain = a.split('@')[1] || ''
      // Luôn add vào found (để user xem)
      found.push({ addr: a, src: 'article', name: advertiserName, domain: advertiserDomain, pos: '' })
      logs.push(`  → [Bài] ${a}`)
      // Chỉ save DB khi không dryRun và chưa có
      if (!dryRun && !emailSet.has(a)) {
        await supabase.from('emails').insert({
          address: a, source_url: articleUrl,
          domain: advertiserDomain, status: 'new',
          source_type: 'article', contact_name: advertiserName || null,
        })
        emailSet.add(a)
        saved.push(a)
      }
    }
  }

  // Hunter BOD
  if (!skipped && advertiserDomain && advertiserDomain !== hostDomain) {
    try {
      const hunterResults = await hunterBOD(advertiserDomain)
      for (const h of hunterResults) {
        if (!h.email) continue
        const a = h.email.toLowerCase()
        // Luôn add vào found (để user xem)
        found.push({ addr: a, src: 'hunter_bod', name: h.name, domain: advertiserDomain, pos: h.position })
        logs.push(`  → [Hunter${isBOD(h.position) ? 'BOD👑' : ''}] ${a} (${h.name})`)
        // Chỉ save DB khi không dryRun và chưa có
        if (!dryRun && !emailSet.has(a)) {
          await supabase.from('emails').insert({
            address: a, source_url: articleUrl,
            domain: advertiserDomain, status: 'new',
            source_type: 'hunter_bod', contact_name: h.name || null, position: h.position || null,
          })
          emailSet.add(a)
          saved.push(a)
        }
      }
    } catch { /* Hunter fail silently */ }
  }

  // Ghi nhận đã quét (chỉ khi không dryRun)
  if (!dryRun && siteId) {
    await supabase.from('crawled_pages').insert({
      site_id: siteId, page_url: articleUrl,
      page_title: advertiserName || articleUrl.split('/').pop() || '',
      emails_found: saved.length,
    }).select()
    const { count } = await supabase
      .from('crawled_pages').select('*', { count: 'exact', head: true }).eq('site_id', siteId)
    await supabase.from('competitor_sites').update({
      last_crawled_at: new Date().toISOString(),
      total_pages_crawled: count || 0,
      total_emails_found: emailSet.size,
    }).eq('id', siteId)
  }

  return NextResponse.json({ found, saved, logs, advertiserName, advertiserDomain, skipped })
}

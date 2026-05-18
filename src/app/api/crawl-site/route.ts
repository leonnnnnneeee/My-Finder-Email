import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const HUNTER_KEY = process.env.HUNTER_API_KEY

// URL thật đã verify của từng site
const SITE_PR_PATHS: Record<string, string[]> = {
  'zycrypto.com':            ['/category/press-releases/', '/category/sponsored/'],
  'cryptotimes.io':          ['/category/press-release/', '/category/sponsored/'],
  'blockchainreporter.net':  ['/category/press-release/', '/press-release/'],
  'livebitcoinnews.com':     ['/category/press-releases/', '/press-releases/'],
  'tronweekly.com':          ['/category/press-release/', '/press-releases/'],
  'analyticsinsight.net':    ['/category/press-release/', '/press-releases/'],
  'coindoo.com':             ['/category/press-release/', '/press-releases/'],
  'captainaltcoin.com':      ['/category/press-releases/'],
  'moneycheck.com':          ['/category/press-release/', '/press-releases/'],
  'optimisus.com':           ['/category/press-release/'],
  'timestabloid.com':        ['/category/press-release/'],
  'cryptobrowser.io':        ['/category/press-release/'],
  'coingabbar.com':          ['/category/press-release/'],
  'theportugalnews.com':     ['/category/press-release/'],
  'globenewswire.com':       ['/en/search/keyword/crypto'],
  'crypto.news':             ['/category/press-releases/', '/sponsored/'],
  'coinmarketcap.com':       ['/community/articles/'],
  'crunchbase.com':          ['/hub/cryptocurrency-companies'],
}

const CRYPTO_KW = ['blockchain','crypto','defi','nft','web3','token','coin','exchange',
  'wallet','bitcoin','ethereum','presale','ico','ido','dao','dex','staking',
  'airdrop','protocol','layer','dapp','gamefi','mining','altcoin','metaverse']
const BOD_TITLES = ['CEO','Co-Founder','Founder','CFO','COO','CMO','CTO',
  'Chief Executive','Chief Financial','Chief Marketing','Chief Technology',
  'President','Director','Head of','VP ','Vice President','Partner']

function isCrypto(t: string) { return CRYPTO_KW.some(k => (t||'').toLowerCase().includes(k)) }
function isBOD(t: string) { return BOD_TITLES.some(b => (t||'').toLowerCase().includes(b.toLowerCase())) }

function extractEmailsRegex(text: string, excludeDomain: string): string[] {
  const emailRegex = /[\w.+%-]+@[\w-]+\.[\w.]{2,}/g
  const found = text.match(emailRegex) || []
  return [...new Set(found.filter(e =>
    !e.includes(excludeDomain) &&
    !e.includes('example.com') &&
    !e.includes('sentry') &&
    !e.includes('wix') &&
    !e.endsWith('.png') &&
    !e.endsWith('.jpg') &&
    e.length < 80 &&
    e.includes('.')
  ))]
}

async function quickFetch(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    signal: AbortSignal.timeout(7000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

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

// GET action=urls: Fetch trang index thật để lấy link bài PR
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  if (searchParams.get('action') === 'urls') {
    const siteUrl = searchParams.get('siteUrl') || ''
    const domain = siteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')
    const paths = SITE_PR_PATHS[domain] || ['/category/press-release/']

    // Load đã quét
    const { data: site } = await supabase.from('competitor_sites').select('id').eq('domain', domain).single()
    const { data: crawled } = site
      ? await supabase.from('crawled_pages').select('page_url').eq('site_id', site.id)
      : { data: [] }
    const crawledSet = new Set((crawled||[]).map((r: any) => r.page_url))

    const allLinks = new Set<string>()
    const errors: string[] = []

    for (const path of paths) {
      const indexUrl = `https://${domain}${path}`
      try {
        const html = await quickFetch(indexUrl)
        // Extract article links
        const patterns = [
          new RegExp(`href=["'](https?://(?:www\\.)?${domain.replace('.', '\\.')}[^"'?#]+)["']`, 'gi'),
          new RegExp(`href=["'](/[^"'?#]{10,}/)["']`, 'gi'),
        ]
        for (const re of patterns) {
          let m
          while ((m = re.exec(html)) !== null) {
            let url = m[1]
            if (!url.startsWith('http')) url = `https://${domain}${url}`
            // Lọc chỉ lấy link bài viết (không phải trang category/tag/page)
            if (!url.match(/\/category\/|\/tag\/|\/author\/|\/page\/|\?/) &&
                url.includes(domain) && url.length > `https://${domain}`.length + 5) {
              allLinks.add(url)
            }
          }
        }
      } catch (e: any) {
        errors.push(`${path}: ${e.message}`)
      }
    }

    const urls = [...allLinks].filter(u => !crawledSet.has(u)).slice(0, 10)
    return NextResponse.json({ urls, domain, errors })
  }

  const { data: sites } = await supabase
    .from('competitor_sites')
    .select('*, crawled_pages(count)')
    .order('last_crawled_at', { ascending: false, nullsFirst: false })
  return NextResponse.json({ sites: sites||[] })
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
    const html = await quickFetch(articleUrl)
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
    logs.push(`✓ Fetched ${stripped.length} chars`)

    // Regex extract emails nhanh
    const rawEmails = extractEmailsRegex(stripped, hostDomain)
    logs.push(`  Regex found: ${rawEmails.length} emails ${rawEmails.slice(0,3).join(', ')}`)

    // Claude classify (nhanh, chỉ cần snippet nhỏ)
    const snippet = stripped.slice(0, 4000)
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 250,
      messages: [{
        role: 'user',
        content: `PR article on ${hostDomain}. Find ADVERTISER (crypto project that booked this article).
Emails found: ${rawEmails.join(', ')||'none'}
Text: ${snippet}
JSON: {"name":"X","domain":"x.io","isCrypto":true,"emails":["valid@x.io"]}`
      }]
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const info = JSON.parse(raw.replace(/```json|```/g,'').trim().match(/\{[\s\S]*\}/)?.[0]||'{}')
    advertiserName = info.name || ''
    advertiserDomain = info.domain || ''

    if (info.isCrypto === false && !isCrypto(info.name + ' ' + info.domain + ' ' + snippet.slice(0,500))) {
      logs.push(`⊘ Non-crypto`)
      skipped = true
    } else {
      logs.push(`Dự án: ${info.name} (${info.domain})`)
      const useEmails = info.emails?.length ? info.emails : rawEmails
      for (const em of useEmails) {
        const a = (em||'').toLowerCase().trim()
        if (a.includes('@') && !a.includes(hostDomain) && !emailSet.has(a) && a.length < 80) {
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
  } catch (e: any) {
    logs.push(`⚠ ${e.message}`)
    skipped = saved.length === 0
  }

  // Hunter BOD
  if (!skipped && advertiserDomain && advertiserDomain !== hostDomain) {
    try {
      const hunterR = await hunterBOD(advertiserDomain)
      for (const h of hunterR) {
        if (h.email && !emailSet.has(h.email)) {
          await supabase.from('emails').insert({
            address: h.email, source_url: articleUrl,
            domain: advertiserDomain, status: 'new',
            source_type: 'hunter_bod', contact_name: h.name||null, position: h.position||null
          })
          emailSet.add(h.email); saved.push(h.email)
          logs.push(`→ [Hunter${isBOD(h.position)?'BOD👑':''}] ${h.email}`)
        }
      }
    } catch {}
  }

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

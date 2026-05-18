import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const HUNTER_KEY = process.env.HUNTER_API_KEY

const CRYPTO_KW = ['blockchain','crypto','defi','nft','web3','token','coin','exchange','wallet',
  'bitcoin','ethereum','presale','ico','ido','dao','dex','staking','yield','airdrop',
  'protocol','layer2','chain','dapp','gamefi','p2e','rwa','metaverse','mining','validator']

function isCrypto(text: string) {
  const t = (text || '').toLowerCase()
  return CRYPTO_KW.some(k => t.includes(k))
}

const BOD_TITLES = ['CEO','Chief Executive','Co-Founder','Founder','CFO','Chief Financial',
  'COO','COO','CMO','Chief Marketing','CTO','Chief Technology','President','Director',
  'Head of','VP ','Vice President','Managing Director','Partner','Chairman']

function isBOD(title: string) {
  const t = (title || '').toLowerCase()
  return BOD_TITLES.some(b => t.includes(b.toLowerCase()))
}

// Fetch HTML từ URL thật
async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CryptoEmailBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    return html.slice(0, 50000) // giới hạn 50k chars
  } catch (e: any) {
    throw new Error(`Fetch failed: ${e.message}`)
  }
}

// Dùng Claude để extract bài PR/Sponsored + email advertiser từ HTML
async function extractFromHtml(html: string, siteUrl: string, domain: string, alreadyCrawled: string[]): Promise<{
  articles: { url: string; title: string; advertiserName: string; advertiserDomain: string; emails: string[] }[]
}> {
  const prompt = `Bạn đang phân tích HTML của trang media/news: ${siteUrl}

MỤC TIÊU: Tìm các bài PR/Sponsored/Press Release mà CÁC DỰ ÁN CRYPTO đã book để quảng cáo.
Chúng ta cần email liên hệ của DỰ ÁN BOOK BÀI (advertiser) - KHÔNG phải email của website ${domain}.

Từ HTML dưới đây, hãy:
1. Tìm tất cả link bài viết PR/Sponsored/Press Release về crypto
2. Với mỗi bài: extract tên dự án, domain dự án, email của dự án (nếu có trong HTML)
3. Chỉ lấy dự án CRYPTO (blockchain, token, DeFi, NFT, Web3, exchange, wallet...)
4. BỎ QUA các URL đã có: ${alreadyCrawled.slice(0,5).join(', ') || 'chưa có'}

HTML (truncated):
${html.slice(0, 15000)}

Trả về ONLY valid JSON:
{
  "articles": [
    {
      "url": "https://${domain}/full-article-url",
      "title": "Tên bài viết",
      "advertiserName": "Tên dự án crypto book bài",
      "advertiserDomain": "domain-of-project.io",
      "emails": ["contact@project.io", "press@project.io"]
    }
  ]
}

Quy tắc quan trọng:
- emails[] chỉ chứa email của DỰ ÁN (advertiser), KHÔNG phải email của ${domain}
- Nếu không tìm thấy email trong HTML thì để emails: [] (Hunter sẽ tìm sau)
- advertiserDomain phải là domain của dự án, không phải ${domain}
- Tối đa 8 bài, ưu tiên bài mới nhất
- Nếu không có bài nào phù hợp, trả về articles: []`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  })
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return { articles: [] }
  }
}

// Fetch HTML của 1 bài viết cụ thể để lấy thêm email
async function extractEmailFromArticle(articleUrl: string, advertiserName: string): Promise<string[]> {
  try {
    const html = await fetchHtml(articleUrl)
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Từ HTML bài viết này, tìm email liên hệ của dự án "${advertiserName}".
Chỉ lấy email của dự án/advertiser, KHÔNG lấy email của website host.
Tìm trong: MEDIA CONTACT, contact@, press@, info@, team@, hello@, bd@
HTML: ${html.slice(0, 8000)}
Trả về JSON: {"emails": ["email1@domain.com", "email2@domain.com"]}`
      }]
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return parsed.emails || []
  } catch {
    return []
  }
}

// Tìm email qua Hunter.io
async function hunterSearch(domain: string): Promise<{ emails: string[]; names: string[] }> {
  if (!HUNTER_KEY || !domain) return { emails: [], names: [] }
  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&limit=5&api_key=${HUNTER_KEY}`)
    const d = await res.json()
    if (d.errors) return { emails: [], names: [] }
    const all = d.data?.emails || []
    // Ưu tiên BOD, nếu không có thì lấy tất cả
    const bod = all.filter((e: any) => isBOD(e.position || ''))
    const use = bod.length > 0 ? bod : all.slice(0, 3)
    return {
      emails: use.map((e: any) => e.value).filter(Boolean),
      names: use.map((e: any) => `${e.first_name || ''} ${e.last_name || ''}`.trim()).filter(Boolean),
    }
  } catch {
    return { emails: [], names: [] }
  }
}

export async function POST(req: NextRequest) {
  const { siteUrl, maxPages = 8 } = await req.json()
  if (!siteUrl) return NextResponse.json({ error: 'Thiếu siteUrl' }, { status: 400 })

  const domain = siteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')

  // Upsert competitor site
  const { data: site } = await supabase
    .from('competitor_sites')
    .upsert({ url: siteUrl, domain, last_crawled_at: new Date().toISOString() }, { onConflict: 'url' })
    .select().single()
  const siteId = site?.id

  // Load URLs đã quét
  const { data: crawledRows } = await supabase.from('crawled_pages').select('page_url').eq('site_id', siteId)
  const crawledSet = new Set((crawledRows || []).map((r: any) => r.page_url))

  // Load emails đã có
  const { data: existingEmails } = await supabase.from('emails').select('address')
  const emailSet = new Set((existingEmails || []).map((e: any) => e.address.toLowerCase()))

  const results: any[] = []
  let totalNewEmails = 0
  const logs: string[] = []

  try {
    // BƯỚC 1: Fetch HTML của trang index để tìm bài PR
    logs.push(`▶ Fetch ${siteUrl}...`)
    const html = await fetchHtml(siteUrl)
    logs.push(`  ✓ Đã fetch ${html.length} chars`)

    // BƯỚC 2: Claude phân tích HTML → tìm bài PR + advertiser
    logs.push(`  Đang phân tích bài PR/Sponsored...`)
    const { articles } = await extractFromHtml(html, siteUrl, domain, [...crawledSet])
    logs.push(`  ✓ Tìm thấy ${articles.length} bài crypto`)

    const toProcess = articles
      .filter(a => !crawledSet.has(a.url))
      .filter(a => isCrypto(a.advertiserName + ' ' + a.title) || isCrypto(a.advertiserDomain))
      .slice(0, maxPages)

    // BƯỚC 3: Xử lý từng bài
    for (const article of toProcess) {
      const artLogs: string[] = []
      let collectedEmails: { addr: string; name: string; source: string; position?: string; isBOD?: boolean }[] = []

      // 3a: Email từ HTML index page
      for (const em of article.emails || []) {
        const a = em.toLowerCase().trim()
        if (a.includes('@') && !emailSet.has(a)) {
          collectedEmails.push({ addr: a, name: article.advertiserName, source: 'article' })
          artLogs.push(`    → email từ bài: ${a}`)
        }
      }

      // 3b: Nếu chưa có email, fetch HTML bài viết để tìm thêm
      if (collectedEmails.length === 0 && article.url.startsWith('http')) {
        try {
          const moreEmails = await extractEmailFromArticle(article.url, article.advertiserName)
          for (const em of moreEmails) {
            const a = em.toLowerCase().trim()
            if (a.includes('@') && !emailSet.has(a)) {
              collectedEmails.push({ addr: a, name: article.advertiserName, source: 'article_detail' })
              artLogs.push(`    → email từ bài chi tiết: ${a}`)
            }
          }
        } catch {}
      }

      // 3c: Hunter.io tìm BOD theo domain của dự án
      if (article.advertiserDomain && article.advertiserDomain !== domain) {
        const { emails: hunterEmails, names } = await hunterSearch(article.advertiserDomain)
        for (let i = 0; i < hunterEmails.length; i++) {
          const a = hunterEmails[i].toLowerCase()
          if (!emailSet.has(a)) {
            collectedEmails.push({
              addr: a,
              name: names[i] || article.advertiserName,
              source: 'hunter_bod',
              isBOD: true
            })
            artLogs.push(`    → Hunter BOD: ${a} (${names[i] || '?'})`)
          }
        }
      }

      // 3d: Nếu thoả ít nhất 1 trong 2 (có email từ bài HOẶC có BOD) → collect
      if (collectedEmails.length > 0) {
        const newEmails: string[] = []
        for (const e of collectedEmails) {
          if (emailSet.has(e.addr)) continue
          await supabase.from('emails').insert({
            address: e.addr,
            source_url: article.url,
            domain: article.advertiserDomain || domain,
            status: 'new',
            source_type: e.source,
            contact_name: e.name || null,
            position: e.position || null,
          })
          emailSet.add(e.addr)
          newEmails.push(e.addr)
          totalNewEmails++
        }

        logs.push(`  📄 ${article.title?.slice(0, 60)}`)
        logs.push(`     Dự án: ${article.advertiserName} (${article.advertiserDomain})`)
        artLogs.forEach(l => logs.push(l))
        logs.push(`     → Collected: ${newEmails.length} email mới`)

        results.push({
          url: article.url,
          title: article.title,
          advertiser: article.advertiserName,
          advertiserDomain: article.advertiserDomain,
          newEmails,
          skipped: collectedEmails.length - newEmails.length,
        })
      } else {
        logs.push(`  — ${article.advertiserName}: không tìm thấy email`)
      }

      // Ghi nhận đã quét
      if (article.url) {
        await supabase.from('crawled_pages').insert({
          site_id: siteId,
          page_url: article.url,
          page_title: article.title,
          emails_found: results[results.length - 1]?.newEmails?.length || 0,
        }).select()
        crawledSet.add(article.url)
      }
    }

    // Cập nhật stats
    await supabase.from('competitor_sites').update({
      last_crawled_at: new Date().toISOString(),
      total_pages_crawled: crawledSet.size,
      total_emails_found: emailSet.size,
    }).eq('id', siteId)

    return NextResponse.json({
      domain,
      pagesScanned: toProcess.length,
      newEmails: totalNewEmails,
      results,
      logs,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message, logs }, { status: 500 })
  }
}

// GET: danh sách sites
export async function GET() {
  const { data: sites } = await supabase
    .from('competitor_sites')
    .select('*, crawled_pages(count)')
    .order('created_at', { ascending: false })
  return NextResponse.json({ sites: sites || [] })
}

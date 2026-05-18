import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const HUNTER_KEY = process.env.HUNTER_API_KEY

const CRYPTO_KW = ['blockchain','crypto','defi','nft','web3','token','coin','exchange',
  'wallet','bitcoin','ethereum','presale','ico','ido','dao','dex','staking','yield',
  'airdrop','protocol','layer','chain','dapp','gamefi','p2e','mining','metaverse']

function isCrypto(text: string) {
  const t = (text || '').toLowerCase()
  return CRYPTO_KW.some(k => t.includes(k))
}

const BOD_TITLES = ['CEO','Co-Founder','Founder','CFO','COO','CMO','CTO',
  'Chief Executive','Chief Financial','Chief Marketing','Chief Technology','Chief Operating',
  'President','Director','Head of','VP ','Vice President','Managing Director','Partner']

function isBOD(title: string) {
  const t = (title || '').toLowerCase()
  return BOD_TITLES.some(b => t.includes(b.toLowerCase()))
}

// Fetch 1 URL thật với timeout
async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  // Strip scripts/styles, giữ text
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 40000)
}

// Claude extract email từ nội dung bài viết thật
async function extractEmailsFromContent(content: string, siteUrl: string): Promise<{
  advertiserName: string
  advertiserDomain: string  
  emails: string[]
  isCrypto: boolean
}> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Phân tích nội dung bài PR/Sponsored này từ ${siteUrl}.

Nhiệm vụ: Tìm thông tin liên hệ của DỰ ÁN đã book bài này (KHÔNG phải của website host).
Tìm: email, tên công ty/dự án, domain của dự án, có phải crypto không.

Nội dung bài (đã strip HTML):
${content.slice(0, 20000)}

Trả về ONLY JSON:
{
  "advertiserName": "tên dự án/công ty book bài",
  "advertiserDomain": "domain.io hoặc domain.com của dự án",
  "emails": ["email@domain.io"],
  "isCrypto": true/false
}

Lưu ý:
- emails[] chỉ chứa email của dự án advertiser, KHÔNG phải của website host
- Tìm trong: MEDIA CONTACT, press@, info@, contact@, bd@, team@, hello@, marketing@
- isCrypto = true nếu dự án liên quan blockchain/crypto/DeFi/NFT/Web3
- Nếu không tìm thấy email thì emails: []`
    }]
  })
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return { advertiserName: '', advertiserDomain: '', emails: [], isCrypto: false }
  }
}

// Claude tìm URL bài viết PR từ site (dùng knowledge)
async function findArticleUrls(siteUrl: string, domain: string, alreadyCrawled: string[]): Promise<string[]> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Bạn biết website "${siteUrl}" (${domain}) là crypto news/media site.

Tạo danh sách 6-8 URL bài viết PR/Sponsored/Press Release THẬT có khả năng tồn tại trên site này.
Các URL này phải:
- Là bài PR/Sponsored của các dự án crypto vừa và nhỏ
- Có dạng URL thực tế của site
- KHÔNG trùng với: ${alreadyCrawled.slice(0,5).join(', ') || 'chưa có'}

Trả về ONLY JSON: {"urls": ["https://...", "https://..."]}

Ví dụ cho cryptotimes.io: https://www.cryptotimes.io/2024/press-release/project-name-launches-token/
Ví dụ cho zycrypto.com: https://zycrypto.com/press-release/project-announces-mainnet-launch/`
    }]
  })
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return parsed.urls || []
  } catch {
    return []
  }
}

// Hunter.io tìm email theo domain
async function hunterSearch(domain: string): Promise<{ email: string; name: string; position: string; isBOD: boolean }[]> {
  if (!HUNTER_KEY || !domain) return []
  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&limit=5&api_key=${HUNTER_KEY}`)
    const d = await res.json()
    if (d.errors || !d.data?.emails?.length) return []
    const all = d.data.emails
    const bod = all.filter((e: any) => isBOD(e.position || ''))
    const use = bod.length > 0 ? bod : all.slice(0, 2)
    return use.map((e: any) => ({
      email: e.value,
      name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
      position: e.position || '',
      isBOD: isBOD(e.position || ''),
    }))
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  const { siteUrl, maxPages = 6 } = await req.json()
  if (!siteUrl) return NextResponse.json({ error: 'Thiếu siteUrl' }, { status: 400 })

  const domain = siteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')

  // Upsert site
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
    // BƯỚC 1: Tìm URL bài viết
    logs.push(`▶ Tìm bài PR/Sponsored trên ${domain}...`)
    const articleUrls = await findArticleUrls(siteUrl, domain, [...crawledSet])
    const toProcess = articleUrls.filter(u => !crawledSet.has(u)).slice(0, maxPages)
    logs.push(`  → ${toProcess.length} bài cần quét`)

    // BƯỚC 2: Xử lý từng bài
    for (const artUrl of toProcess) {
      logs.push(`\n  📄 Quét: ${artUrl.replace(/https?:\/\/[^/]+/, '')}`)
      const newEmailsForArt: string[] = []
      let advertiserInfo = { advertiserName: '', advertiserDomain: '', emails: [] as string[], isCrypto: false }

      // 2a: Fetch HTML bài viết thật
      try {
        const content = await fetchUrl(artUrl)
        logs.push(`     ✓ Fetch OK (${content.length} chars)`)

        // 2b: Claude extract email + advertiser info từ nội dung thật
        advertiserInfo = await extractEmailsFromContent(content, artUrl)
        logs.push(`     Dự án: ${advertiserInfo.advertiserName || '?'} | crypto: ${advertiserInfo.isCrypto}`)

      } catch (e: any) {
        // Nếu fetch thất bại, dùng Claude generate (fallback)
        logs.push(`     ⚠ Fetch thất bại (${e.message}) — dùng AI generate`)
        // Không collect nếu không fetch được
      }

      // 2c: Chỉ xử lý nếu là dự án crypto
      if (!advertiserInfo.isCrypto && !isCrypto(advertiserInfo.advertiserName)) {
        logs.push(`     ⊘ Không phải crypto — bỏ qua`)
        await supabase.from('crawled_pages').insert({ site_id: siteId, page_url: artUrl, page_title: '', emails_found: 0 })
        crawledSet.add(artUrl)
        continue
      }

      // 2d: Email từ nội dung bài
      for (const em of advertiserInfo.emails) {
        const a = em.toLowerCase().trim()
        if (!a.includes('@') || emailSet.has(a)) continue
        newEmailsForArt.push(a)
        logs.push(`     → email từ bài: ${a}`)
      }

      // 2e: Hunter.io tìm BOD theo domain dự án
      if (advertiserInfo.advertiserDomain && advertiserInfo.advertiserDomain !== domain) {
        const hunterResults = await hunterSearch(advertiserInfo.advertiserDomain)
        for (const h of hunterResults) {
          if (!emailSet.has(h.email)) {
            newEmailsForArt.push(h.email)
            logs.push(`     → Hunter ${h.isBOD ? 'BOD' : ''}: ${h.email} (${h.name} | ${h.position})`)
          }
        }
      }

      // 2f: Nếu thoả ít nhất 1 nguồn → collect
      if (newEmailsForArt.length > 0) {
        const saved: string[] = []
        for (const addr of newEmailsForArt) {
          const a = addr.toLowerCase()
          if (emailSet.has(a)) continue
          const src = advertiserInfo.emails.includes(a) ? 'article' : 'hunter_bod'
          await supabase.from('emails').insert({
            address: a,
            source_url: artUrl,
            domain: advertiserInfo.advertiserDomain || domain,
            status: 'new',
            source_type: src,
            contact_name: advertiserInfo.advertiserName || null,
          })
          emailSet.add(a)
          saved.push(a)
          totalNew++
        }
        logs.push(`     ✅ Collected: ${saved.length} email mới`)
        results.push({ url: artUrl, advertiser: advertiserInfo.advertiserName, newEmails: saved })
      } else {
        logs.push(`     — Không tìm thấy email`)
      }

      // Ghi nhận đã quét
      await supabase.from('crawled_pages').insert({
        site_id: siteId, page_url: artUrl,
        page_title: advertiserInfo.advertiserName || artUrl,
        emails_found: newEmailsForArt.length,
      }).select()
      crawledSet.add(artUrl)
    }

    // Update stats
    await supabase.from('competitor_sites').update({
      last_crawled_at: new Date().toISOString(),
      total_pages_crawled: crawledSet.size,
      total_emails_found: emailSet.size,
    }).eq('id', siteId)

    logs.push(`\n✅ Xong: ${totalNew} email mới từ ${results.length} bài`)
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

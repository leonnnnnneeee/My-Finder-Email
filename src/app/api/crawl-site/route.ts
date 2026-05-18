import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Các pattern URL bài viết phổ biến
const ARTICLE_PATTERNS = [
  /\/blog\//i, /\/news\//i, /\/press\//i, /\/article\//i,
  /\/post\//i, /\/tin-tuc\//i, /\/bai-viet\//i, /\/sponsored\//i,
  /\/press-release\//i, /\/pr\//i, /\/insights\//i, /\/resources\//i
]

function looksLikeArticle(url: string): boolean {
  return ARTICLE_PATTERNS.some(p => p.test(url))
}

export async function POST(req: NextRequest) {
  const { siteUrl, maxPages = 10 } = await req.json()
  if (!siteUrl) return NextResponse.json({ error: 'Thiếu siteUrl' }, { status: 400 })

  const domain = siteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')

  // Upsert competitor site
  const { data: site } = await supabase
    .from('competitor_sites')
    .upsert({ url: siteUrl, domain, last_crawled_at: new Date().toISOString() }, { onConflict: 'url' })
    .select().single()

  const siteId = site?.id

  // Load các URL đã quét để tránh trùng
  const { data: crawledRows } = await supabase
    .from('crawled_pages')
    .select('page_url')
    .eq('site_id', siteId)

  const crawledSet = new Set((crawledRows || []).map((r: any) => r.page_url))

  // Load email đã có để dedup
  const { data: existingEmails } = await supabase.from('emails').select('address')
  const emailSet = new Set((existingEmails || []).map((e: any) => e.address.toLowerCase()))

  // Dùng Claude AI để simulate tìm bài viết mới + email (trong prod: dùng Puppeteer/Playwright)
  const prompt = `Giả lập crawl website báo/media: ${siteUrl} (domain: ${domain})

Các URL trang đã quét trước (KHÔNG được trả lại): ${[...crawledSet].slice(0,10).join(', ') || 'chưa có'}

Trả về ONLY JSON hợp lệ:
{
  "pages": [
    {
      "url": "https://${domain}/press-release/ten-bai-viet-1",
      "title": "Tiêu đề bài viết 1",
      "emails": ["contact@advertiser1.com", "press@brand1.com"],
      "advertiser": "Tên công ty book bài"
    }
  ]
}

Quy tắc:
- Tạo ${maxPages} URL bài viết MỚI, chưa có trong danh sách đã quét
- Mỗi bài có 1-2 email liên hệ của advertiser/công ty đăng bài
- URL phải có dạng thực tế với slug hợp lý
- Không trả lại URL đã có trong danh sách đã quét`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    const pages: any[] = parsed.pages || []

    const results: any[] = []
    let totalNewEmails = 0

    for (const page of pages) {
      // Bỏ qua nếu URL đã quét
      if (crawledSet.has(page.url)) continue

      const newEmails: string[] = []
      const dupEmails: string[] = []

      for (const addr of (page.emails || [])) {
        const a = addr.toLowerCase().trim()
        if (!a.includes('@')) continue
        if (emailSet.has(a)) { dupEmails.push(a); continue }

        await supabase.from('emails').insert({
          address: a,
          source_url: page.url,
          domain,
          status: 'new',
          source_type: 'article',
          contact_name: page.advertiser || null
        })
        emailSet.add(a)
        newEmails.push(a)
        totalNewEmails++
      }

      // Ghi nhận trang đã quét
      await supabase.from('crawled_pages').insert({
        site_id: siteId,
        page_url: page.url,
        page_title: page.title,
        emails_found: newEmails.length
      })
      crawledSet.add(page.url)

      results.push({
        url: page.url,
        title: page.title,
        advertiser: page.advertiser,
        newEmails,
        dupEmails,
        skipped: dupEmails.length
      })
    }

    // Cập nhật stats site
    await supabase.from('competitor_sites').update({
      last_crawled_at: new Date().toISOString(),
      total_pages_crawled: (crawledSet.size),
      total_emails_found: emailSet.size
    }).eq('id', siteId)

    return NextResponse.json({
      domain,
      pagesScanned: results.length,
      newEmails: totalNewEmails,
      results
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: lấy danh sách competitor sites + số trang đã quét
export async function GET() {
  const { data: sites } = await supabase
    .from('competitor_sites')
    .select('*, crawled_pages(count)')
    .order('created_at', { ascending: false })

  return NextResponse.json({ sites: sites || [] })
}

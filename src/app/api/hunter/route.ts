import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const HUNTER_KEY = process.env.HUNTER_API_KEY

// Chức danh BOD cần tìm
const BOD_TITLES = [
  'CEO', 'Chief Executive', 'Co-Founder', 'Founder',
  'CFO', 'Chief Financial', 'COO', 'Chief Operating',
  'CMO', 'Chief Marketing', 'CTO', 'Chief Technology',
  'President', 'Director', 'Head of', 'VP ', 'Vice President',
  'Managing Director', 'General Manager'
]

function isBOD(title: string): boolean {
  if (!title) return false
  const t = title.toLowerCase()
  return BOD_TITLES.some(b => t.includes(b.toLowerCase()))
}

export async function POST(req: NextRequest) {
  const { domains, mode } = await req.json()
  // mode: 'all' | 'bod' (chỉ lấy BOD)

  if (!domains?.length) return NextResponse.json({ error: 'Không có domain' }, { status: 400 })
  if (!HUNTER_KEY) return NextResponse.json({ error: 'Thiếu HUNTER_API_KEY' }, { status: 500 })

  // Load email đã có để dedup
  const { data: existing } = await supabase.from('emails').select('address')
  const existingSet = new Set((existing || []).map((e: any) => e.address.toLowerCase()))

  const results: any[] = []

  for (const domain of domains) {
    const cleanDomain = domain.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')

    try {
      // Gọi Hunter domain-search
      const url = `https://api.hunter.io/v2/domain-search?domain=${cleanDomain}&limit=10&api_key=${HUNTER_KEY}`
      const res = await fetch(url)
      const data = await res.json()

      if (data.errors) {
        results.push({ domain: cleanDomain, error: data.errors[0]?.details || 'Hunter API error', added: 0 })
        continue
      }

      const emails = data.data?.emails || []
      const company = data.data?.organization || cleanDomain

      // Lọc BOD nếu mode = bod
      const filtered = mode === 'bod'
        ? emails.filter((e: any) => isBOD(e.position || ''))
        : emails

      const added: any[] = []
      const skipped: any[] = []

      for (const e of filtered) {
        const addr = e.value?.toLowerCase()
        if (!addr) continue

        if (existingSet.has(addr)) {
          skipped.push({ addr, reason: 'trùng' })
          continue
        }

        const { data: inserted, error } = await supabase.from('emails').insert({
          address: addr,
          source_url: `https://${cleanDomain}`,
          domain: cleanDomain,
          status: 'new',
          // Lưu thêm metadata vào notes nếu có cột
        }).select().single()

        if (!error && inserted) {
          existingSet.add(addr)
          added.push({
            addr,
            name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
            position: e.position || '',
            confidence: e.confidence || 0,
            isBOD: isBOD(e.position || '')
          })
        }
      }

      results.push({
        domain: cleanDomain,
        company,
        total: emails.length,
        filtered: filtered.length,
        added: added.length,
        skipped: skipped.length,
        emails: added
      })

    } catch (err: any) {
      results.push({ domain: cleanDomain, error: err.message, added: 0 })
    }
  }

  return NextResponse.json({ results })
}

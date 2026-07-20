import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const HUNTER_KEYS = [process.env.HUNTER_API_KEY, process.env.HUNTER_API_KEY_2, process.env.HUNTER_API_KEY_3].filter(Boolean) as string[]
let _hkIdx = 0
const getHK = () => HUNTER_KEYS[_hkIdx++ % Math.max(HUNTER_KEYS.length,1)] || ''

const BOD_TITLES = [
  'CEO', 'Chief Executive', 'Co-Founder', 'Founder',
  'CFO', 'Chief Financial', 'COO', 'Chief Operating',
  'CMO', 'Chief Marketing', 'CTO', 'Chief Technology',
  'President', 'Director', 'Head of', 'VP', 'Vice President',
  'Managing Director', 'General Manager', 'Partner', 'Chairman'
]

function isBOD(title: string): boolean {
  if (!title) return false
  const t = title.toLowerCase()
  return BOD_TITLES.some(b => t.includes(b.toLowerCase()))
}

export async function GET() {
  // Test endpoint — kiểm tra key còn hoạt động không
  if (!HUNTER_KEYS.length) return NextResponse.json({ ok: false, error: 'HUNTER_API_KEY chưa được set trong Vercel env vars' })
  try {
    const res = await fetch(`https://api.hunter.io/v2/account?api_key=${getHK()}`)
    const d = await res.json()
    if (d.errors) return NextResponse.json({ ok: false, error: d.errors[0]?.details || 'Invalid key' })
    return NextResponse.json({
      ok: true,
      email: d.data?.email,
      plan: d.data?.plan_name,
      requests_remaining: d.data?.requests?.available,
      requests_used: d.data?.requests?.used
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message })
  }
}

export async function POST(req: NextRequest) {
  if (!HUNTER_KEYS.length) {
    return NextResponse.json({
      error: 'HUNTER_API_KEY chưa được set. Vào Vercel → Settings → Environment Variables → thêm HUNTER_API_KEY',
      results: []
    }, { status: 400 })
  }

  let body: any
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON', results: [] }, { status: 400 }) }

  const { domains, mode = 'bod' } = body
  if (!domains?.length) return NextResponse.json({ error: 'Không có domain', results: [] }, { status: 400 })

  // Load email đã có để dedup
  const { rows: existing } = await db.query('SELECT address FROM emails')
  const existingSet = new Set(existing.map((e: any) => e.address.toLowerCase()))

  const results: any[] = []

  for (const domain of domains) {
    const cleanDomain = domain.replace(/https?:\/\//, '').split('/')[0].replace('www.', '').trim()
    if (!cleanDomain) continue

    try {
      const url = `https://api.hunter.io/v2/domain-search?domain=${cleanDomain}&limit=20&api_key=${getHK()}`
      const res = await fetch(url)

      if (!res.ok) {
        results.push({ domain: cleanDomain, error: `HTTP ${res.status}`, added: 0, skipped: 0, emails: [] })
        continue
      }

      const data = await res.json()

      if (data.errors?.length) {
        results.push({ domain: cleanDomain, error: data.errors[0]?.details || 'Hunter error', added: 0, skipped: 0, emails: [] })
        continue
      }

      const allEmails = data.data?.emails || []
      const company = data.data?.organization || cleanDomain

      // Lọc theo mode
      const filtered = mode === 'bod'
        ? allEmails.filter((e: any) => isBOD(e.position || ''))
        : allEmails

      const addedList: any[] = []
      let skippedCount = 0

      for (const e of filtered) {
        const addr = e.value?.toLowerCase()
        if (!addr || !addr.includes('@')) continue

        if (existingSet.has(addr)) {
          skippedCount++
          continue
        }

        // Insert vào DB
        try {
          await db.query(
            `INSERT INTO emails (address, source_url, domain, status, contact_name, position, source_type, owner_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (address) DO NOTHING`,
            [
              addr, 
              `https://${cleanDomain}`, 
              cleanDomain, 
              'new', 
              `${e.first_name || ''} ${e.last_name || ''}`.trim() || null, 
              e.position || null, 
              isBOD(e.position || '') ? 'hunter_bod' : 'hunter', 
              body.owner_id || null
            ]
          )
          
          existingSet.add(addr)
          addedList.push({
            addr,
            name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
            position: e.position || '',
            confidence: e.confidence || 0,
            isBOD: isBOD(e.position || '')
          })
        } catch (dbErr) {
          // ignore error for single email insert
        }
      }

      results.push({
        domain: cleanDomain,
        company,
        found: allEmails.length,
        filtered: filtered.length,
        added: addedList.length,
        skipped: skippedCount,
        emails: addedList
      })

    } catch (err: any) {
      results.push({ domain: cleanDomain, error: err.message, added: 0, skipped: 0, emails: [] })
    }
  }

  return NextResponse.json({ results, total_added: results.reduce((s, r) => s + r.added, 0) })
}

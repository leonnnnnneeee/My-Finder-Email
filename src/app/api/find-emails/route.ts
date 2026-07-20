import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { urls, mode, owner_id } = await req.json()
  if (!urls?.length) return NextResponse.json({ error: 'Không có URL' }, { status: 400 })

  // Load existing emails for dedup
  const { rows: existing } = await db.query('SELECT address FROM emails')
  const existingSet = new Set(existing.map((e: any) => e.address.toLowerCase()))

  const results: any[] = []

  for (const url of urls) {
    const domain = url.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Simulate finding contact emails for domain: ${domain}
Mode: ${mode === 'pr' ? 'press release / sponsored content' : 'contact / about / footer pages'}
Return ONLY valid JSON, no markdown:
{"emails":[{"addr":"info@${domain}","page":"contact"},{"addr":"sales@${domain}","page":"footer"}]}`
        }]
      })

      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      const found: any[] = parsed.emails || []
      const added: any[] = []

      for (const e of found) {
        const addr = e.addr?.toLowerCase?.()
        if (!addr || !addr.includes('@')) continue
        if (existingSet.has(addr)) continue
        try {
          const { rows: inserted } = await db.query(
            'INSERT INTO emails (address, source_url, domain, status, owner_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (address) DO NOTHING RETURNING *',
            [addr, url, domain, 'new', owner_id || null]
          )
          if (inserted.length > 0) {
            existingSet.add(addr)
            added.push({ addr, page: e.page })
          }
        } catch (dbErr) {
          // ignore insert errors for individual emails
        }
      }
      results.push({ url, domain, found: found.length, added: added.length, emails: added })
    } catch (err: any) {
      results.push({ url, domain, error: err.message, found: 0, added: 0, emails: [] })
    }
  }

  return NextResponse.json({ results })
}

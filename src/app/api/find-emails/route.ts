import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { urls, mode } = await req.json()
  if (!urls?.length) return NextResponse.json({ error: 'Không có URL' }, { status: 400 })

  // Load existing emails for dedup
  const { data: existing } = await supabase.from('emails').select('address')
  const existingSet = new Set((existing || []).map((e: any) => e.address.toLowerCase()))

  const results: any[] = []

  for (const url of urls) {
    const domain = url.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
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
        const { data, error } = await supabase.from('emails')
          .insert({ address: addr, source_url: url, domain, status: 'new' })
          .select().single()
        if (!error && data) {
          existingSet.add(addr)
          added.push({ addr, page: e.page })
        }
      }
      results.push({ url, domain, found: found.length, added: added.length, emails: added })
    } catch (err: any) {
      results.push({ url, domain, error: err.message, found: 0, added: 0, emails: [] })
    }
  }

  return NextResponse.json({ results })
}

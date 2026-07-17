import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { domain, owner_id, reply_status } = await req.json()
  if (!domain) return NextResponse.json({ error: 'Missing domain' }, { status: 400 })

  const replied_at = reply_status === 'replied' ? new Date().toISOString() : null

  const payload: any = { reply_status, replied_at }
  if (reply_status === 'replied') {
    payload.status = 'sent'
  }

  let q = supabase.from('emails').update(payload).eq('domain', domain)

  if (owner_id) {
    q = q.eq('owner_id', owner_id)
  }

  const { error } = await q
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

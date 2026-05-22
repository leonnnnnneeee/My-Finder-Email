import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const owner = searchParams.get('owner')
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  let q = supabase.from('emails').select('*').order('created_at', { ascending: false })
  if (status && status !== 'all') q = q.eq('status', status)
  if (search) q = q.ilike('address', `%${search}%`)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ emails: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { address, source_url, domain: bodyDomain, source_type, contact_name, position } = body
  if (!address) return NextResponse.json({ error: 'Thiếu địa chỉ email' }, { status: 400 })
  const addr = address.toLowerCase().trim()
  const domain = bodyDomain || (source_url ? source_url.replace(/https?:\/\//, '').split('/')[0] : null)
  const { data: existing } = await supabase.from('emails').select('id').eq('address', addr).maybeSingle()
  if (existing) return NextResponse.json({ ok: true, existing: true })
  const owner_id = body.owner_id || null
  const { data, error } = await supabase.from('emails').insert({ address: addr, source_url: source_url||null, domain, status: 'new', source_type: source_type||'manual', contact_name: contact_name||null, position: position||null, owner_id }).select().single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, email: data })
}

export async function DELETE(req: NextRequest) {
  const { ids } = await req.json()
  if (!ids?.length) return NextResponse.json({ error: 'Không có ID' }, { status: 400 })
  const { error } = await supabase.from('emails').delete().in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: ids.length })
}

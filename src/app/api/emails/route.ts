import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const owner = searchParams.get('owner')
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  // Require owner - no anonymous access
  if (!owner) return NextResponse.json({ emails: [] })
  let q = supabase.from('emails').select('*').order('created_at', { ascending: false })
  if (owner) q = q.eq('owner_id', owner)
  if (status && status !== 'all') q = q.eq('status', status)
  if (search) q = q.ilike('address', `%${search}%`)
  
  let { data, error } = await q
  const errMsg = String(error?.message || error || '')
  
  if (error && errMsg.includes('owner_id')) {
    let retryQ = supabase.from('emails').select('*').order('created_at', { ascending: false })
    if (status && status !== 'all') retryQ = retryQ.eq('status', status)
    if (search) retryQ = retryQ.ilike('address', `%${search}%`)
    const retry = await retryQ
    data = retry.data
    error = retry.error
  }
  
  if (error) return NextResponse.json({ error: String(error?.message || error) }, { status: 500 })
  return NextResponse.json({ emails: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { address, source_url, domain: bodyDomain, source_type, contact_name, position } = body
  if (!address) return NextResponse.json({ error: 'Thiếu địa chỉ email' }, { status: 400 })
  const addr = address.toLowerCase().trim()
  const domain = bodyDomain || (source_url ? source_url.replace(/https?:\/\//, '').split('/')[0] : null)
  const owner_id = body.owner_id || null
  const { data: existing } = await supabase.from('emails').select('id, owner_id').eq('address', addr).maybeSingle()
  if (existing) {
    if (!existing.owner_id && owner_id) {
      await supabase.from('emails').update({ owner_id }).eq('id', existing.id)
    }
    return NextResponse.json({ ok: true, existing: true })
  }
  const payload: any = { address: addr, source_url: source_url||null, domain, status: 'new', source_type: source_type||'manual', contact_name: contact_name||null, position: position||null }
  if (owner_id) payload.owner_id = owner_id

  let { data, error } = await supabase.from('emails').insert(payload).select().single()
  const errMsg = String(error?.message || error || '')
  
  if (error && errMsg.includes('owner_id')) {
    delete payload.owner_id
    const retry = await supabase.from('emails').insert(payload).select().single()
    data = retry.data
    error = retry.error
  }
  
  if (error) return NextResponse.json({ ok: false, error: String(error?.message || error) }, { status: 500 })
  return NextResponse.json({ ok: true, email: data })
}

export async function DELETE(req: NextRequest) {
  const { ids } = await req.json()
  if (!ids?.length) return NextResponse.json({ error: 'Không có ID' }, { status: 400 })
  const { error } = await supabase.from('emails').delete().in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: ids.length })
}

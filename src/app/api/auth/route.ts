import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import * as crypto from 'crypto'

function hashPw(pw: string) { return crypto.createHash('sha256').update(pw).digest('hex') }

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  const { data: user } = await supabase.from('users').select('id,username,role,password_hash').eq('username', username?.toLowerCase().trim()).maybeSingle()
  if (!user || user.password_hash !== hashPw(password)) return NextResponse.json({ error: 'Sai username hoặc password' }, { status: 401 })
  await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', user.id)
  return NextResponse.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } })
}

export async function GET() {
  const { data } = await supabase.from('users').select('id,username,role,created_at,last_login').order('created_at')
  return NextResponse.json({ users: data || [] })
}

export async function PUT(req: NextRequest) {
  const { username, password, role, id } = await req.json()
  if (!username) return NextResponse.json({ error: 'Thiếu username' }, { status: 400 })
  if (id) {
    const updates: any = { username: username.toLowerCase().trim(), role: role || 'user' }
    if (password && password !== '••••••••') updates.password_hash = hashPw(password)
    const { error } = await supabase.from('users').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('users').insert({ username: username.toLowerCase().trim(), password_hash: hashPw(password), role: role || 'user' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await supabase.from('users').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}

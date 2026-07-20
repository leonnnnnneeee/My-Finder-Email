import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as crypto from 'crypto'

function hashPw(pw: string) { return crypto.createHash('sha256').update(pw).digest('hex') }

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    const { rows } = await db.query('SELECT id, username, role, password_hash FROM users WHERE username = $1', [username?.toLowerCase().trim()])
    const user = rows[0]
    if (!user || user.password_hash !== hashPw(password)) return NextResponse.json({ error: 'Sai username hoặc password' }, { status: 401 })
    await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id])
    return NextResponse.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const { rows } = await db.query('SELECT id, username, role, created_at, last_login FROM users ORDER BY created_at')
    return NextResponse.json({ users: rows })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { username, password, role, id } = await req.json()
    if (!username) return NextResponse.json({ error: 'Thiếu username' }, { status: 400 })
    
    if (id) {
      if (password && password !== '••••••••') {
        await db.query('UPDATE users SET username = $1, role = $2, password_hash = $3 WHERE id = $4', [username.toLowerCase().trim(), role || 'user', hashPw(password), id])
      } else {
        await db.query('UPDATE users SET username = $1, role = $2 WHERE id = $3', [username.toLowerCase().trim(), role || 'user', id])
      }
    } else {
      await db.query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)', [username.toLowerCase().trim(), hashPw(password), role || 'user'])
    }
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    await db.query('DELETE FROM users WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

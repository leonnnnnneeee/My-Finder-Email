import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const { rows } = await db.query('SELECT * FROM email_blacklist ORDER BY created_at DESC')
    return NextResponse.json({ blacklist: rows })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { domain, email, reason } = await req.json()
    await db.query(
      'INSERT INTO email_blacklist (domain, email, reason) VALUES ($1, $2, $3)', 
      [domain?.toLowerCase(), email?.toLowerCase(), reason || 'not interested']
    )
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    await db.query('DELETE FROM email_blacklist WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

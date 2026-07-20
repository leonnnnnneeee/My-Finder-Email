import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const { rows } = await db.query('SELECT * FROM email_templates ORDER BY created_at ASC')
    return NextResponse.json({ templates: rows || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { rows } = await db.query(
      'INSERT INTO email_templates (name, subject, body, owner_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [body.name, body.subject, body.body, body.owner_id || null]
    )
    return NextResponse.json({ ok: true, template: rows[0] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    await db.query('DELETE FROM email_templates WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

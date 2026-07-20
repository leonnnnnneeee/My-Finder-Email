import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, context: any) {
  try {
    const params = await context.params
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const body = await req.json()
    
    // Build dynamic UPDATE query
    const keys = Object.keys(body)
    if (keys.length === 0) return NextResponse.json({ ok: true })
    
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
    const values = keys.map(k => body[k])
    values.push(id) // ID is the last parameter

    const { rows } = await db.query(
      `UPDATE emails SET ${setClause} WHERE id = $${values.length} RETURNING *`,
      values
    )
    
    return NextResponse.json({ ok: true, email: rows[0] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: any) {
  try {
    const params = await context.params
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    
    await db.query('DELETE FROM emails WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

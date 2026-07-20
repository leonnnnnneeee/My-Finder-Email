import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const owner = searchParams.get('owner')
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  // Require owner - no anonymous access
  if (!owner) return NextResponse.json({ emails: [] })

  try {
    let query = 'SELECT * FROM emails WHERE owner_id = $1'
    let params: any[] = [owner]
    let paramIdx = 2

    if (status && status !== 'all') {
      query += ` AND status = $${paramIdx++}`
      params.push(status)
    }
    if (search) {
      query += ` AND address ILIKE $${paramIdx++}`
      params.push(`%${search}%`)
    }
    query += ' ORDER BY created_at DESC'

    const { rows } = await db.query(query, params)
    return NextResponse.json({ emails: rows })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { address, source_url, domain: bodyDomain, source_type, contact_name, position } = body
    if (!address) return NextResponse.json({ error: 'Thiếu địa chỉ email' }, { status: 400 })
    
    const addr = address.toLowerCase().trim()
    const domain = bodyDomain || (source_url ? source_url.replace(/https?:\/\//, '').split('/')[0] : null)
    const owner_id = body.owner_id || null

    const { rows: existingRows } = await db.query('SELECT id, owner_id FROM emails WHERE address = $1', [addr])
    const existing = existingRows[0]
    
    if (existing) {
      if (!existing.owner_id && owner_id) {
        await db.query('UPDATE emails SET owner_id = $1 WHERE id = $2', [owner_id, existing.id])
      }
      return NextResponse.json({ ok: true, existing: true })
    }

    const { rows: inserted } = await db.query(
      `INSERT INTO emails (address, source_url, domain, status, source_type, contact_name, position, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [addr, source_url || null, domain, 'new', source_type || 'manual', contact_name || null, position || null, owner_id || null]
    )
    
    return NextResponse.json({ ok: true, email: inserted[0] })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json()
    if (!ids?.length) return NextResponse.json({ error: 'Không có ID' }, { status: 400 })
    
    // Create parameterized list for IN clause
    const params = ids.map((_: any, i: number) => `$${i + 1}`).join(',')
    await db.query(`DELETE FROM emails WHERE id IN (${params})`, ids)
    
    return NextResponse.json({ deleted: ids.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

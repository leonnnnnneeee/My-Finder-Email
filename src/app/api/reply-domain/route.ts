import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { domain, owner_id, reply_status } = await req.json()
    if (!domain) return NextResponse.json({ error: 'Missing domain' }, { status: 400 })

    const replied_at = reply_status === 'replied' ? new Date().toISOString() : null
    let status = 'new' // dummy initial, will be overwritten by UPDATE if not needed

    let query = 'UPDATE emails SET reply_status = $1, replied_at = $2'
    let params: any[] = [reply_status, replied_at]
    let paramIdx = 3

    if (reply_status === 'replied') {
      query += `, status = $${paramIdx++}`
      params.push('sent')
    }

    query += ` WHERE domain = $${paramIdx++}`
    params.push(domain)

    if (owner_id) {
      query += ` AND owner_id = $${paramIdx++}`
      params.push(owner_id)
    }

    await db.query(query, params)
    
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const owner = searchParams.get('owner')

    let query = 'SELECT * FROM emails'
    let params: any[] = []
    
    if (owner) {
      query += ' WHERE owner_id = $1'
      params.push(owner)
    }
    query += ' ORDER BY created_at DESC'
    
    const { rows: data } = await db.query(query, params)
    if (!data || data.length === 0) return NextResponse.json({ error: 'No data' }, { status: 404 })

    const headers = ['Email', 'Domain', 'Contact', 'Position', 'Source', 'Status', 'Sent Date', 'R1 Date', 'R2 Date', 'R3 Date', 'Subject']
    const rows = data.map(e => [
      e.address,
      e.domain || '',
      e.contact_name || '',
      e.position || '',
      e.source_type || '',
      e.status,
      e.sent_at ? new Date(e.sent_at).toLocaleDateString('vi-VN') : '',
      e.remind1_sent_at ? new Date(e.remind1_sent_at).toLocaleDateString('vi-VN') : '',
      e.remind2_sent_at ? new Date(e.remind2_sent_at).toLocaleDateString('vi-VN') : '',
      e.remind3_sent_at ? new Date(e.remind3_sent_at).toLocaleDateString('vi-VN') : '',
      e.last_subject || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))

    const csv = [headers.join(','), ...rows].join('\n')
    
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="coincu-emails-${new Date().toISOString().slice(0,10)}.csv"`
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

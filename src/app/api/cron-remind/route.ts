import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const REMIND_DAYS = 4
const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  // Security check
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== (process.env.CRON_SECRET || 'coincu-cron-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const cutoff = new Date(now - REMIND_DAYS * DAY_MS).toISOString()

  try {
    // Find emails needing R1
    const { rows: needR1 } = await db.query(
      `SELECT id FROM emails WHERE status = 'sent' AND remind1_sent_at IS NULL AND sent_at < $1`,
      [cutoff]
    )
    
    // Find emails needing R2
    const { rows: needR2 } = await db.query(
      `SELECT id FROM emails WHERE status = 'sent' AND remind1_sent_at IS NOT NULL AND remind2_sent_at IS NULL AND remind1_sent_at < $1`,
      [cutoff]
    )
    
    // Find emails needing R3
    const { rows: needR3 } = await db.query(
      `SELECT id FROM emails WHERE status = 'sent' AND remind2_sent_at IS NOT NULL AND remind3_sent_at IS NULL AND remind2_sent_at < $1`,
      [cutoff]
    )

    const host = req.headers.get('host')
    const protocol = req.headers.get('x-forwarded-proto') || 'https'
    const APP_URL = `${protocol}://${host}`

    let sent = 0, failed = 0

    for (const [emails, num] of [[needR1||[], 1], [needR2||[], 2], [needR3||[], 3]] as [any[], number][]) {
      for (const e of emails) {
        try {
          const r = await fetch(`${APP_URL}/api/remind`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emailId: e.id, remindNum: num })
          })
          const d = await r.json()
          if (d.ok) sent++; else failed++
        } catch { failed++ }
      }
    }

    return NextResponse.json({ 
      ok: true, sent, failed,
      summary: { needR1: needR1?.length||0, needR2: needR2?.length||0, needR3: needR3?.length||0 }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

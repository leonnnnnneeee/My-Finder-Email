import { NextRequest, NextResponse } from 'next/server'

const RESEND_KEY = process.env.RESEND_API_KEY

export async function GET() {
  const r = await fetch('https://api.resend.com/domains', {
    headers: { 'Authorization': `Bearer ${RESEND_KEY}` }
  })
  return NextResponse.json(await r.json())
}

export async function POST(req: NextRequest) {
  const { action, domainId } = await req.json()
  if (action === 'add') {
    const r = await fetch('https://api.resend.com/domains', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'coincu.com' })
    })
    return NextResponse.json(await r.json())
  }
  if (action === 'verify' && domainId) {
    const r = await fetch(`https://api.resend.com/domains/${domainId}/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}` }
    })
    return NextResponse.json(await r.json())
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}

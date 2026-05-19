import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const key = process.env.RESEND_FULL_KEY || process.env.RESEND_API_KEY
  const r = await fetch('https://api.resend.com/domains', {
    headers: { 'Authorization': `Bearer ${key}` }
  })
  return NextResponse.json(await r.json())
}

export async function POST(req: NextRequest) {
  const key = process.env.RESEND_FULL_KEY || process.env.RESEND_API_KEY
  const { action, domainId } = await req.json()

  if (action === 'add') {
    const r = await fetch('https://api.resend.com/domains', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'coincu.com', region: 'us-east-1' })
    })
    return NextResponse.json(await r.json())
  }

  if (action === 'verify' && domainId) {
    const r = await fetch(`https://api.resend.com/domains/${domainId}/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` }
    })
    return NextResponse.json(await r.json())
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}

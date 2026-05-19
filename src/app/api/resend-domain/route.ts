import { NextRequest, NextResponse } from 'next/server'

const DOMAIN_ID = '33073cd6-8b31-4e2e-93cd-d8d76d994acd'

export async function GET() {
  const key = process.env.RESEND_FULL_KEY || process.env.RESEND_API_KEY
  // Lấy domain details kèm DNS records
  const r = await fetch(`https://api.resend.com/domains/${DOMAIN_ID}`, {
    headers: { 'Authorization': `Bearer ${key}` }
  })
  return NextResponse.json(await r.json())
}

export async function POST(req: NextRequest) {
  const key = process.env.RESEND_FULL_KEY || process.env.RESEND_API_KEY
  const { action } = await req.json()

  if (action === 'verify') {
    const r = await fetch(`https://api.resend.com/domains/${DOMAIN_ID}/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` }
    })
    return NextResponse.json(await r.json())
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}

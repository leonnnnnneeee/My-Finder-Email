import { NextRequest, NextResponse } from 'next/server'

const CF_TOKEN = process.env.CF_API_TOKEN
const RESEND_KEY = process.env.RESEND_FULL_KEY || process.env.RESEND_API_KEY
const DOMAIN_ID = '33073cd6-8b31-4e2e-93cd-d8d76d994acd'

export async function GET() {
  // Lấy zone ID của coincu.com
  const r = await fetch('https://api.cloudflare.com/client/v4/zones?name=coincu.com', {
    headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' }
  })
  return NextResponse.json(await r.json())
}

export async function POST(req: NextRequest) {
  const { action } = await req.json()

  if (action === 'get_zone') {
    const r = await fetch('https://api.cloudflare.com/client/v4/zones?name=coincu.com', {
      headers: { 'Authorization': `Bearer ${CF_TOKEN}` }
    })
    return NextResponse.json(await r.json())
  }

  if (action === 'add_records') {
    const { zoneId } = await req.json().catch(()=>({zoneId:''}))
    // Thêm 4 DNS records cho Resend
    // Đầu tiên lấy DNS records từ Resend
    const resendR = await fetch(`https://api.resend.com/domains/${DOMAIN_ID}`, {
      headers: { 'Authorization': `Bearer ${RESEND_KEY}` }
    })
    const resendData = await resendR.json()
    return NextResponse.json({ resendDomain: resendData })
  }

  return NextResponse.json({ error: 'unknown' }, { status: 400 })
}

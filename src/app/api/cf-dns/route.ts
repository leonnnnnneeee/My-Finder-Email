import { NextRequest, NextResponse } from 'next/server'

const CF_TOKEN = process.env.CF_API_TOKEN
const RESEND_KEY = process.env.RESEND_FULL_KEY || process.env.RESEND_API_KEY
const DOMAIN_ID = '33073cd6-8b31-4e2e-93cd-d8d76d994acd'
const ZONE_ID = 'e659a7e231199cc3899d98c2a9508053'

async function addRecord(type: string, name: string, content: string, priority?: number) {
  const body: any = { type, name, content, ttl: 1, proxied: false }
  if (priority) body.priority = priority
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  return await r.json()
}

export async function GET() {
  // Lấy DNS records hiện tại
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`, {
    headers: { 'Authorization': `Bearer ${CF_TOKEN}` }
  })
  return NextResponse.json(await r.json())
}

export async function POST(req: NextRequest) {
  const { action } = await req.json()

  if (action === 'add_resend_records') {
    // Lấy records từ Resend
    const resendR = await fetch(`https://api.resend.com/domains/${DOMAIN_ID}`, {
      headers: { 'Authorization': `Bearer ${RESEND_KEY}` }
    })
    const resendData = await resendR.json()
    const records = resendData.records || []

    const results = []
    for (const rec of records) {
      const r = await addRecord(
        rec.type,
        rec.name,
        rec.value,
        rec.priority
      )
      results.push({ name: rec.name, type: rec.type, success: r.success, errors: r.errors })
    }
    return NextResponse.json({ results })
  }

  if (action === 'verify_resend') {
    const r = await fetch(`https://api.resend.com/domains/${DOMAIN_ID}/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}` }
    })
    return NextResponse.json(await r.json())
  }

  return NextResponse.json({ error: 'unknown' }, { status: 400 })
}

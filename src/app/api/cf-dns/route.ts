import { NextRequest, NextResponse } from 'next/server'

const RESEND_KEY = process.env.RESEND_FULL_KEY || process.env.RESEND_API_KEY
const DOMAIN_ID = '33073cd6-8b31-4e2e-93cd-d8d76d994acd'
const ZONE_ID = 'e659a7e231199cc3899d98c2a9508053'

async function addRecord(token: string, type: string, name: string, content: string, priority?: number) {
  const body: any = { type, name, content, ttl: 1, proxied: false }
  if (priority) body.priority = priority
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return await r.json()
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, token } = body
  // Dùng token từ request hoặc env
  const cfToken = token || process.env.CF_API_TOKEN

  if (action === 'add_resend_records') {
    // Lấy records từ Resend
    const resendR = await fetch(`https://api.resend.com/domains/${DOMAIN_ID}`, {
      headers: { 'Authorization': `Bearer ${RESEND_KEY}` }
    })
    const resendData = await resendR.json()
    const records = resendData.records || []

    const results = []
    for (const rec of records) {
      const r = await addRecord(cfToken, rec.type, rec.name, rec.value, rec.priority)
      results.push({
        name: rec.name,
        type: rec.type,
        success: r.success,
        errors: r.errors
      })
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

  if (action === 'list_zones') {
    const r = await fetch('https://api.cloudflare.com/client/v4/zones', {
      headers: { 'Authorization': `Bearer ${cfToken}` }
    })
    const d = await r.json()
    return NextResponse.json({ zones: d.result?.map((z: any) => ({ id: z.id, name: z.name, status: z.status })) })
  }

  if (action === 'check_zone') {
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?per_page=5`, {
      headers: { 'Authorization': `Bearer ${cfToken}` }
    })
    return NextResponse.json(await r.json())
  }

  return NextResponse.json({ error: 'unknown' }, { status: 400 })
}

export async function GET() {
  const cfToken = process.env.CF_API_TOKEN
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?per_page=5`, {
    headers: { 'Authorization': `Bearer ${cfToken}` }
  })
  return NextResponse.json(await r.json())
}

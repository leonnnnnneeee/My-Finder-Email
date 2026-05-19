import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function GET() {
  const hasResend = !!process.env.RESEND_API_KEY
  return NextResponse.json({ configured: hasResend, provider: hasResend ? 'resend' : 'none' })
}

export async function POST(req: NextRequest) {
  const { to, subject, body, fromName, isTest } = await req.json()
  if (!to || !subject || !body) return NextResponse.json({ error: 'Thiếu to, subject, body' }, { status: 400 })
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'Chưa cấu hình RESEND_API_KEY' }, { status: 500 })

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;padding:20px;color:#333">
      ${isTest ? '<div style="background:#fff3cd;border:1px solid #ffc107;padding:8px 12px;border-radius:4px;margin-bottom:16px;font-size:12px">📧 <strong>TEST EMAIL</strong></div>' : ''}
      <div style="white-space:pre-wrap;line-height:1.7">${body.replace(/\n/g, '<br>')}</div>
    </div>`

    await resend.emails.send({
      from: `${fromName || 'LEON (Mr.) — Coincu'} <onboarding@resend.dev>`,
      replyTo: 'leon@coincu.com',
      to,
      subject: isTest ? `[TEST] ${subject}` : subject,
      html
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, fromName, fromEmail, isTest } = await req.json()

    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'Thiếu to, subject hoặc body' }, { status: 400 })
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    const senderName = fromName || 'LEON (Mr.) — Coincu'
    const senderEmail = fromEmail || process.env.SMTP_USER

    // Tracking pixel
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my-finder-email-v2bh.vercel.app'
    const pixel = `<img src="${appUrl}/api/track-open?test=1" width="1" height="1" style="display:none;border:0" />`

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
        ${isTest ? '<div style="background:#fff3cd;border:1px solid #ffc107;padding:8px 12px;border-radius:4px;margin-bottom:16px;font-size:12px">📧 <strong>TEST EMAIL</strong> — Gửi từ Coincu Email Finder</div>' : ''}
        <div style="white-space:pre-wrap;line-height:1.7">${body.replace(/\n/g, '<br>')}</div>
        ${pixel}
      </div>
    `

    await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to,
      subject: isTest ? `[TEST] ${subject}` : subject,
      text: body,
      html: htmlBody,
    })

    // Gửi Telegram notify nếu là email thật
    if (!isTest && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const msg = `✅ Email đã gửi!\n📧 To: ${to}\n📋 Subject: ${subject}\n⏰ ${new Date().toLocaleString('vi-VN')}`
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: msg })
      }).catch(() => {})
    }

    return NextResponse.json({ 
      success: true, 
      message: `Email đã gửi đến ${to}`,
      isTest: !!isTest
    })

  } catch (err: any) {
    console.error('Send email error:', err)
    return NextResponse.json({ 
      error: err.message || 'Lỗi gửi email',
      detail: err.code || ''
    }, { status: 500 })
  }
}

// GET — kiểm tra SMTP config
export async function GET() {
  const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  return NextResponse.json({ 
    configured,
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    user: process.env.SMTP_USER ? process.env.SMTP_USER.replace(/(.{3}).*(@)/, '$1***$2') : null,
    from: process.env.SMTP_USER || null
  })
}

import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { supabase } from '@/lib/supabase'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://my-finder-email-v2bh.vercel.app'

async function notifyTelegram(type: string, data: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return
  try {
    const time = new Date().toLocaleString('vi-VN')
    const msg = type === 'send_done'
      ? `✅ <b>Gửi email xong!</b>\n\n📨 <b>${data.sent}</b> email thành công · ${data.failed} lỗi\n⏰ ${time}`
      : `📬 ${data.message || 'Notification'}`
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
    })
  } catch {}
}

export async function POST(req: NextRequest) {
  const { fromName, fromEmail, subject, body } = await req.json()
  if (!fromName || !fromEmail || !subject || !body)
    return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 })

  const { data: emails } = await supabase
    .from('emails').select('*').eq('status', 'new').order('created_at', { ascending: true })

  if (!emails?.length)
    return NextResponse.json({ error: 'Không có email chưa gửi', sent: 0 }, { status: 400 })

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  const results: any[] = []

  for (const email of emails) {
    const project = email.contact_name || email.domain?.split('.')[0] || 'Project'
    const personalised = body
      .replace(/\{\{email\}\}/g, email.address)
      .replace(/\{\{domain\}\}/g, email.domain || '')
      .replace(/\{\{name\}\}/g, email.contact_name || 'Team')
      .replace(/\{\{project\}\}/g, project)

    const personalisedSubject = subject
      .replace(/\{\{project\}\}/g, project)
      .replace(/\{\{email\}\}/g, email.address)

    // Tracking pixel — nhúng vào cuối HTML
    const pixel = `<img src="${APP_URL}/api/track-open?id=${email.id}" width="1" height="1" style="display:none;border:0" />`
    const htmlBody = personalised.replace(/\n/g, '<br>') + pixel

    let status: 'success' | 'failed' = 'success'
    let errorMsg = null

    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email.address,
        subject: personalisedSubject,
        text: personalised,
        html: htmlBody,
      })
      await supabase.from('emails').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', email.id)
    } catch (err: any) {
      status = 'failed'
      errorMsg = err.message
      await supabase.from('emails').update({ status: 'failed' }).eq('id', email.id)
    }

    await supabase.from('send_logs').insert({
      email_id: email.id, subject: personalisedSubject, body: personalised,
      from_name: fromName, from_email: fromEmail, status, error_msg: errorMsg,
    })

    results.push({ address: email.address, status, error: errorMsg })
  }

  const sent = results.filter(r => r.status === 'success').length
  await notifyTelegram('send_done', { sent, failed: results.length - sent })
  return NextResponse.json({ sent, failed: results.length - sent, results })
}

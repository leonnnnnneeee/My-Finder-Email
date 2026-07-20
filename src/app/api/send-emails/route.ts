import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import nodemailer from 'nodemailer'
import { supabase } from '@/lib/supabase'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://my-finder-email-v2bh.vercel.app'

async function notifyTelegram(sent: number, failed: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `✅ <b>Gửi email xong!</b>\n\n📨 <b>${sent}</b> thành công · ${failed} lỗi\n⏰ ${new Date().toLocaleString('vi-VN')}`,
      parse_mode: 'HTML'
    })
  }).catch(() => {})
}

async function sendViaResend(to: string, from: string, fromName: string, subject: string, html: string) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const senderEmail = process.env.RESEND_FROM_EMAIL || 'leon@coincu.com'
  
  // Gửi email đến recipient
  const { error } = await resend.emails.send({
    from: `${fromName} <${senderEmail}>`,
    replyTo: senderEmail,
    to,
    subject,
    html
  })
  if (error) throw new Error(error.message)
  
  // Gửi copy vào Sent - from chính là leon để Lark nhận đúng folder
  // Dùng subject prefix "✉️ SENT:" để dễ filter trong Lark
  await resend.emails.send({
    from: `${fromName} <${senderEmail}>`,
    to: [senderEmail],
    subject: subject,
    html: `<p style="color:#888;font-size:12px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:16px">
      📤 Đã gửi tới: <strong>${to}</strong><br>
      🕐 ${new Date().toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})}
    </p>${html}`
  }).catch(() => {}) // Không throw nếu copy fail
}

async function sendViaSMTP(to: string, from: string, fromName: string, subject: string, text: string, html: string) {
  const host = process.env.SMTP_HOST || 'smtp-mail.outlook.com'
  const port = Number(process.env.SMTP_PORT) || 587
  const user = process.env.SMTP_USER || ''
  const pass = process.env.SMTP_PASS || ''
  const transporter = nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  })
  await transporter.verify()
  await transporter.sendMail({
    from: `"${fromName}" <${user}>`,
    replyTo: from,
    to, subject, text, html
  })
}

export async function GET() {
  // Test SMTP/Resend connection
  const hasSMTP = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  const hasResend = !!process.env.RESEND_API_KEY
  return NextResponse.json({
    resend: hasResend ? 'configured' : 'not set',
    smtp: hasSMTP ? 'configured' : 'not set',
    provider: hasSMTP ? 'smtp' : hasResend ? 'resend' : 'none'
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  
  // Test send to 1 email
  if (body.testTo) {
    const { testTo, fromName, fromEmail, subject, bodyText } = body
    const hasResend = !!process.env.RESEND_API_KEY
    const hasSMTP = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
    
    if (!hasResend && !hasSMTP) {
      return NextResponse.json({ error: 'Chưa cấu hình SMTP hoặc Resend API key' }, { status: 400 })
    }

    try {
      const htmlBody = (bodyText||'Test email from Coincu').replace(/\n/g, '<br>')
      if (hasResend) {
        await sendViaResend(testTo, fromEmail||'leon@coincu.com', fromName||'LEON', subject||'Test', htmlBody)
      } else if (hasSMTP) {
        await sendViaSMTP(testTo, fromEmail||'leon@coincu.com', fromName||'LEON', subject||'Test', bodyText||'Test', htmlBody)
      }
      return NextResponse.json({ ok: true, provider: hasResend ? 'resend' : 'smtp' })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
    }
  }

  // Bulk send
  const { fromName, fromEmail, subject, body: bodyText, owner_id } = body
  if (!fromName || !fromEmail || !subject || !bodyText)
    return NextResponse.json({ error: 'Thiếu thông tin: fromName, fromEmail, subject, body' }, { status: 400 })

  const hasSMTP = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  const hasResend = !!process.env.RESEND_API_KEY
  if (!hasResend && !hasSMTP)
    return NextResponse.json({ error: 'Chưa cấu hình SMTP hoặc RESEND_API_KEY' }, { status: 400 })

  let q = supabase.from('emails').select('*').eq('status', 'new')
  if (owner_id) q = q.eq('owner_id', owner_id)
  let { data: emails, error: selErr } = await q.order('created_at', { ascending: true }).limit(50)

  if (selErr && selErr.message.includes('owner_id')) {
    const retry = await supabase.from('emails').select('*').eq('status', 'new').order('created_at', { ascending: true }).limit(50)
    emails = retry.data
  }

  if (!emails?.length)
    return NextResponse.json({ error: 'Không có email chưa gửi', sent: 0 }, { status: 400 })

  const results: any[] = []

  for (const email of emails) {
    // Project name: always use domain (capitalized) - contact_name may be article title
    // For BOD emails: use domain as project name too (cleaner)
    const domainProject = email.domain?.split('.')[0]?.replace(/-/g,' ')?.replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Project'
    // Only use contact_name if it's a short person name (2-3 words, no numbers, no long strings)
    const isPersonName = email.contact_name && 
      email.contact_name.split(' ').length <= 3 && 
      email.contact_name.length < 30 &&
      !email.contact_name.includes(',') &&
      !/\d/.test(email.contact_name) &&
      email.source_type === 'hunter_bod'
    const project = isPersonName ? email.domain?.split('.')[0]?.replace(/-/g,' ')?.replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Project' : domainProject
    const personalised = bodyText
      .replace(/\{\{email\}\}/g, email.address)
      .replace(/\{\{domain\}\}/g, email.domain || '')
      .replace(/\{\{name\}\}/g, email.contact_name || 'Team')
      .replace(/\{\{project\}\}/g, project)
    const personalisedSubject = subject
      .replace(/\{\{project\}\}/g, project)
      .replace(/\{\{email\}\}/g, email.address)

    const pixel = `<img src="${APP_URL}/api/receipt?id=${email.id}" width="1" height="1" style="display:none;border:0" />`
    const htmlBody = personalised.replace(/\n/g, '<br>') + pixel

    let status: 'success' | 'failed' = 'success'
    let errorMsg = null

    try {
      if (hasResend) {
        await sendViaResend(email.address, fromEmail, fromName, personalisedSubject, htmlBody)
      } else if (hasSMTP) {
        await sendViaSMTP(email.address, fromEmail, fromName, personalisedSubject, personalised, htmlBody)
      }
      const { error: updateErr } = await supabase.from('emails').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', email.id)
      if (updateErr) throw new Error(`DB Update Error: ${updateErr.message}`)
    } catch (err: any) {
      status = 'failed'
      errorMsg = err.message
      await supabase.from('emails').update({ status: 'failed' }).eq('id', email.id)
    }

    const { error: logErr } = await supabase.from('send_logs').insert({
      email_id: email.id, subject: personalisedSubject, body: personalised,
      from_name: fromName, from_email: fromEmail, status, error_msg: errorMsg,
    })
    if (logErr) console.error('Log Insert Error:', logErr.message)
    results.push({ address: email.address, status, error: errorMsg })
  }

  const sent = results.filter(r => r.status === 'success').length
  await notifyTelegram(sent, results.length - sent)
  return NextResponse.json({ sent, failed: results.length - sent, results })
}

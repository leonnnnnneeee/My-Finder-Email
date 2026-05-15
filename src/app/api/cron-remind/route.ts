import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { supabase } from '@/lib/supabase'

// Vercel Cron: chạy lúc 1h UTC = 8h sáng VN mỗi ngày
// Thêm vào vercel.json: "crons": [{"path": "/api/cron-remind", "schedule": "0 1 * * *"}]

const SUBJECT_TEMPLATES = [
  '', // step 0 — không dùng
  'Quick follow-up — {{project}} & Coincu',
  'Last follow-up — {{project}}',
]

const BODY_TEMPLATES = [
  '',
  // Follow-up 1
  `Hi {{project}},

Just a quick follow-up on my previous email about amplifying {{project}}'s visibility.

At Coincu, we've recently helped several blockchain projects get featured on CMC Top News with great results.

Would you be open to a quick 10-min chat on Telegram? 

TG: https://t.me/iamleonnn

Looking forward to hearing from you.

Best,
LEON (Mr.)
Chief Business Development Officer — Coincu
E: leon@coincu.com`,

  // Follow-up 2 (breaking up)
  `Hi {{project}},

I'll stop bothering you after this email — I promise! 😊

But before I go, I just wanted to say: if {{project}} ever needs PR support, press release distribution, or a CMC Top News feature, I'm here.

We've helped 200+ blockchain projects boost their reach. The door is always open.

Wishing {{project}} all the best!

TG: https://t.me/iamleonnn

LEON (Mr.)
Chief Business Development Officer — Coincu
E: leon@coincu.com`,
]

async function sendTelegramNotification(msg: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
  })
}

export async function GET(req: NextRequest) {
  // Verify cron secret để tránh spam
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Lấy contacts cần remind: chưa reply, đã gửi >10 ngày, sequence < 3
  const tenDaysAgo = new Date()
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('*')
    .not('stage', 'in', '("closed","cold")')
    .eq('replied', false)
    .lt('last_sent_at', tenDaysAgo.toISOString())
    .lt('sequence_step', 3)
    .not('last_sent_at', 'is', null)
    .order('last_sent_at', { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!contacts?.length) {
    return NextResponse.json({ message: 'No contacts need reminding', sent: 0 })
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  let sent = 0
  const results: any[] = []

  for (const contact of contacts) {
    const nextStep = (contact.sequence_step || 0) + 1
    const subject = SUBJECT_TEMPLATES[nextStep]?.replace(/\{\{project\}\}/g, contact.project_name || contact.email.split('@')[0])
    const body = BODY_TEMPLATES[nextStep]?.replace(/\{\{project\}\}/g, contact.project_name || contact.email.split('@')[0])

    if (!subject || !body) continue

    // Thêm tracking pixel
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my-finder-email-v2bh.vercel.app'
    const trackingPixel = `<img src="${appUrl}/api/track-open?cid=${contact.id}" width="1" height="1" style="display:none" />`
    const htmlBody = body.replace(/\n/g, '<br>') + trackingPixel

    try {
      await transporter.sendMail({
        from: `"LEON (Mr.) — Coincu" <${process.env.SMTP_USER}>`,
        to: contact.email,
        subject,
        text: body,
        html: htmlBody,
      })

      // Cập nhật contact
      await supabase.from('contacts').update({
        sequence_step: nextStep,
        last_sent_at: new Date().toISOString(),
        stage: nextStep >= 3 ? 'cold' : contact.stage === 'new' ? 'contacted' : contact.stage,
        updated_at: new Date().toISOString(),
      }).eq('id', contact.id)

      // Ghi log
      await supabase.from('remind_logs').insert({
        contact_id: contact.id,
        sequence_step: nextStep,
        subject,
        status: 'sent',
      })

      sent++
      results.push({ email: contact.email, project: contact.project_name, step: nextStep, status: 'sent' })
    } catch (err: any) {
      results.push({ email: contact.email, project: contact.project_name, step: nextStep, status: 'failed', error: err.message })
    }
  }

  // Gửi Telegram summary
  if (sent > 0) {
    await sendTelegramNotification(
      `⏰ <b>Auto-remind hoàn tất!</b>\n\n📨 Đã gửi <b>${sent}</b> follow-up emails\n📋 ${contacts.length} contacts được kiểm tra\n⏰ ${new Date().toLocaleString('vi-VN')}`
    )
  }

  return NextResponse.json({ sent, total: contacts.length, results })
}

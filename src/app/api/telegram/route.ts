import { NextRequest, NextResponse } from 'next/server'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

type TelegramPayload = {
  type: 'replied' | 'opened' | 'new_email' | 'remind_done' | 'crawl_done' | 'custom'
  project?: string
  email?: string
  content?: string
  count?: number
  message?: string
}

function buildMessage(payload: TelegramPayload): string {
  const time = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })

  switch (payload.type) {
    case 'replied':
      return `🔥 <b>Contact replied!</b>\n\n📦 <b>Project:</b> ${payload.project || '?'}\n📧 <b>Email:</b> ${payload.email || '?'}\n💬 <b>Reply:</b>\n${payload.content || '(empty)'}\n\n⏰ ${time}\n\n👉 Reply trong 5 phút để tăng close rate 70%!`

    case 'opened':
      return `👁 <b>Email opened!</b>\n\n📦 <b>Project:</b> ${payload.project || '?'}\n📧 <b>Email:</b> ${payload.email || '?'}\n⏰ ${time}\n\n💡 Follow up ngay trong vòng 1 tiếng!`

    case 'new_email':
      return `✅ <b>Email mới tìm được!</b>\n\n📧 ${payload.email}\n📦 Project: ${payload.project || '?'}\n⏰ ${time}`

    case 'remind_done':
      return `⏰ <b>Auto-remind hoàn tất!</b>\n\n📨 Đã gửi <b>${payload.count || 0}</b> follow-up emails\n⏰ ${time}`

    case 'crawl_done':
      return `🕷 <b>Quét sites xong!</b>\n\n📧 Tìm được <b>${payload.count || 0}</b> email mới từ 19 crypto sites\n⏰ ${time}`

    case 'custom':
      return payload.message || 'Notification from Crypto Email Finder'

    default:
      return `📬 Notification\n${payload.message || ''}\n⏰ ${time}`
  }
}

export async function POST(req: NextRequest) {
  if (!BOT_TOKEN || !CHAT_ID) {
    return NextResponse.json({ error: 'Telegram not configured. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.' }, { status: 400 })
  }

  const payload: TelegramPayload = await req.json()
  const text = buildMessage(payload)

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
      })
    })

    const data = await res.json()
    if (!data.ok) {
      return NextResponse.json({ error: data.description }, { status: 500 })
    }

    return NextResponse.json({ sent: true, message_id: data.result?.message_id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET để test kết nối
export async function GET() {
  if (!BOT_TOKEN || !CHAT_ID) {
    return NextResponse.json({ ok: false, error: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID' })
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`)
    const data = await res.json()
    return NextResponse.json({ ok: data.ok, bot: data.result?.username, chat_id: CHAT_ID })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message })
  }
}

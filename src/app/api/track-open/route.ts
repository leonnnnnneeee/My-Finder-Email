import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const emailId = searchParams.get('id')
  const contactId = searchParams.get('cid')

  if (emailId || contactId) {
    try {
      // Ghi event opened
      await supabase.from('email_events').insert({
        email_id: emailId || null,
        event_type: 'opened',
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown',
      })

      // Cập nhật trạng thái opened trên contact
      if (contactId) {
        await supabase.from('contacts').update({
          opened: true,
          opened_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', contactId)

        // Gửi Telegram notification khi contact mở email
        const { data: contact } = await supabase
          .from('contacts')
          .select('email, project_name, stage')
          .eq('id', contactId)
          .single()

        if (contact && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
          const msg = `👁 Email opened!\n\n📦 Project: ${contact.project_name || 'Unknown'}\n📧 Email: ${contact.email}\n📊 Stage: ${contact.stage}\n⏰ ${new Date().toLocaleString('vi-VN')}\n\n💡 Follow up NOW for best results!`
          
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: msg,
              parse_mode: 'HTML'
            })
          })
        }
      }
    } catch (err) {
      // Silent fail — không làm lộ lỗi ra ngoài
      console.error('Tracking error:', err)
    }
  }

  // Trả về pixel 1x1 trong suốt
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}

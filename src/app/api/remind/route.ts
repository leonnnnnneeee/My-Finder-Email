import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Resend } from 'resend'
import nodemailer from 'nodemailer'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://my-finder-email-v2bh.vercel.app'

const FALLBACK: Record<number, (p: string, s: string) => {subject: string; body: string}> = {
  1: (p, s) => ({
    subject: `Quick follow-up: ${p} × Coincu visibility`,
    body: `Hi,\n\nI wanted to quickly follow up on my note about amplifying ${p}'s presence in the market.\n\nCoincu works with exchanges and blockchain projects across Southeast Asia — helping them land CoinMarketCap Top News placements and tier-1 press coverage that drives real traffic.\n\nWould you be open to a quick 15-min call, or feel free to ping me directly on Telegram: https://t.me/iamleonnn\n\nBest,\nLEON (Mr.) | CBO — Coincu | leon@coincu.com`
  }),
  2: (p, s) => ({
    subject: `${p} + Coincu — a few results worth sharing`,
    body: `Hi,\n\nI wanted to share something relevant before I move on.\n\nOne of our recent exchange clients saw a 4x increase in organic search impressions within 3 weeks of a combined PR + CMC Top News campaign. Another DeFi protocol we worked with went from 0 to 12 major media pickups in a single month.\n\nGiven ${p}'s current momentum, I think the timing could be ideal. We have a limited number of campaign slots open for Q2.\n\nHappy to share a tailored proposal if you're open to it: https://t.me/iamleonnn\n\nBest,\nLEON (Mr.) | CBO — Coincu | leon@coincu.com`
  }),
  3: (p, s) => ({
    subject: `Last note from Coincu — ${p}`,
    body: `Hi,\n\nThis will be my last message — I don't want to crowd your inbox.\n\nIf the timing isn't right for ${p} right now, no worries at all. We'd love to reconnect whenever it makes sense on your end.\n\nJust know the door is open: https://t.me/iamleonnn\n\nWishing ${p} continued success.\n\nBest,\nLEON (Mr.) | CBO — Coincu | leon@coincu.com`
  })
}

async function generateRemind(
  originalSubject: string,
  originalBody: string,
  remindNum: number,
  project: string
): Promise<{subject: string; body: string}> {
  const instructions = [
    `FOLLOW-UP #1 — Warm Re-engagement (4–5 lines):
• Open by referencing the original email naturally — don't repeat the same opener
• State ONE specific benefit of Coincu (CoinMarketCap Top News, PR distribution, organic reach)
• End with a soft, low-friction CTA: ask if they're the right contact, or invite a quick Telegram chat
• Tone: warm, curious, zero pressure`,

    `FOLLOW-UP #2 — Proof & Urgency (5–6 lines):
• Open with something fresh — a result, a market observation, or a relevant trend for their sector
• Include a concrete proof point (e.g. "A recent exchange client 3x'd their press mentions in 4 weeks...")
• Create gentle urgency: limited Q2 slots, current market momentum, or a relevant timing hook
• Close with a clear CTA — propose a brief call or direct Telegram
• Tone: confident, consultative, peer-level`,

    `FOLLOW-UP #3 — Gracious Exit (3 lines max):
• Acknowledge it's your last note — be direct and respectful
• Leave the door genuinely open — no passive aggression, no FOMO pressure
• One clean value statement, then close warmly
• Tone: dignified, no desperation`
  ]

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `You are LEON, CBO at Coincu — a blockchain PR & marketing firm in Southeast Asia serving 200+ Web3 clients globally. You write sharp, professional B2B sales emails that don't sound like templates.

ORIGINAL EMAIL CONTEXT:
Subject: ${originalSubject}
Body:
${originalBody}

TARGET PROJECT: ${project}

YOUR TASK — ${instructions[remindNum - 1]}

HARD RULES:
- English only
- No emojis in body
- Subject: specific and creative (NOT just "Following up")  
- Telegram link must appear exactly: https://t.me/iamleonnn
- Signature must be exactly: LEON (Mr.) | CBO — Coincu | leon@coincu.com
- Do NOT start with the same opener as the original email
- Return ONLY raw JSON, no markdown, no code fences:
{"subject":"...","body":"..."}`
        }]
      })
    })
    const d = await resp.json()
    const text = d.content?.[0]?.text || ''
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return FALLBACK[remindNum](project, originalSubject)
  }
}

export async function POST(req: NextRequest) {
  const { emailId, remindNum } = await req.json()
  if (!emailId || ![1,2,3].includes(remindNum)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const { data: email } = await supabase.from('emails').select('*').eq('id', emailId).single()
  if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 })

  // Always use domain as project name - contact_name may be article title
  const project = email.domain?.split('.')[0]?.replace(/-/g,' ')?.replace(/\b\w/g, (c: string) => c.toUpperCase()) || email.contact_name?.split(' ').slice(0,2).join(' ') || 'Project'
  const originalSubject = email.last_subject || `Boost ${project} Visibility — Coincu PR & CMC Top News`
  const originalBody = email.last_body || `Hi, I reached out about PR and CMC Top News for ${project}.`

  const { subject, body } = await generateRemind(originalSubject, originalBody, remindNum, project)

  const pixel = `<img src="${APP_URL}/api/receipt?id=${email.id}" width="1" height="1" style="display:none;border:0" />`
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;line-height:1.7;color:#333">${body.replace(/\n/g, '<br>')}</div>${pixel}`

  try {
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'LEON (Mr.) — Coincu <leon@coincu.com>',
        replyTo: 'leon@coincu.com',
        to: email.address,
        subject,
        html
      })
      // Copy vào Sent
      await resend.emails.send({
        from: 'LEON (Mr.) — Coincu <leon@coincu.com>',
        to: ['leon@coincu.com'],
        subject: subject,
        html: `<p style="color:#888;font-size:12px">📤 Remind ${remindNum} gửi tới: <strong>${email.address}</strong> · ${new Date().toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</p>${html}`
      }).catch(()=>{})
    } else {
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        tls: { rejectUnauthorized: false }
      })
      await t.sendMail({
        from: `"LEON (Mr.) — Coincu" <${process.env.SMTP_USER}>`,
        replyTo: 'leon@coincu.com',
        bcc: 'leon@coincu.com',
        to: email.address,
        subject,
        text: body,
        html
      })
    }

    await supabase.from('emails').update({
      [`remind${remindNum}_sent_at`]: new Date().toISOString(),
      [`remind${remindNum}_status`]: 'sent',
      [`remind${remindNum}_subject`]: subject,
    }).eq('id', emailId)

    return NextResponse.json({ ok: true, subject, body })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

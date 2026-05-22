import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Resend } from 'resend'
import nodemailer from 'nodemailer'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://my-finder-email-v2bh.vercel.app'

async function generateRemind(originalSubject: string, originalBody: string, remindNum: number, project: string): Promise<{subject: string; body: string}> {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY||'', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 500,
        messages: [{ role: 'user', content: `You are LEON, Chief Business Development Officer at Coincu — a leading blockchain PR & marketing agency in Southeast Asia. You write concise, professional sales follow-up emails.

ORIGINAL EMAIL SENT:
Subject: ${originalSubject}
Body: ${originalBody}

PROJECT: ${project}
FOLLOW-UP NUMBER: ${remindNum} of 3

INSTRUCTIONS:
${remindNum === 1 ? `Write a short, warm follow-up (4-5 lines max).
- Start with "Just wanted to follow up on my previous email"
- Briefly restate the value proposition in 1 sentence
- End with a soft CTA (reply or Telegram)
- Tone: friendly, not pushy` : remindNum === 2 ? `Write a value-driven follow-up (5-6 lines).
- Start differently from follow-up 1 (e.g. "I wanted to share...")
- Add a specific proof point: "We recently helped [type of project] achieve [result] through our PR & CMC Top News campaigns"
- Create mild urgency: mention limited slots or current momentum
- Tone: professional, confident` : `Write a very short final follow-up (3-4 lines max).
- Acknowledge this is your last outreach
- Leave the door open: "If timing isn't right, no worries"
- One last value hook in 1 sentence
- Tone: gracious, no pressure`}

RULES:
- Write in English
- Keep subject line concise and relevant
- Include exactly: https://t.me/iamleonnn
- Sign off: LEON (Mr.) | CBO — Coincu | leon@coincu.com
- Do NOT use emojis in body text
- Return ONLY valid JSON with no extra text: {"subject":"...","body":"..."}` }]
      })
    })
    const d = await r.json()
    const text = d.content?.[0]?.text || ''
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    const subjects = [`Re: ${originalSubject}`, `Following up: ${project} × Coincu`, `Final follow-up: ${project} visibility`]
    const bodies = [
      `Hi,\n\nFollowing up on my previous email about boosting ${project}'s visibility.\n\nWould love to connect: https://t.me/iamleonnn\n\nBest,\nLEON (Mr.) | Coincu | leon@coincu.com`,
      `Hi,\n\nReaching out again about ${project} × Coincu partnership.\n\nWe've helped 200+ blockchain projects boost reach through PR & CMC Top News.\n\nInterested? https://t.me/iamleonnn\n\nBest,\nLEON (Mr.) | Coincu | leon@coincu.com`,
      `Hi,\n\nLast follow-up on ${project} × Coincu. If timing isn't right, no worries!\n\nFeel free to reach out anytime: https://t.me/iamleonnn\n\nBest,\nLEON (Mr.) | Coincu | leon@coincu.com`
    ]
    return { subject: subjects[remindNum-1], body: bodies[remindNum-1] }
  }
}

export async function POST(req: NextRequest) {
  const { emailId, remindNum } = await req.json()
  if (!emailId || ![1,2,3].includes(remindNum)) return NextResponse.json({ error: 'Invalid' }, { status: 400 })

  const { data: email } = await supabase.from('emails').select('*').eq('id', emailId).single()
  if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const project = email.contact_name?.split(' ').slice(0,3).join(' ') || email.domain?.split('.')[0] || 'Project'
  const originalSubject = email.last_subject || `Boost ${project} Visibility — Coincu PR`
  const originalBody = email.last_body || `Hi, I reached out about PR and visibility for ${project}.`

  const { subject, body } = await generateRemind(originalSubject, originalBody, remindNum, project)

  const pixel = `<img src="${APP_URL}/api/track-open?id=${email.id}" width="1" height="1" style="display:none;border:0" />`
  const html = body.replace(/\n/g, '<br>') + pixel

  try {
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({ from: 'LEON (Mr.) — Coincu <leon@coincu.com>', replyTo: 'leon@coincu.com', bcc: ['leon@coincu.com'], to: email.address, subject, html })
    } else {
      const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT)||587, secure: false, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, tls: { rejectUnauthorized: false } })
      await t.sendMail({ from: `"LEON (Mr.) — Coincu" <${process.env.SMTP_USER}>`, replyTo: 'leon@coincu.com', bcc: 'leon@coincu.com', to: email.address, subject, text: body, html })
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

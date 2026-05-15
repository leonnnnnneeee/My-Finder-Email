# 📧 Crypto Email Finder — Sales CRM

Hệ thống tìm email crypto, auto-remind 3 lần/tháng, email open tracking, Telegram notification.

## Stack
- **Next.js 15** — Frontend + API routes
- **Supabase** — Database (emails, contacts, tracking events)
- **Vercel** — Deploy + Cron job tự động
- **Hunter.io** — Tìm email BOD (CEO/CFO/CMO)
- **Nodemailer** — Gửi email qua SMTP

## Tính năng
- 19 crypto sites có sẵn, quét 1 click
- Lọc chỉ lấy dự án crypto (bỏ non-crypto tự động)
- Email open tracking pixel 1×1
- Telegram notification khi contact mở email / reply
- Auto-remind 3 lần/tháng (cron 8h sáng)
- Pipeline Kanban: New → Contacted → Interested → Negotiating → Closed
- Hunter.io BOD search (CEO/CFO/CMO/CTO)
- Bỏ trùng tự động với Supabase

---

## Setup

### 1. Supabase
1. Tạo project tại https://supabase.com
2. Vào **SQL Editor**, chạy `supabase_migration.sql` và `supabase_migration_v2.sql`
3. Lấy **URL** và **anon key** tại Settings → API

### 2. Hunter.io
1. Tạo tài khoản tại https://hunter.io
2. Lấy API key tại https://hunter.io/api-keys

### 3. Anthropic API
1. Lấy key tại https://console.anthropic.com/settings/api-keys

### 4. SMTP (Gmail)
1. Bật 2FA trên Gmail
2. Tạo App Password tại https://myaccount.google.com/apppasswords

### 5. Telegram Bot
1. Chat với @BotFather trên Telegram → `/newbot`
2. Lấy **Bot Token**
3. Gửi tin nhắn cho bot → gọi `https://api.telegram.org/bot{TOKEN}/getUpdates` để lấy Chat ID

---

## Environment Variables

Copy `.env.local.example` thành `.env.local`:

```bash
cp .env.local.example .env.local
```

Điền vào:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Hunter.io
HUNTER_API_KEY=xxxxxxxx...

# SMTP (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx

# Telegram
TELEGRAM_BOT_TOKEN=110201543:AAHdq...
TELEGRAM_CHAT_ID=123456789

# App URL (sau khi deploy Vercel)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

---

## Chạy local

```bash
npm install
npm run dev
# Mở http://localhost:3000
```

---

## Deploy Vercel

### Cách 1 — GitHub (khuyên dùng)
1. Push code lên GitHub
2. Vào https://vercel.com → New Project → Import repo
3. Thêm tất cả Environment Variables
4. Deploy

### Cách 2 — CLI
```bash
npx vercel
```

### Cron job tự động
`vercel.json` đã cấu hình cron chạy `/api/cron-remind` lúc **8h sáng VN (1h UTC)** mỗi ngày.

---

## Cấu trúc project

```
src/app/
├── api/
│   ├── emails/          — CRUD email (GET/POST/DELETE)
│   ├── find-emails/     — Scrape email qua Claude AI
│   ├── hunter/          — Hunter.io BOD search
│   ├── crawl-site/      — Crawl bài viết, tránh quét lại trang cũ
│   ├── send-emails/     — Gửi email SMTP + tracking pixel
│   ├── track-open/      — Pixel tracking 1x1 + Telegram notify
│   ├── telegram/        — Gửi Telegram notification
│   └── cron-remind/     — Auto-remind (chạy bởi Vercel Cron)
├── page.tsx             — Giao diện chính
└── layout.tsx
src/lib/
└── supabase.ts          — Supabase client
```

---

## Supabase Tables

| Bảng | Mô tả |
|------|-------|
| `emails` | Email tìm được từ sites |
| `send_logs` | Lịch sử gửi email |
| `competitor_sites` | Sites đối thủ theo dõi |
| `crawled_pages` | Trang đã quét (tránh quét lại) |
| `contacts` | CRM contacts với pipeline stage |
| `email_events` | Events: opened, clicked, replied |
| `remind_logs` | Lịch sử auto-remind |

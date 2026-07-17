'use client'
import { useState, useEffect, useCallback } from 'react'

type Email = { id: string; address: string; source_url?: string | null; domain?: string | null; status: 'new' | 'sent' | 'failed'; contact_name?: string; position?: string; confidence?: number; source_type?: string; created_at?: string; sent_at?: string; remind1_sent_at?: string; remind2_sent_at?: string; remind3_sent_at?: string; remind1_status?: string; remind2_status?: string; remind3_status?: string; owner_id?: string; reply_status?: string; replied_at?: string; last_subject?: string; last_body?: string; notes?: string; open_count?: number; opened_at?: string }
type Site = { id: string; url: string; domain: string; last_crawled_at?: string; total_pages_crawled: number; total_emails_found: number }
type User = { id: string; username: string; role: string; created_at?: string; last_login?: string }
type CurrentUser = { id: string; username: string; role: string } | null
type Template = { id: string; name: string; subject: string; body: string }
type Log = { msg: string; t: 'info' | 'ok' | 'err' | 'dim' | 'warn' }
type StagedEmail = { addr: string; src: string; name: string; domain: string; pos: string; articleUrl: string; articleTitle: string; checked: boolean }
type Contact = { id: string; email: string; project: string; stage: string; seq: number; lastSent: string | null; opened: boolean; note: string }

/* ─── Design tokens ─── */
const C = {
  b0:'#060910', b1:'#0D1117', b2:'#161B27', b3:'#1E2535', b4:'#2A3347',
  t1:'#F1F5F9', t2:'#94A3B8', t3:'#4B5563',
  blue:'#2563EB', blueDim:'#1E3A5F',
  cyan:'#00D4FF', cyanDim:'#042F3E', cyanMid:'#0891B2',
  green:'#10B981', greenDim:'#042F23',
  amber:'#F59E0B', amberDim:'#3A2004',
  red:'#EF4444', redDim:'#3A0505',
  purple:'#8B5CF6', purpleDim:'#1E1040',
  bd:'rgba(255,255,255,0.07)', bd2:'rgba(255,255,255,0.12)',
}

/* ─── Style helpers ─── */
const S = {
  card: (accent?: string): React.CSSProperties => ({
    background: accent || C.b1, border: `1px solid ${C.bd}`,
    borderRadius: 10, padding: '13px 15px', marginBottom: 10,
  }),
  stat: (accent?: string): React.CSSProperties => ({
    background: C.b1, border: `1px solid ${C.bd}`, borderRadius: 10,
    padding: '12px 14px', position: 'relative', overflow: 'hidden',
  }),
  inp: { width: '100%', padding: '8px 11px', border: `1px solid ${C.bd}`, borderRadius: 8, fontSize: 12, background: C.b2, color: C.t1, outline: 'none', boxSizing: 'border-box', fontFamily: "'DM Sans',sans-serif" } as React.CSSProperties,
  btn: (v?: string): React.CSSProperties => ({
    padding: v === 'xl' ? '11px 18px' : v === 'sm' ? '5px 10px' : '8px 14px',
    borderRadius: 8, cursor: 'pointer', fontSize: v === 'sm' ? 11 : 12,
    fontWeight: 500, fontFamily: "'DM Sans',sans-serif", transition: 'all .18s',
    display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' as const,
    border: v === 'p' ? 'none' : v === 'tg' ? `1px solid rgba(0,212,255,.3)` : `1px solid ${C.bd}`,
    background: v === 'p' ? C.blue : v === 'tg' ? C.cyanDim : C.b2,
    color: v === 'p' ? '#fff' : v === 'tg' ? C.cyan : C.t1,
  }),
  bdg: (bg: string, col: string): React.CSSProperties => ({
    fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
    background: bg, color: col, whiteSpace: 'nowrap' as const, flexShrink: 0,
    border: `1px solid ${col}22`,
  }),
  logBox: { background: '#03060d', border: `1px solid ${C.bd}`, borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.9, maxHeight: 160, overflowY: 'auto' as const },
  prog: { height: 3, background: C.b3, borderRadius: 3, overflow: 'hidden', marginBottom: 8 } as React.CSSProperties,
  row: { display: 'flex', gap: 8, alignItems: 'flex-end' } as React.CSSProperties,
}

const lc = (t: Log['t']) => ({ info: C.blue, ok: C.green, err: C.red, dim: C.t3, warn: C.amber })[t]

const STAGES = ['new', 'contacted', 'interested', 'negotiating', 'closed', 'cold']
const SL: Record<string, string> = { new: 'New', contacted: 'Contacted', interested: 'Interested', negotiating: 'Negotiating', closed: 'Closed', cold: 'Cold' }
const SC: Record<string, [string, string]> = {
  new: [`rgba(37,99,235,.15)`, '#60a5fa'], contacted: [`rgba(245,158,11,.12)`, C.amber],
  interested: [`rgba(139,92,246,.12)`, C.purple], negotiating: [`rgba(249,115,22,.12)`, '#f97316'],
  closed: [`rgba(16,185,129,.12)`, C.green], cold: [`rgba(75,85,99,.15)`, '#6b7280'],
}
const AV_COLORS: [string, string][] = [
  [`rgba(37,99,235,.2)`, '#60a5fa'], [`rgba(139,92,246,.2)`, C.purple],
  [`rgba(16,185,129,.2)`, C.green], [`rgba(245,158,11,.2)`, C.amber],
  [`rgba(0,212,255,.15)`, C.cyan], [`rgba(239,68,68,.15)`, C.red],
]

const SITES_PRESET = [
  { n: 'CryptoDaily UK', d: 'cryptodaily.co.uk', i: '🇬🇧' },
  { n: 'BlockchainReporter', d: 'blockchainreporter.net', i: '⛓' },
  { n: 'Finbold', d: 'finbold.com', i: '💹' },
  { n: 'DailyHodl', d: 'dailyhodl.com', i: '📰' },
  { n: 'NewsBTC', d: 'newsbtc.com', i: '₿' },
  { n: 'Optimisus', d: 'optimisus.com', i: '📈' },
  { n: 'LiveBitcoinNews', d: 'livebitcoinnews.com', i: '⚡' },

  { n: 'ZyCrypto', d: 'zycrypto.com', i: '🔐' },
  { n: 'CryptoTimes', d: 'cryptotimes.io', i: '⏰' },
]

const DEMO_CONTACTS: Omit<Contact, 'id'>[] = [
  { email: 'press@alphadefi.io', project: 'AlphaDeFi', stage: 'contacted', seq: 1, lastSent: daysAgo(12), opened: true, note: '' },
  { email: 'contact@tokenlaunch.com', project: 'TokenLaunch', stage: 'contacted', seq: 1, lastSent: daysAgo(9), opened: false, note: '' },
  { email: 'media@cryptostake.io', project: 'CryptoStake', stage: 'interested', seq: 1, lastSent: daysAgo(3), opened: true, note: 'Reply: interested CMC' },
  { email: 'info@nftmint.com', project: 'NFTMint', stage: 'new', seq: 0, lastSent: null, opened: false, note: '' },
  { email: 'bd@web3pay.io', project: 'Web3Pay', stage: 'negotiating', seq: 2, lastSent: daysAgo(2), opened: true, note: 'Budget $800' },
  { email: 'hello@defibank.io', project: 'DeFiBank', stage: 'contacted', seq: 3, lastSent: daysAgo(21), opened: false, note: '' },
  { email: 'team@chainbridge.com', project: 'ChainBridge', stage: 'cold', seq: 3, lastSent: daysAgo(25), opened: false, note: 'No reply x3' },
  { email: 'listing@metatoken.io', project: 'MetaToken', stage: 'closed', seq: 1, lastSent: daysAgo(5), opened: true, note: 'Closed $600' },
  { email: 'pr@yieldmax.finance', project: 'YieldMax', stage: 'contacted', seq: 1, lastSent: daysAgo(11), opened: true, note: '' },
  { email: 'media@dexprotocol.io', project: 'DexProtocol', stage: 'new', seq: 0, lastSent: null, opened: false, note: '' },
]

function uid() { return Math.random().toString(36).slice(2, 9) }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('vi-VN') }
function daysSince(s: string | null): number {
  if (!s) return 999
  const p = s.split('/'); if (p.length < 3) return 999
  return Math.floor((Date.now() - new Date(+p[2], +p[1] - 1, +p[0]).getTime()) / 86400000)
}
function needsRemind(c: Contact) {
  return !['closed', 'cold'].includes(c.stage) && c.lastSent && c.seq < 3 && daysSince(c.lastSent) >= 10
}

function StatBox({ label, value, color, sub, onClick }: { label: string; value: number | string; color?: string; sub?: string; onClick?: () => void }) {
  return (
    <div style={{ ...S.stat(), cursor: onClick ? 'pointer' : 'default', transition: 'all .15s' }}
      onClick={onClick}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.borderColor = color || C.blue }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLElement).style.borderColor = C.bd }}>
      <div style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 600, color: color || C.t1, lineHeight: 1, marginBottom: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.t3 }}>{sub}</div>}
      {onClick && <div style={{ fontSize: 9, color: color || C.blue, marginTop: 3, opacity: 0.7 }}>→ click để xem</div>}
    </div>
  )
}

function ProgBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div style={S.prog}>
      <div style={{ height: '100%', width: `${pct}%`, background: color || C.blue, borderRadius: 3, transition: 'width .3s' }} />
    </div>
  )
}

function LogPane({ logs, pct, color }: { logs: Log[]; pct: number; color?: string }) {
  return (
    <div style={S.card()}>
      <ProgBar pct={pct} color={color} />
      <div style={S.logBox}>{logs.map((l, i) => <div key={i} style={{ color: lc(l.t) }}>{l.msg}</div>)}</div>
    </div>
  )
}

export default function Page() {
  const [tab, setTab] = useState<string>('dash')
  const [emails, setEmails] = useState<Email[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [openEvents, setOpenEvents] = useState<{ contact: string; email: string; time: string }[]>([])
  const [tgMsgs, setTgMsgs] = useState<{ text: string; time: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [fSt, setFSt] = useState('all')
  const [fSrc, setFSrc] = useState('all')
  const [cSearch, setCSearch] = useState('')
  const [cStage, setCStage] = useState('all')
  const [cOp, setCOp] = useState('all')
  const [findLog, setFindLog] = useState<Log[]>([])
  const [hunterLog, setHunterLog] = useState<Log[]>([])
  const [crawlLog, setCrawlLog] = useState<Log[]>([])
  const [stagedEmails, setStagedEmails] = useState<StagedEmail[]>([])
  const [currentUser, setCurrentUser] = useState<CurrentUser>(null)
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [userForm, setUserForm] = useState({ id: '', username: '', password: '', role: 'user' })
  const [showUserForm, setShowUserForm] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [templates, setTemplates] = useState<Template[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [sendLog, setSendLog] = useState<Log[]>([])
  const [remindLog, setRemindLog] = useState<Log[]>([])
  const [fp, setFp] = useState(0)
  const [hp, setHp] = useState(0)
  const [cp, setCp] = useState(0)
  const [sp, setSp] = useState(0)
  const [rp, setRp] = useState(0)
  const [dashPo, setDashPo] = useState(0)
  const [dashLog, setDashLog] = useState<Log[]>([])
  const [showDashLog, setShowDashLog] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [findMode, setFindMode] = useState('contact')
  const [debugMsg, setDebugMsg] = useState('')
  const [manual, setManual] = useState('')
  const [hunterDoms, setHunterDoms] = useState('')
  const [hunterMode, setHunterMode] = useState('bod')
  const [newSiteUrl, setNewSiteUrl] = useState('')
  const [newSiteName, setNewSiteName] = useState('')
  const [crawlingSite, setCrawlingSite] = useState<string | null>(null)
  const [fromName, setFromName] = useState('LEON (Mr.)')
  const [fromEmail, setFromEmail] = useState('leon@coincu.com')
  const [subject, setSubject] = useState('Boost {{project}} Visibility — Coincu PR & CMC Top News')
  const [body, setBody] = useState(`Hi {{project}},\n\nI came across your recent press release and wanted to reach out about amplifying {{project}} visibility further.\n\nAt Coincu, we offer:\n• Press Release Distribution\n• CoinMarketCap Top News Listing\n• Sponsored Articles\n• Organic Coverage\n\nWe have helped 200+ blockchain projects boost their reach.\n\nFeel free to message me on Telegram: https://t.me/iamleonnn\n\nBest,\nLEON (Mr.)\nChief Business Development Officer — Coincu\nE: leon@coincu.com`)
  const [preview, setPreview] = useState('')
  const [sendDone, setSendDone] = useState<{ ok: number; fail: number; skip: number } | null>(null)
  const [tgToken, setTgToken] = useState('')
  const [tgChat, setTgChat] = useState('')
  const [tgOk, setTgOk] = useState<boolean | null>(null)
  const [dups, setDups] = useState(0)
  const [skipped, setSkipped] = useState(0)
  // Test email states
  const [testTo, setTestTo] = useState('')
  const [testSubject, setTestSubject] = useState('Boost [ProjectName] Visibility — Coincu PR & CMC Top News')
  const [testBody, setTestBody] = useState(`Hi [ProjectName],\n\nI came across your recent press release and wanted to reach out about amplifying your project visibility further.\n\nAt Coincu, we offer:\n• Press Release Distribution\n• CoinMarketCap Top News Listing\n• Sponsored Articles\n• Organic Coverage\n\nWe have helped 200+ blockchain projects boost their reach.\n\nFeel free to message me on Telegram: https://t.me/iamleonnn\n\nBest,\nLEON (Mr.)\nChief Business Development Officer — Coincu\nE: leon@coincu.com`)
  const [testStatus, setTestStatus] = useState<'idle'|'sending'|'ok'|'err'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [smtpOk, setSmtpOk] = useState<boolean|null>(null)

  const loadEmails = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (fSt !== 'all') p.set('status', fSt)
      let userId = currentUser?.id
      if (!userId) {
        try { const s = localStorage.getItem('coincu_user'); if (s) userId = JSON.parse(s).id } catch {}
      }
      if (userId) p.set('owner', userId)
      const r = await fetch(`/api/emails?${p}`, { cache: 'no-store' })
      const d = await r.json()
      if (d.emails) setEmails(d.emails)
    } catch {}
  }, [fSt, currentUser?.id])

  const loadSites = useCallback(async () => {
    try {
      setDebugMsg('Fetching /api/competitors...')
      const r = await fetch('/api/competitors', { cache: 'no-store' })
      if (!r.ok) {
        setDebugMsg('HTTP Error: ' + r.status)
        return
      }
      const text = await r.text()
      try {
        const d = JSON.parse(text)
        if (d.sites && d.sites.length > 0) {
          setSites(d.sites)
          setDebugMsg('Loaded ' + d.sites.length + ' sites.')
        } else if (d.sites && d.sites.length === 0) {
          setDebugMsg('0 sites found, seeding...')
          for (const preset of SITES_PRESET) {
            try {
              await fetch('/api/competitors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteUrl: 'https://' + preset.d })
              })
            } catch {}
          }
          const r2 = await fetch('/api/competitors', { cache: 'no-store' })
          const d2 = await r2.json()
          if (d2.sites) {
            setSites(d2.sites)
            setDebugMsg('Seeded & loaded ' + d2.sites.length + ' sites.')
          }
        } else {
          setDebugMsg('d.sites missing. Data: ' + text.substring(0,50))
        }
      } catch(e: any) {
        setDebugMsg('JSON Parse Error: ' + e.message + ' Data: ' + text.substring(0, 50))
      }
    } catch(e: any) {
      setDebugMsg('Network/Fetch Error: ' + e.message)
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('coincu_user')
    if (saved) {
      try {
        const u = JSON.parse(saved)
        // Prevent setting a new object reference if the ID is the same to avoid infinite loops
        if (currentUser?.id !== u.id) setCurrentUser(u)
      } catch {}
    }
  }, []) // run once on mount

  useEffect(() => {
    loadEmails()
    loadTemplates()
  }, [loadEmails]) // loadEmails is wrapped in useCallback and only changes when currentUser changes. loadTemplates doesn't need to be in deps.

  useEffect(() => { if (tab === 'sites') loadSites() }, [tab, loadSites])
  useEffect(() => { if (tab === 'users' && currentUser?.role === 'admin') loadUsers() }, [tab, currentUser?.id])

  const addLog = (set: any, msg: string, t: Log['t'] = 'info') => set((p: Log[]) => [...p, { msg, t }])
  const addTgMsg = (text: string) => setTgMsgs(p => [{ text, time: new Date().toLocaleTimeString('vi-VN') }, ...p.slice(0, 9)])

  const unsentCount = emails.filter(e => e.status === 'new').length
  const sentCount = emails.filter(e => e.status === 'sent').length
  const bodCount = emails.filter(e => e.source_type === 'hunter_bod').length
  const remindCount = contacts.filter(needsRemind).length

  async function doFind() {
    const urls = urlInput.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return alert('Nhập ít nhất 1 URL')
    setFindLog([]); setFp(0); setBusy(true)
    addLog(setFindLog, `▶ Quét ${urls.length} URL...`, 'info')
    try {
      const r = await fetch('/api/find-emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls, mode: findMode, owner_id: currentUser?.id }) })
      const d = await r.json()
      for (let i = 0; i < (d.results || []).length; i++) {
        const x = d.results[i]; setFp(Math.round((i + 1) / d.results.length * 100))
        if (x.error) addLog(setFindLog, `✗ ${x.domain}: ${x.error}`, 'err')
        else { addLog(setFindLog, `✓ ${x.domain} — ${x.added} mới · ${x.found - x.added} trùng`, x.added > 0 ? 'ok' : 'dim') }
      }
    } catch (e: any) { addLog(setFindLog, `✗ ${e.message}`, 'err') }
    addLog(setFindLog, '─── xong ───', 'dim'); setBusy(false); loadEmails()
  }

  async function doManual() {
    if (!manual.trim()) return
    const [addr, src] = manual.split(',').map(s => s.trim())
    try {
      const r = await fetch('/api/emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: addr, source_url: src || null, owner_id: currentUser?.id }) })
      const d = await r.json()
      if (d.error) return alert(d.error)
      setManual(''); loadEmails()
    } catch {}
  }

  async function doHunter() {
    const domains = hunterDoms.split('\n').map(d => d.trim()).filter(Boolean)
    if (!domains.length) return alert('Nhập ít nhất 1 domain')
    setHunterLog([]); setHp(0); setBusy(true)
    addLog(setHunterLog, `▶ Hunter.io — ${hunterMode === 'bod' ? 'BOD' : 'All'} từ ${domains.length} domain...`, 'info')
    try {
      const r = await fetch('/api/hunter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domains, mode: hunterMode, owner_id: currentUser?.id }) })
      const d = await r.json()
      for (let i = 0; i < (d.results || []).length; i++) {
        const x = d.results[i]; setHp(Math.round((i + 1) / d.results.length * 100))
        if (x.error) { addLog(setHunterLog, `✗ ${x.domain}: ${x.error}`, 'err'); continue }
        addLog(setHunterLog, `✓ ${x.domain} — ${x.added} mới · ${x.skipped} trùng`, x.added > 0 ? 'ok' : 'dim')
        x.emails?.forEach((e: any) => addLog(setHunterLog, `  → ${e.addr} | ${e.name || '?'} | ${e.position || '?'}${e.isBOD ? ' 👑' : ''} (${e.confidence}%)`, 'ok'))
      }
    } catch (e: any) { addLog(setHunterLog, `✗ ${e.message}`, 'err') }
    addLog(setHunterLog, '─── xong ───', 'dim'); setBusy(false); loadEmails()
  }

  async function crawlSite(site: Site) {
    setCrawlingSite(site.id); setCrawlLog([]); setCp(0); setStagedEmails([])
    addLog(setCrawlLog, `▶ Quét ${site.domain}...`, 'info')
    try {
      const initD = await fetch('/api/competitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: site.url }) }).then(r => r.json())
      if (initD.error) { addLog(setCrawlLog, `✗ ${initD.error}`, 'err'); setCrawlingSite(null); return }
      const siteId = initD.siteId
      addLog(setCrawlLog, `  Đang lấy bài từ RSS...`, 'dim')
      const urlsD = await fetch(`/api/competitors?action=urls&siteUrl=${encodeURIComponent(site.url)}`).then(r => r.json())
      const urls: string[] = urlsD.urls || []
      const preloaded = urlsD.preloadedEmails || {}
      if (!urls.length) { addLog(setCrawlLog, `  — Không có bài mới`, 'warn'); setCrawlingSite(null); loadSites(); return }
      addLog(setCrawlLog, `  → ${urls.length} bài cần quét`, 'info')

      const allFound: StagedEmail[] = []
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i]
        setCp(Math.round((i + 1) / urls.length * 100))
        const isHunter = url.startsWith('hunter://')
        const slug = isHunter ? `🎯 Hunter: ${url.replace('hunter://', '')}` : url.replace(/https?:\/\/[^/]+/, '').slice(0, 60)
        addLog(setCrawlLog, `\n  ${isHunter ? '🏢' : '📄'} ${slug}`, 'info')
        try {
          const artD = await fetch('/api/competitors', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ articleUrl: url, siteUrl: site.url, siteId, preloadedEmails: preloaded, dryRun: true })
          }).then(r => r.json())
          if (artD.skipped) { addLog(setCrawlLog, `     ⊘ Non-crypto`, 'dim'); continue }
          artD.logs?.forEach((l: string) => addLog(setCrawlLog, `     ${l}`, l.includes('→') ? 'ok' : 'dim'))
          if (artD.found?.length > 0) {
            const newEmails: StagedEmail[] = artD.found.map((e: any) => ({
              addr: e.addr, src: e.src, name: e.name || '', domain: e.domain || '',
              pos: e.pos || '', articleUrl: url, articleTitle: artD.advertiserName || slug, checked: true
            }))
            allFound.push(...newEmails)
            setStagedEmails(prev => {
              const existing = new Set(prev.map(x => x.addr))
              return [...prev, ...newEmails.filter(x => !existing.has(x.addr))]
            })
          }
        } catch (e: any) { addLog(setCrawlLog, `     ✗ ${e.message}`, 'err') }
      }
      addLog(setCrawlLog, `\n─── Xong: ${allFound.length} email tìm thấy ───`, allFound.length > 0 ? 'ok' : 'dim')
    } catch (e: any) { addLog(setCrawlLog, `✗ ${e.message}`, 'err') }
    setCrawlingSite(null); loadSites()
  }

    // ─── Auth functions ───
  async function doLogin() {
    setLoginLoading(true); setLoginError('')
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginForm) })
    const d = await r.json()
    if (d.ok) {
      setCurrentUser(d.user)
      localStorage.setItem('coincu_user', JSON.stringify(d.user))
    } else { setLoginError(d.error || 'Đăng nhập thất bại') }
    setLoginLoading(false)
  }

  function doLogout() {
    setCurrentUser(null); localStorage.removeItem('coincu_user')
  }

  async function loadTemplates() {
    const r = await fetch('/api/templates')
    const d = await r.json()
    setTemplates(d.templates || [])
  }

  function exportCSV() {
    const url = `/api/export${currentUser?.id ? `?owner=${currentUser.id}` : ''}`
    window.open(url, '_blank')
  }

  async function loadUsers() {
    const r = await fetch('/api/auth')
    const d = await r.json()
    setUsers(d.users || [])
  }

  async function saveUser() {
    const r = await fetch('/api/auth', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userForm) })
    const d = await r.json()
    if (d.ok) { setShowUserForm(false); setUserForm({ id: '', username: '', password: '', role: 'user' }); loadUsers() }
    else alert(d.error)
  }

  async function deleteUser(id: string) {
    if (!confirm('Xóa user này?')) return
    await fetch('/api/auth', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    loadUsers()
  }

  async function sendRemind(emailId: string, remindNum: 1|2|3) {
    const btn = document.getElementById(`remind-btn-${emailId}-${remindNum}`)
    if (btn) btn.textContent = '...'
    try {
      const r = await fetch('/api/remind', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId, remindNum })
      })
      const d = await r.json()
      if (d.ok) {
        loadEmails()
      } else {
        alert('Lỗi gửi remind: ' + d.error)
        if (btn) btn.textContent = `R${remindNum}`
      }
    } catch(e: any) {
      alert('Lỗi: ' + e.message)
      if (btn) btn.textContent = `R${remindNum}`
    }
  }

    async function collectStaged() {
    const selected = stagedEmails.filter(e => e.checked)
    if (!selected.length) return alert('Chưa chọn email nào!')
    let saved = 0
    for (const e of selected) {
      const r = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: e.addr, domain: e.domain, source_url: e.articleUrl, source_type: e.src, contact_name: e.name||null, position: e.pos||null, owner_id: currentUser?.id })
      })
      if ((await r.json()).ok) saved++
    }
    setStagedEmails([]); loadEmails()
    alert(`✅ Đã collect ${saved}/${selected.length} email!`)
  }

  async function runAutoRemind() {
    const needs = contacts.filter(needsRemind)
    if (!needs.length) { alert('Không có contact nào cần remind'); return }
    setRemindLog([]); setRp(0); setBusy(true)
    addLog(setRemindLog, `▶ Auto-remind ${needs.length} contacts...`, 'info')
    for (let i = 0; i < needs.length; i++) {
      const c = needs[i]; setRp(Math.round((i + 1) / needs.length * 100))
      await new Promise(r => setTimeout(r, 200))
      setContacts(prev => prev.map(x => x.id === c.id ? {
        ...x, seq: x.seq + 1,
        lastSent: new Date().toLocaleDateString('vi-VN'),
        stage: x.seq + 1 >= 3 ? 'cold' : x.stage === 'new' ? 'contacted' : x.stage
      } : x))
      addLog(setRemindLog, `  ✓ ${c.project} — Follow-up #${c.seq + 1}`, 'ok')
    }
    addLog(setRemindLog, `─── ${needs.length} follow-ups sent ───`, 'dim')
    addTgMsg(`⏰ Auto-remind: ${needs.length} follow-ups gửi xong`)
    setBusy(false)
  }

  async function doSend() {
    // Preview subject/body với project name
    const previewSubject = subject.replace(/\{\{project\}\}/g, 'ProjectName').replace(/\{\{email\}\}/g, 'contact@project.com')
    const previewBody = body.replace(/\{\{project\}\}/g, 'ProjectName').replace(/\{\{name\}\}/g, 'ProjectName').replace(/\{\{email\}\}/g, 'contact@project.com').replace(/\{\{domain\}\}/g, 'project.com')
    if (!fromName || !fromEmail || !subject || !body) return alert('Điền đầy đủ')
    if (!confirm(`Gửi đến ${unsentCount} email?`)) return
    setSendLog([]); setSp(0); setSendDone(null); setBusy(true)
    try {
      const r = await fetch('/api/send-emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromName, fromEmail, subject, body, owner_id: currentUser?.id }) })
      const d = await r.json()
      const skip = emails.filter(e => e.status === 'sent').length
      ;(d.results || []).forEach((x: any, i: number) => {
        setSp(Math.round((i + 1) / d.results.length * 100))
        addLog(setSendLog, x.status === 'success' ? `✓ ${x.address}` : `✗ ${x.address}: ${x.error}`, x.status === 'success' ? 'ok' : 'err')
      })
      setSendDone({ ok: d.sent, fail: d.failed, skip })
      addTgMsg(`✅ Gửi xong: ${d.sent} thành công · ${d.failed} lỗi`)
    } catch (e: any) { addLog(setSendLog, `✗ ${e.message}`, 'err') }
    setBusy(false); loadEmails()
  }

  async function testTelegram() {
    if (!tgToken || !tgChat) return alert('Nhập Bot Token và Chat ID')
    try {
      const r = await fetch('/api/telegram')
      const d = await r.json()
      setTgOk(d.ok)
      if (d.ok) addTgMsg(`✅ Kết nối thành công! Bot: @${d.bot}`)
    } catch { setTgOk(false) }
  }

  async function addSiteAndCrawl() {
    if (!newSiteUrl.trim()) return
    const domain = newSiteUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '')
    if (sites.find(s => s.domain === domain)) return alert('Site đã tồn tại')
    try {
      await fetch('/api/competitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: newSiteUrl.trim(), maxPages: 1 }) })
      setNewSiteUrl(''); setNewSiteName(''); loadSites()
    } catch {}
  }

  async function sendTestEmail() {
    if (!testTo || !testSubject || !testBody) { alert('Điền đầy đủ email nhận, subject và nội dung!'); return }
    setTestStatus('sending'); setTestMsg('')
    try {
      const r = await fetch('/api/send-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testTo, subject: '[TEST] ' + testSubject, bodyText: testBody, fromName: fromName || 'LEON (Mr.)', fromEmail: fromEmail || 'leon@coincu.com' })
      })
      const d = await r.json()
      if (d.ok) { setTestStatus('ok'); setTestMsg(`✅ Đã gửi thành công đến ${testTo}! (${d.provider}) Kiểm tra hộp thư.`) }
      else { setTestStatus('err'); setTestMsg(`✗ Lỗi: ${d.error || 'Không rõ'}`) }
    } catch (e: any) { setTestStatus('err'); setTestMsg(`✗ ${e.message}`) }
  }

  async function checkSmtp() {
    try {
      const r = await fetch('/api/send-emails')
      const d = await r.json()
      setSmtpOk(d.provider !== 'none')
      if (d.provider === 'none') alert('Chưa cấu hình! Cần thêm RESEND_API_KEY hoặc SMTP_HOST+SMTP_USER+SMTP_PASS vào Vercel.')
      else alert(`✅ ${d.provider === 'resend' ? 'Resend API' : 'SMTP'} đã sẵn sàng!`)
    } catch { setSmtpOk(false) }
  }

  async function simulateOpen() {
    const e = emails.find(x => x.status === 'sent') || emails[0]
    if (!e) return
    const ev = { contact: e.contact_name || e.address, email: e.address, time: new Date().toLocaleTimeString('vi-VN') }
    setOpenEvents(p => [ev, ...p])
    addTgMsg(`👁 ${ev.contact} vừa mở email!\n📧 ${ev.email}`)
  }

  const filteredEmails = emails.filter(e => {
    const ms = fSt === 'all' || e.status === fSt
    const mr = fSrc === 'all' || e.source_type === fSrc
    return ms && mr
  })
  const filteredContacts = contacts.filter(c => {
    const mq = !cSearch || c.email.includes(cSearch) || c.project.toLowerCase().includes(cSearch.toLowerCase())
    const ms = cStage === 'all' || c.stage === cStage
    const mo = cOp === 'all' || (cOp === 'opened' && c.opened) || (cOp === 'not_opened' && !c.opened)
    return mq && ms && mo
  })

  const srcLabel = (t?: string) => ({ hunter_bod: 'BOD 👑', hunter: 'Hunter', article: 'Bài viết', crunchbase: 'Crunchbase', manual: 'Thủ công' })[t || ''] || 'Thủ công'
  const srcBdg = (t?: string): React.CSSProperties => {
    const m: any = { hunter_bod: [C.amberDim, C.amber], hunter: [C.purpleDim, C.purple], article: [C.blueDim, C.blue], crunchbase: [C.redDim, C.red], manual: [C.b3, C.t2] }
    const [bg, col] = m[t || 'manual'] || m.manual; return S.bdg(bg, col)
  }
  const stBdg = (s: string): React.CSSProperties => {
    if (s === 'sent') return S.bdg(C.greenDim, C.green)
    if (s === 'failed') return S.bdg(C.redDim, C.red)
    return S.bdg(C.amberDim, C.amber)
  }

  const TABS: [string, string][] = [
    ['dash', '🏠 Dashboard'], ['sites', '🕷 Bài viết'], ['hunter', '🎯 Hunter BOD'],
    ['send', '✉️ Gửi & Remind'], ['tracking', '👁 Tracking'], ['settings', '⚙️ Settings'],
  ]

  const hdrKpis = [
    ['Emails', emails.length, C.t1], ['Chưa gửi', unsentCount, C.amber],
    ['Đã gửi', sentCount, C.green], ['Opened', openEvents.length, C.cyan],
    ['Remind', remindCount, C.red],
  ] as [string, number, string][]

  // ─── LOGIN SCREEN ───
  if (!currentUser) return (
    <div style={{ background: C.b0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t1 }}>
      <div style={{ width: 360, padding: '40px 32px', background: C.b1, border: `1px solid ${C.bd}`, borderRadius: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <img src="https://pbs.twimg.com/profile_images/1902957820418592768/xnPqDY4i_400x400.jpg" alt="Coincu" style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>Coincu Sales</div>
            <div style={{ fontSize: 11, color: C.t3 }}>Sales Intelligence Dashboard</div>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.t2, marginBottom: 5, fontWeight: 600 }}>USERNAME</div>
          <input value={loginForm.username} onChange={e => setLoginForm(p=>({...p, username: e.target.value}))}
            onKeyDown={e => e.key === 'Enter' && doLogin()}
            placeholder="username" autoFocus
            style={{ width: '100%', background: C.b0, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '9px 12px', color: C.t1, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: C.t2, marginBottom: 5, fontWeight: 600 }}>PASSWORD</div>
          <input type="password" value={loginForm.password} onChange={e => setLoginForm(p=>({...p, password: e.target.value}))}
            onKeyDown={e => e.key === 'Enter' && doLogin()}
            placeholder="••••••••"
            style={{ width: '100%', background: C.b0, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '9px 12px', color: C.t1, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        {loginError && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>⚠ {loginError}</div>}
        <button onClick={doLogin} disabled={loginLoading}
          style={{ width: '100%', background: C.blue, color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: loginLoading ? 0.7 : 1 }}>
          {loginLoading ? 'Đang đăng nhập...' : '→ Đăng nhập'}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ background: C.b0, minHeight: '100vh', color: C.t1, fontSize: 13 }}>

      {/* ── HEADER ── */}
      <div style={{ background: C.b1, borderBottom: `1px solid ${C.bd}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', height: 52 }}>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            onClick={() => setShowUserMenu(p => !p)}>
            <div style={{ position: 'relative' }}>
              <img src="https://pbs.twimg.com/profile_images/1902957820418592768/xnPqDY4i_400x400.jpg" alt="Coincu" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
              {currentUser?.role === 'admin' && <span style={{ position: 'absolute', top: -3, right: -3, width: 9, height: 9, background: C.amber, borderRadius: '50%', border: `2px solid ${C.b1}` }} />}
            </div>
            <div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14 }}>Coincu</div>
              <div style={{ fontSize: 10, color: C.t3, letterSpacing: '.05em', textTransform: 'uppercase' }}>Sales Intelligence</div>
            </div>
          </div>
          {showUserMenu && (
            <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 999, background: C.b1, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 6, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
              <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.bd}`, marginBottom: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>👤 {currentUser?.username}</div>
                <div style={{ fontSize: 11, color: C.t3 }}>
                  {currentUser?.role === 'admin' ? <span style={{ color: C.amber }}>● Admin</span> : <span style={{ color: C.t3 }}>● User</span>}
                </div>
              </div>
              {currentUser?.role === 'admin' && (
                <button onClick={() => { setTab('users'); setShowUserMenu(false) }}
                  style={{ width: '100%', textAlign: 'left', padding: '7px 12px', background: 'none', border: 'none', color: C.t1, fontSize: 12, cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.b3)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  👥 Quản lý Users
                </button>
              )}
              <button onClick={() => { doLogout(); setShowUserMenu(false) }}
                style={{ width: '100%', textAlign: 'left', padding: '7px 12px', background: 'none', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                → Đăng xuất
              </button>
            </div>
          )}
        </div>
        <div style={{ width: 1, height: 28, background: C.bd, margin: '0 4px' }} />
        <div style={{ fontSize: 11, color: C.t3 }}>
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: C.green, marginRight: 5, verticalAlign: 'middle' }} />
          {sites.length || 34} sites · crypto only · tracking live
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 18 }}>
          {hdrKpis.map(([l, v, c]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 600, color: c, lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 10, color: C.t3, marginTop: 2, textTransform: 'uppercase', letterSpacing: '.06em' }}>{l}</div>
            </div>
          ))}
        </div>

      </div>

      {/* ── NAV ── */}
      <div style={{ background: C.b1, borderBottom: `1px solid ${C.bd}`, display: 'flex', padding: '0 4px', overflowX: 'auto' }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '10px 13px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12,
            fontWeight: tab === k ? 500 : 400, color: tab === k ? C.t1 : C.t2,
            borderBottom: `2px solid ${tab === k ? C.blue : 'transparent'}`, marginBottom: -1,
            whiteSpace: 'nowrap', transition: 'all .18s', fontFamily: "'DM Sans',sans-serif",
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {l}
            {k === 'send' && remindCount > 0 && <span style={{ fontSize: 10, background: C.redDim, color: C.red, padding: '1px 6px', borderRadius: 20, border: `1px solid ${C.red}33` }}>{remindCount}</span>}
            {false && k === 'contacts' && contacts.length > 0 && <span style={{ fontSize: 10, background: C.blueDim, color: C.cyan, padding: '1px 6px', borderRadius: 20, border: `1px solid ${C.cyan}33` }}>{contacts.length}</span>}
            {k === 'tracking' && openEvents.length > 0 && <span style={{ fontSize: 10, background: C.greenDim, color: C.green, padding: '1px 6px', borderRadius: 20, border: `1px solid ${C.green}33` }}>{openEvents.length}</span>}
          </button>
        ))}
      </div>

      {/* ── BODY ── */}
      <div style={{ padding: 14, maxWidth: 1200, margin: '0 auto' }}>

        {/* DASHBOARD */}
        {tab === 'dash' && <>
          <div style={{ ...S.card(`linear-gradient(135deg,${C.b1} 0%,#180e00 100%)`), border: `1px solid rgba(245,158,11,.25)`, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ color: C.amber, fontSize: 14 }}>⚠</span>
              <span style={{ fontWeight: 600, color: C.amber, fontSize: 13, fontFamily: "'Space Grotesk',sans-serif" }}>Bộ lọc Crypto Only</span>
              <span style={S.bdg(`rgba(245,158,11,.12)`, C.amber)}>Active</span>
            </div>
            <p style={{ fontSize: 11, color: '#9a7020', lineHeight: 1.6 }}>Chỉ lấy email từ dự án: blockchain, crypto, DeFi, NFT, Web3, token, coin, exchange, wallet. Dự án không liên quan bị bỏ qua tự động.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
            <StatBox label="Tổng email" value={emails.length} sub="trong database" onClick={() => setTab('send')} />
            <StatBox label="Chưa gửi" value={unsentCount} color={C.amber} sub="sẵn sàng outreach" onClick={unsentCount > 0 ? () => setTab('send') : undefined} />
            <StatBox label="Đã gửi" value={sentCount} color={C.green} sub="tổng cộng" onClick={sentCount > 0 ? () => setTab('send') : undefined} />
            <StatBox label="BOD Hunter" value={bodCount} color={C.purple} sub="CEO/CFO/CMO" onClick={bodCount > 0 ? () => setTab('hunter') : undefined} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
            <StatBox label="Opened" value={openEvents.length} color={C.cyan} sub="đã mở email" onClick={openEvents.length > 0 ? () => setTab('tracking') : undefined} />
            <StatBox label="Cần Remind" value={emails.filter(e => e.status==='sent' && !e.remind1_sent_at && e.sent_at && (Date.now() - new Date(e.sent_at).getTime()) >= 3*24*60*60*1000).length} color={C.red} sub="sau 3 ngày" onClick={() => setTab('send')} />
            <StatBox label="R1 Đã gửi" value={emails.filter(e=>e.remind1_sent_at).length} color={C.amber} sub="follow-up 1" onClick={() => setTab('send')} />
            <StatBox label="Sites" value={sites.length || 19} sub="đang theo dõi" onClick={() => setTab('sites')} />
          </div>

          <div style={{ fontSize: 10, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            Quick Actions <div style={{ flex: 1, height: 1, background: C.bd }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button style={{ ...S.btn('xl'), ...{ background: C.blue, color: '#fff', border: 'none' } }} onClick={() => setTab('sites')}>🕷 Quét {sites.length || 34} sites</button>
            <button style={S.btn('xl')} onClick={() => setTab('hunter')}>🎯 Hunter BOD</button>
            <button style={S.btn('xl')} onClick={() => { setTab('send'); runAutoRemind() }}>🔔 Auto-remind</button>
            <button style={{ ...S.btn('xl'), ...{ background: C.cyanDim, border: `1px solid rgba(0,212,255,.3)`, color: C.cyan } }} onClick={() => {
              setContacts(DEMO_CONTACTS.map(d => ({ ...d, id: uid() })))
              setEmails(DEMO_CONTACTS.map(c => ({ id: uid(), address: c.email, domain: c.email.split('@')[1], status: c.stage === 'closed' ? 'sent' as const : 'new' as const, contact_name: c.project, source_type: ['article', 'hunter_bod', 'hunter'][Math.floor(Math.random() * 3)] })))
            }}>✨ Load demo data</button>
          </div>

          {showDashLog && dashLog.length > 0 && <LogPane logs={dashLog} pct={dashPo} />}

          <div style={{ fontSize: 10, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            Activity feed <div style={{ flex: 1, height: 1, background: C.bd }} />
          </div>
          <div style={S.card()}>
            {[
              ['👁', 'rgba(0,212,255,.15)', 'AlphaDeFi opened email', '2 phút trước'],
              ['📧', 'rgba(37,99,235,.15)', 'Gửi 8 email mới thành công', '15 phút trước'],
              ['🎯', 'rgba(139,92,246,.15)', 'Hunter: +3 BOD từ cryptotimes.io', '1 giờ trước'],
              ['⏰', 'rgba(245,158,11,.15)', 'Auto-remind: 2 follow-ups đã gửi', '8h sáng nay'],
              ['🕷', 'rgba(16,185,129,.15)', 'Quét xong livebitcoinnews.com: +4 email', 'Hôm qua'],
            ].map(([icon, bg, title, time]) => (
              <div key={title as string} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid rgba(255,255,255,.04)` }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: bg as string, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: 10, color: C.t3, fontFamily: "'JetBrains Mono',monospace" }}>{time}</div>
                </div>
              </div>
            ))}
          </div>
        </>}

        {/* SITES */}
        {tab === 'sites' && <>
          <div style={S.card()}>
            <label style={{ fontSize: 11, color: C.t2, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Quản lý Site Đối thủ (Cập nhật)</label>
            <div style={S.row}>
              <input value={newSiteUrl} onChange={e => setNewSiteUrl(e.target.value)} placeholder="https://newcryptosite.com/press-release/" style={{ ...S.inp, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addSiteAndCrawl()} />
              <input value={newSiteName} onChange={e => setNewSiteName(e.target.value)} placeholder="Tên site" style={{ ...S.inp, width: 130 }} />
              <button style={{ ...S.btn('p') }} onClick={addSiteAndCrawl}>+ Thêm</button>
            </div>
            {debugMsg && <div style={{ marginTop: 8, padding: 8, background: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: 11, fontFamily: 'monospace' }}>{debugMsg}</div>}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button style={{ ...S.btn('p'), flex: 1 }} disabled={busy} onClick={async () => {
              if (!confirm('Quét tất cả '+sites.length+' sites? Có thể mất vài phút.')) return
              setBusy(true)
              for (const site of sites) { await crawlSite(site) }
              setBusy(false)
            }}>🕷 Quét tất cả {sites.length} sites</button>
            <button style={{ ...S.btn('sm') }} onClick={async () => {
              if (!confirm('Reset lịch sử để quét lại tất cả bài từ đầu?')) return
              const r = await fetch('/api/competitors', { method: 'DELETE' })
              if (r.ok) { loadSites(); alert('Đã reset!') }
            }}>🔄 Reset lịch sử</button>
          </div>
          {sites.map((site) => {
            const preset = SITES_PRESET.find(p => p.d === site.domain)
            const running = crawlingSite === site.id
            return (
              <div key={site.id} style={{ ...S.card(), display: 'flex', alignItems: 'center', gap: 10, borderColor: running ? `rgba(37,99,235,.4)` : C.bd, background: running ? `linear-gradient(135deg,${C.b1} 0%,#0f1825 100%)` : C.b1 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: C.b3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{preset?.i || '🌐'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 2 }}>{preset?.n || site.domain}</div>
                  <div style={{ fontSize: 10, color: C.t3, fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.domain}</div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                    {[['Quét', `${site.total_pages_crawled} trang`], ['Email', `${site.total_emails_found}`], ['Cuối', site.last_crawled_at ? new Date(site.last_crawled_at).toLocaleDateString('vi') : '—']].map(([l, v]) => (
                      <span key={l} style={{ fontSize: 10 }}><span style={{ color: C.t3 }}>{l} </span><span style={{ fontWeight: 500 }}>{v}</span></span>
                    ))}
                  </div>
                </div>
                <button style={S.btn('p')} onClick={() => crawlSite(site)} disabled={running || busy}>{running ? '⏳ Quét...' : '🔄 Quét mới'}</button>
              </div>
            )
          })}
          {crawlLog.length > 0 && <LogPane logs={crawlLog} pct={cp} />}

          {/* Staging area — email tìm được, chọn trước khi collect */}
          {stagedEmails.length > 0 && (
            <div style={{ ...S.card(), marginTop: 12, border: `1px solid rgba(16,185,129,.35)`, background: 'rgba(16,185,129,.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>📬 Emails tìm được</span>
                  <span style={{ fontSize: 11, color: C.t3, marginLeft: 8 }}>{stagedEmails.filter(e=>e.checked).length}/{stagedEmails.length} đã chọn</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ ...S.btn('sm'), background: C.b3, color: C.t2 }} onClick={() => setStagedEmails(p => p.map(e => ({ ...e, checked: !p.every(x=>x.checked) })))}>
                    {stagedEmails.every(e=>e.checked) ? 'Bỏ chọn hết' : 'Chọn hết'}
                  </button>
                  <button style={{ ...S.btn('p'), background: C.green, fontSize: 12, padding: '6px 14px' }} onClick={collectStaged}>
                    ✅ Collect {stagedEmails.filter(e=>e.checked).length} email
                  </button>
                </div>
              </div>
              <div style={{ background: C.b0, border: `1px solid ${C.bd}`, borderRadius: 8, overflow: 'hidden' }}>
                {stagedEmails.slice(0, 100).map((e, i) => (
                  <div key={e.addr+i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: i < stagedEmails.length-1 ? `1px solid ${C.bd}` : 'none', background: e.checked ? 'rgba(16,185,129,.06)' : 'transparent', cursor: 'pointer' }}
                    onClick={() => setStagedEmails(p => p.map((x,j) => j===i ? {...x, checked: !x.checked} : x))}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${e.checked ? C.green : C.bd}`, background: e.checked ? C.green : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {e.checked && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 500 }}>{e.addr}</div>
                      <div style={{ fontSize: 10, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.articleTitle}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {e.name && <span style={{ fontSize: 10, color: C.t2 }}>{e.name}</span>}
                      <span style={S.bdg(e.src==='hunter_bod' ? C.amberDim : C.blueDim, e.src==='hunter_bod' ? C.amber : C.cyan)}>
                        {e.src==='hunter_bod' ? 'BOD 👑' : 'Bài PR'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>}

        {/* HUNTER */}
        {tab === 'hunter' && <>
          <div style={{ ...S.card(), background: `linear-gradient(135deg,${C.b1} 0%,#0f1825 100%)`, border: `1px solid ${C.blueDim}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 13, fontFamily: "'Space Grotesk',sans-serif" }}>Hunter.io Domain Search</span>
              <span style={S.bdg(C.purpleDim, C.purple)}>BOD: CEO · CFO · CMO · CTO · Founder</span>
              <button style={{ ...S.btn('sm'), marginLeft: 'auto', fontSize: 11 }} onClick={async () => {
                setHunterLog([{ msg: '▶ Đang kiểm tra...', t: 'info' }])
                try {
                  const r = await fetch('/api/hunter')
                  const d = await r.json()
                  if (d.ok) {
                    setHunterLog([
                      { msg: `✓ Kết nối OK!`, t: 'ok' },
                      { msg: `  Email: ${d.email}`, t: 'ok' },
                      { msg: `  Plan: ${d.plan}`, t: 'ok' },
                      { msg: `  Requests còn lại: ${d.requests_remaining ?? '?'} | Đã dùng: ${d.requests_used ?? '?'}`, t: 'ok' },
                    ])
                  } else {
                    setHunterLog([{ msg: `✗ ${d.error}`, t: 'err' }])
                  }
                } catch (e: any) {
                  setHunterLog([{ msg: `✗ Network error: ${e.message}`, t: 'err' }])
                }
              }}>🔌 Test API key</button>
            </div>
            <p style={{ fontSize: 11, color: C.t3, marginBottom: 8, lineHeight: 1.6 }}>
              Nhập domain vào ô dưới (mỗi dòng 1) → Hunter.io tìm email BOD thật kèm tên + chức danh + % tin cậy.
            </p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <button style={S.btn('sm')} onClick={() => setHunterDoms(`blockchainreporter.net\ncaptainaltcoin.com\ncoindoo.com\nanalyticsinsight.net\nlivebitcoinnews.com\nzycrypto.com\nmoneycheck.com\noptimisus.com\ncoingabbar.com\ncryptotimes.io\ntronweekly.com\ncryptobrowser.io\nglobenewswire.com\ncrypto.news\ncryptorank.io\ncoinmarketcap.com\ncrunchbase.com\ntheportugalnews.com\ntimestabloid.com`)}>
                📋 Dùng 19 sites có sẵn
              </button>
              <button style={S.btn('sm')} onClick={() => setHunterDoms('')}>🗑 Xoá</button>
            </div>
            <textarea
              value={hunterDoms}
              onChange={e => setHunterDoms(e.target.value)}
              placeholder={'blockchainreporter.net\ncaptainaltcoin.com\ncoindoo.com\n...\n\nMỗi dòng 1 domain'}
              style={{ ...S.inp, minHeight: 120, resize: 'vertical', marginBottom: 8, fontFamily: 'monospace', fontSize: 11 }}
            />
            <div style={S.row}>
              <select value={hunterMode} onChange={e => setHunterMode(e.target.value)} style={{ ...S.inp, flex: 1 }}>
                <option value="bod">Chỉ BOD — CEO, CFO, CMO, CTO, Founder, Director</option>
                <option value="all">Tất cả email (không lọc chức danh)</option>
              </select>
              <button style={{ ...S.btn('p'), padding: '8px 20px' }} onClick={doHunter} disabled={busy}>
                🎯 {busy ? 'Đang tìm...' : 'Tìm BOD ngay'}
              </button>
            </div>
            <p style={{ fontSize: 10, color: C.t3, marginTop: 6 }}>
              ⚠ Nếu báo lỗi: vào Vercel → Settings → Environment Variables → kiểm tra <code>HUNTER_API_KEY</code>
            </p>
          </div>
          {hunterLog.length > 0 && <LogPane logs={hunterLog} pct={hp} />}
        </>}

        {/* REMIND */}


        {/* PIPELINE */}
        {false && tab === 'pipeline' && <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 12 }}>
            {(['new', 'contacted', 'interested', 'negotiating', 'closed'] as const).map(s => {
              const [, col] = SC[s]
              return <StatBox key={s} label={SL[s]} value={contacts.filter(c => c.stage === s).length} color={col} />
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {(['new', 'contacted', 'interested', 'negotiating', 'closed'] as const).map(s => {
              const items = contacts.filter(c => c.stage === s)
              const [bg, col] = SC[s]
              return (
                <div key={s} style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, padding: '6px 10px', borderRadius: '8px 8px 0 0', textAlign: 'center', marginBottom: 6, background: bg, color: col, fontFamily: "'Space Grotesk',sans-serif" }}>{SL[s]} ({items.length})</div>
                  {items.length ? items.map(c => (
                    <div key={c.id} style={{ background: C.b2, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '8px 10px', marginBottom: 5, cursor: 'pointer', transition: 'border-color .15s' }}
                      onClick={() => setContacts(prev => prev.map(x => x.id === c.id ? { ...x, stage: STAGES[(STAGES.indexOf(x.stage) + 1) % STAGES.length] } : x))}>
                      <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 2 }}>{c.project}</div>
                      <div style={{ fontSize: 10, color: C.t3, fontFamily: "'JetBrains Mono',monospace" }}>{c.email.split('@')[0]}@...</div>
                      {c.opened && <span style={{ fontSize: 10, color: C.cyan }}>opened</span>}
                    </div>
                  )) : <div style={{ padding: 8, textAlign: 'center', fontSize: 10, color: C.t3 }}>—</div>}
                </div>
              )
            })}
          </div>
        </>}

        {/* CONTACTS */}
        {false && tab === 'contacts' && <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input value={cSearch} onChange={e => setCSearch(e.target.value)} placeholder="Tìm contact..." style={{ ...S.inp, width: 155 }} />
              <select value={cStage} onChange={e => setCStage(e.target.value)} style={{ ...S.inp, width: 120 }}>
                <option value="all">Tất cả stage</option>
                {STAGES.map(s => <option key={s} value={s}>{SL[s]}</option>)}
              </select>
              <select value={cOp} onChange={e => setCOp(e.target.value)} style={{ ...S.inp, width: 115 }}>
                <option value="all">Mọi trạng thái</option>
                <option value="opened">Opened</option>
                <option value="not_opened">Chưa mở</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button style={S.btn('sm')} onClick={() => setContacts(DEMO_CONTACTS.map(d => ({ ...d, id: uid() })))}>✨ Demo</button>
              <button style={S.btn('sm')} onClick={() => {
                if (!contacts.length) return
                const rows = ['email,project,stage,seq,opened,note', ...contacts.map(c => `"${c.email}","${c.project}","${c.stage}","${c.seq}","${c.opened}","${c.note}"`)]
                const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })); a.download = 'contacts.csv'; a.click()
              }}>⬇ CSV</button>
            </div>
          </div>
          <div style={{ background: C.b1, border: `1px solid ${C.bd}`, borderRadius: 10, overflow: 'hidden' }}>
            {filteredContacts.length === 0
              ? <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 12 }}>Không có kết quả — nhấn Demo để thêm dữ liệu mẫu</div>
              : filteredContacts.slice(0, 100).map((c, i) => {
                const [bg, col] = SC[c.stage] || SC.new
                const [ab, ac] = AV_COLORS[i % 6]
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: `1px solid ${C.bd}`, transition: 'background .15s' }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: ab, color: ac, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{c.project.slice(0, 2).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 12 }}>{c.project}</div>
                      <div style={{ fontSize: 11, color: C.t3, fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
                    </div>
                    <span style={S.bdg(bg, col)}>{SL[c.stage]}</span>
                    {c.opened && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '2px 7px', borderRadius: 20, background: `rgba(0,212,255,.1)`, color: C.cyan, border: `1px solid rgba(0,212,255,.2)`, fontWeight: 500 }}>👁</span>}
                    {needsRemind(c) && <span style={S.bdg(C.redDim, C.red)}>🔔</span>}
                    <span style={{ fontSize: 10, color: C.t3 }}>seq {c.seq}/3</span>
                    <button style={S.btn('sm')} onClick={() => setContacts(prev => prev.map(x => x.id === c.id ? { ...x, stage: STAGES[(STAGES.indexOf(x.stage) + 1) % STAGES.length] } : x))}>→</button>
                  </div>
                )
              })
            }
          </div>
        </>}

        {/* SEND */}
        {tab === 'send' && <>
          {/* Remind summary - emails cần follow up */}
          {(() => {
            const DAY4 = 3*24*60*60*1000
            const needR1 = emails.filter(e => e.status==='sent' && !e.remind1_sent_at && e.sent_at && (Date.now()-new Date(e.sent_at).getTime())>=DAY4)
            const needR2 = emails.filter(e => e.status==='sent' && e.remind1_sent_at && !e.remind2_sent_at && (Date.now()-new Date(e.remind1_sent_at).getTime())>=DAY4)
            const needR3 = emails.filter(e => e.status==='sent' && e.remind2_sent_at && !e.remind3_sent_at && (Date.now()-new Date(e.remind2_sent_at).getTime())>=DAY4)
            if (!needR1.length && !needR2.length && !needR3.length) return null
            return (
              <div style={{ ...S.card(), border: `1px solid rgba(245,158,11,.3)`, background: 'rgba(245,158,11,.04)', marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: C.amber, marginBottom: 8 }}>🔔 Cần follow-up (sau 4 ngày)</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {needR1.length > 0 && <button style={{ fontSize: 11, padding: '4px 12px', background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 6, color: C.amber, cursor: 'pointer', fontWeight: 600 }}
                    onClick={async () => { if (!confirm(`Gửi Remind 1 cho ${needR1.length} emails?`)) return; for (const e of needR1) await sendRemind(e.id, 1); loadEmails() }}>
                    ⚡ Gửi R1 ({needR1.length} email)
                  </button>}
                  {needR2.length > 0 && <button style={{ fontSize: 11, padding: '4px 12px', background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 6, color: C.amber, cursor: 'pointer', fontWeight: 600 }}
                    onClick={async () => { if (!confirm(`Gửi Remind 2 cho ${needR2.length} emails?`)) return; for (const e of needR2) await sendRemind(e.id, 2); loadEmails() }}>
                    ⚡ Gửi R2 ({needR2.length} email)
                  </button>}
                  {needR3.length > 0 && <button style={{ fontSize: 11, padding: '4px 12px', background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 6, color: C.amber, cursor: 'pointer', fontWeight: 600 }}
                    onClick={async () => { if (!confirm(`Gửi Remind 3 cho ${needR3.length} emails?`)) return; for (const e of needR3) await sendRemind(e.id, 3); loadEmails() }}>
                    ⚡ Gửi R3 ({needR3.length} email)
                  </button>}
                </div>
                <div style={{ fontSize: 10, color: C.t3, marginTop: 6 }}>Hoặc click R1/R2/R3 từng email bên dưới</div>
              </div>
            )
          })()}
          {/* Quick import emails */}
          <details style={{ ...S.card(), marginBottom: 10, cursor: 'pointer' }}>
            <summary style={{ fontWeight: 600, fontSize: 12, color: C.t2, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>➕</span> Import email nhanh từ bot / copy-paste
            </summary>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>Mỗi dòng 1 email. Format: <code style={{color:C.cyan}}>email@domain.com</code> hoặc <code style={{color:C.cyan}}>Tên &lt;email@domain.com&gt;</code></div>
              <textarea id="quick-import-box" rows={5} placeholder={'media@btcc.com\npress@binance.com\nJohn Smith <john@project.io>'}
                style={{ width: '100%', background: C.b0, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '8px 10px', color: C.t1, fontSize: 12, fontFamily: "'JetBrains Mono',monospace", outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              <button style={{ ...S.btn('p'), marginTop: 8 }} onClick={async () => {
                const box = document.getElementById('quick-import-box') as HTMLTextAreaElement
                const lines = box.value.split('\n').map(l=>l.trim()).filter(Boolean)
                let saved = 0
                for (const line of lines) {
                  const match = line.match(/<([^>]+)>/) || line.match(/([\w.+%-]+@[\w-]+\.[\w.]{2,})/)
                  const addr = match?.[1]?.trim()
                  if (!addr || !addr.includes('@')) continue
                  const name = line.includes('<') ? line.split('<')[0].trim() : ''
                  const domain = addr.split('@')[1]
                  const r = await fetch('/api/emails', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ address: addr, domain, contact_name: name||null, source_type: 'manual', owner_id: currentUser?.id }) })
                  if ((await r.json()).ok) saved++
                }
                box.value = ''
                loadEmails()
                alert('✅ Đã import ' + saved + '/' + lines.length + ' email!')
              }}>📥 Import {`(xử lý từng dòng)`}</button>
            </div>
          </details>
          <div style={{ ...S.card(), background: C.b2, border: 'none', fontSize: 12, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span>
              <span style={{ color: C.amber, fontWeight: 600 }}>{unsentCount}</span>
              <span style={{ color: C.t2 }}> email chưa gửi · </span>
              <span style={{ color: C.green, fontWeight: 600 }}>{sentCount}</span>
              <span style={{ color: C.t2 }}> đã gửi sẽ bỏ qua</span>
            </span>
            <button style={S.btn('sm')} onClick={checkSmtp}>🔌 Kiểm tra SMTP/Resend</button>
          </div>

          {/* Email list - tất cả emails */}
          {emails.length > 0 && (
            <div style={{ ...S.card(), marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>📬 Tất cả emails trong database ({emails.length})</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ ...S.bdg(fSt==='new' ? C.amberDim : C.blueDim, fSt==='new' ? C.amber : C.t3), fontSize: 10, cursor:'pointer' }} onClick={()=>setFSt(fSt==='new'?'all':'new')}>● Chưa gửi ({unsentCount})</span>
                  <span style={{ ...S.bdg(fSt==='sent' ? 'rgba(16,185,129,.2)' : C.blueDim, fSt==='sent' ? C.green : C.t3), fontSize: 10, cursor:'pointer' }} onClick={()=>setFSt(fSt==='sent'?'all':'sent')}>✓ Đã gửi ({sentCount})</span>
                </div>
              </div>
              <div style={{ background: C.b0, border: `1px solid ${C.bd}`, borderRadius: 8, maxHeight: 300, overflowY: 'auto' }}>
                {emails.slice(0, 100).map((e, i) => {
                  // Always use domain as project name
                  const project = e.domain?.split('.')[0]?.replace(/-/g,' ')?.replace(/\b\w/g, (c:string)=>c.toUpperCase()) || 'Project'
                  const displayName = e.source_type === 'hunter_bod' ? (e.contact_name || project) : project
                  return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: i < emails.length-1 ? `1px solid ${C.bd}` : 'none', opacity: e.status === 'sent' ? 0.6 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600 }}>{e.address}</div>
                      <div style={{ fontSize: 10, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', gap: 6 }}>
                        <span style={{ color: C.t2, fontWeight: 500 }}>{project}</span>
                        {e.source_type === 'hunter_bod' && e.contact_name && <span style={{ color: C.t3 }}>· {e.contact_name}</span>}
                        {e.sent_at && <span style={{ color: C.amber, flexShrink: 0 }}>· {new Date(e.sent_at).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' })}</span>}
                      </div>
                    </div>
                    {/* Source badge */}
                    <span style={S.bdg(e.source_type === 'hunter_bod' ? C.amberDim : C.blueDim, e.source_type === 'hunter_bod' ? C.amber : C.cyan)}>
                      {e.source_type === 'hunter_bod' ? 'BOD👑' : 'Bài PR'}
                    </span>

                    {/* Status + actions — mutually exclusive */}
                    {e.status !== 'sent' ? (
                      /* NOT SENT: show single Gửi button */
                      <button disabled={sendingIds.has(e.id)} onClick={async () => {
                        setSendingIds(p => new Set([...p, e.id]))
                        const subjectFilled = (subject||'Boost {{project}} Visibility — Coincu PR & CMC Top News').replace(/\{\{project\}\}/g, project)
                        const bodyFilled = (body||'Hi {{project}},\n\nAt Coincu, we offer PR Distribution and CMC Top News.\n\nTelegram: https://t.me/iamleonnn\n\nBest,\nLEON (Mr.) — Coincu\nE: leon@coincu.com').replace(/\{\{project\}\}/g, project).replace(/\{\{name\}\}/g, project).replace(/\{\{domain\}\}/g, e.domain||'').replace(/\{\{email\}\}/g, e.address)
                        const r = await fetch('/api/send-emails', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ testTo: e.address, subject: subjectFilled, bodyText: bodyFilled, fromName: fromName||'LEON (Mr.) — Coincu', fromEmail: fromEmail||'leon@coincu.com' }) })
                        const d = await r.json()
                        setSendingIds(p => { const n = new Set(p); n.delete(e.id); return n })
                        if (d.ok) {
                          setEmails(prev => prev.map(em => em.id === e.id ? {...em, status: 'sent' as const, sent_at: new Date().toISOString()} : em))
                          await fetch(`/api/emails/${e.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status:'sent', sent_at: new Date().toISOString(), last_subject: subjectFilled, last_body: bodyFilled }) })
                        } else alert('Lỗi: ' + (d.error || 'Unknown error'))
                      }}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: sendingIds.has(e.id) ? C.b3 : C.blueDim, color: sendingIds.has(e.id) ? C.t3 : C.cyan, border: `1px solid ${C.blue}50`, whiteSpace: 'nowrap', cursor: sendingIds.has(e.id) ? 'wait' : 'pointer', fontWeight: 600, minWidth: 60, textAlign: 'center' }}>
                        {sendingIds.has(e.id) ? '⏳' : '✉️ Gửi'}
                      </button>
                    ) : (
                      /* SENT: show single ✓ badge + R1/R2/R3 buttons only */
                      <>
                        <span style={{ ...S.bdg('rgba(16,185,129,.15)', C.green), fontSize: 10, whiteSpace: 'nowrap' }}>
                          ✓ Đã gửi{e.sent_at ? ` ${new Date(e.sent_at).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}` : ''}
                        </span>
                        {(e as any).open_count > 0 && (
                          <span style={{ ...S.bdg('rgba(0,212,255,.15)', C.cyan), fontSize: 10 }}>👁 {(e as any).open_count}</span>
                        )}
                        {([1,2,3] as const).map(n => {
                          const sentAt = e[`remind${n}_sent_at` as keyof typeof e] as string | undefined
                          const prevSentAt = (n === 1 ? e.sent_at : e[`remind${n-1}_sent_at` as keyof typeof e]) as string | undefined
                          const isDone = !!sentAt
                          const DAY = 3*24*60*60*1000
                          const daysLeft = prevSentAt ? Math.ceil((DAY - (Date.now() - new Date(prevSentAt).getTime())) / 86400000) : 99
                          const canSend = !isDone && !!prevSentAt && daysLeft <= 0
                          return (
                            <button key={n} disabled={isDone || !canSend}
                              onClick={() => { if (canSend) sendRemind(e.id, n) }}
                              title={isDone ? `Đã gửi R${n}: ${new Date(sentAt!).toLocaleDateString('vi-VN')}` : !prevSentAt ? `Chờ gửi R${n-1} trước` : canSend ? `Gửi Remind ${n} ngay` : `R${n}: còn ${daysLeft} ngày`}
                              style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, border: `1px solid ${isDone ? 'rgba(16,185,129,.3)' : canSend ? 'rgba(245,158,11,.5)' : C.bd}`, background: isDone ? 'rgba(16,185,129,.1)' : canSend ? 'rgba(245,158,11,.12)' : C.b2, color: isDone ? C.green : canSend ? C.amber : C.t3, cursor: canSend ? 'pointer' : 'default', whiteSpace: 'nowrap', fontWeight: isDone || canSend ? 600 : 400 }}>
                              {isDone ? `✓R${n}` : canSend ? `R${n} ⚡` : `R${n}`}
                            </button>
                          )
                        })}
                      </>
                    )}
                    {e.status === 'sent' && (
                      <button onClick={async () => {
                        const isReplied = e.reply_status === 'replied'
                        await fetch(`/api/emails/${e.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ reply_status: isReplied ? 'no_reply' : 'replied', replied_at: isReplied ? null : new Date().toISOString() }) })
                        loadEmails()
                      }} title={e.reply_status === 'replied' ? 'Đã reply — click để bỏ đánh dấu' : 'Đánh dấu đã nhận reply'}
                        style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, border: `1px solid ${e.reply_status === 'replied' ? 'rgba(16,185,129,.4)' : C.bd}`, background: e.reply_status === 'replied' ? 'rgba(16,185,129,.15)' : C.b2, color: e.reply_status === 'replied' ? C.green : C.t3, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: e.reply_status === 'replied' ? 600 : 400 }}>
                        {e.reply_status === 'replied' ? '↩ Replied' : '↩'}
                      </button>
                    )}
                    <button onClick={async () => {
                      if (!confirm('Blacklist '+e.domain+'? Sẽ không crawl email từ domain này nữa.')) return
                      await fetch('/api/blacklist', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ domain: e.domain, email: e.address, reason: 'manual' }) })
                      await fetch('/api/emails/'+e.id, { method:'DELETE' }).catch(()=>{})
                      loadEmails()
                    }} title={'Blacklist '+e.domain}
                      style={{ fontSize: 10, padding: '4px 6px', borderRadius: 6, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)', color: '#ef4444', cursor: 'pointer' }}>
                      🚫
                    </button>
                  </div>
                )})}
              </div>
            </div>
          )}
          {/* Template picker + Export */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <button onClick={() => { setShowTemplates(p=>!p); loadTemplates() }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: C.b1, border: `1px solid ${C.bd}`, borderRadius: 8, color: C.t1, fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                <span>📋 Chọn template...</span><span style={{ color: C.t3 }}>▼</span>
              </button>
              {showTemplates && templates.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99, background: C.b1, border: `1px solid ${C.bd}`, borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                  {templates.map(t => (
                    <div key={t.id} style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: `1px solid ${C.bd}`, fontSize: 12 }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.b3}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                      onClick={() => { setSubject(t.subject); setBody(t.body); setShowTemplates(false) }}>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{t.subject.slice(0,60)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={exportCSV} style={{ padding: '8px 14px', background: C.b1, border: `1px solid ${C.bd}`, borderRadius: 8, color: C.t2, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600 }}>
              📥 Export CSV
            </button>
          </div>
          <div style={{ ...S.card(), background: `linear-gradient(135deg,${C.b1} 0%,#0f1825 100%)`, border: `1px solid ${C.blueDim}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div><label style={{ fontSize: 11, color: C.t2, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Tên người gửi</label><input value={fromName} onChange={e => setFromName(e.target.value)} style={S.inp} /></div>
              <div><label style={{ fontSize: 11, color: C.t2, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Email người gửi</label><input value={fromEmail} onChange={e => setFromEmail(e.target.value)} type="email" style={S.inp} /></div>
            </div>
            <div style={{ marginBottom: 8 }}><label style={{ fontSize: 11, color: C.t2, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Subject — dùng {'{{project}}'}</label><input value={subject} onChange={e => setSubject(e.target.value)} style={S.inp} /></div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, color: C.t2, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Nội dung — {'{{email}}'} {'{{domain}}'} {'{{name}}'} {'{{project}}'}</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} style={{ ...S.inp, minHeight: 150, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={S.btn()} onClick={() => {
                const s = emails.find(e => e.status === 'new')
                setPreview(`Từ: ${fromName} <${fromEmail}>\nSubject: ${subject.replace(/\{\{project\}\}/g, s?.contact_name || 'Project')}\n\n${body.replace(/\{\{email\}\}/g, s?.address || '').replace(/\{\{domain\}\}/g, s?.domain || '').replace(/\{\{project\}\}/g, s?.contact_name || 'Project').replace(/\{\{name\}\}/g, s?.contact_name || 'Team')}`)
              }}>👁 Xem trước</button>
              <button style={{ ...S.btn('p'), ...{ fontSize: 13, padding: '11px 20px' } }} onClick={doSend} disabled={busy || unsentCount === 0}>{busy ? '⏳ Đang gửi...' : `✉️ Gửi ${unsentCount} email`}</button>
            </div>
            {preview && <pre style={{ marginTop: 10, fontSize: 11, fontFamily: "'JetBrains Mono',monospace", whiteSpace: 'pre-wrap', background: C.b0, padding: 12, borderRadius: 8, color: C.t2, lineHeight: 1.7, border: `1px solid ${C.bd}` }}>{preview}</pre>}
          </div>
          {sendLog.length > 0 && <div style={S.card()}><ProgBar pct={sp} color={C.green} /><div style={S.logBox}>{sendLog.map((l, i) => <div key={i} style={{ color: lc(l.t) }}>{l.msg}</div>)}</div>
            {sendDone && <div style={{ marginTop: 8, padding: '10px 12px', background: `rgba(16,185,129,.08)`, border: `1px solid rgba(16,185,129,.2)`, borderRadius: 8, fontSize: 12, color: C.green }}>✅ Hoàn tất: <strong>{sendDone.ok}</strong> thành công · <strong>{sendDone.fail}</strong> thất bại · <strong>{sendDone.skip}</strong> bỏ qua</div>}
          </div>}
        </>}

        {/* TEST EMAIL */}
        {(tab === 'testemail' || tab === 'settings') && <>
          {/* Hunter API Keys */}
          <div style={{ ...S.card(), marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 10, color: C.amber }}>🎯 Hunter API Key Rotation</div>
            <div style={{ fontSize: 11, color: C.t3, marginBottom: 8 }}>Thêm nhiều API keys để tránh hết quota. Keys được dùng luân phiên.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: C.t2, marginBottom: 4, fontWeight: 600 }}>KEY 2</div>
                <input id="hk2" placeholder="re_hunter_key_2..." style={{ ...S.inp, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.t2, marginBottom: 4, fontWeight: 600 }}>KEY 3</div>
                <input id="hk3" placeholder="re_hunter_key_3..." style={{ ...S.inp, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }} />
              </div>
            </div>
            <button style={S.btn('p')} onClick={async () => {
              const k2 = (document.getElementById('hk2') as HTMLInputElement)?.value
              const k3 = (document.getElementById('hk3') as HTMLInputElement)?.value
              const r = await fetch('/api/auth', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: currentUser?.id, username: currentUser?.username || '', password:'••••••••', role: currentUser?.role, hunter_api_key: [k2,k3].filter(Boolean).join(',') }) })
              const d = await r.json()
              alert(d.ok ? '✅ Đã lưu keys!' : '❌ '+d.error)
            }}>💾 Lưu Keys</button>
            <div style={{ fontSize: 10, color: C.t3, marginTop: 6 }}>Tạo thêm account miễn phí tại <a href="https://hunter.io" target="_blank" style={{color:C.cyan}}>hunter.io</a> → mỗi account có 50 searches/tháng</div>
          </div>
          <div style={{ ...S.card(), background: `linear-gradient(135deg,${C.b1} 0%,#0a1a0a 100%)`, border: `1px solid rgba(16,185,129,.3)`, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 16 }}>🧪</span>
              <span style={{ fontWeight: 600, fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", color: C.green }}>Test gửi email thật</span>
              <span style={S.bdg(`rgba(16,185,129,.12)`, C.green)}>SMTP Live</span>
              {smtpOk === true && <span style={S.bdg(`rgba(16,185,129,.12)`, C.green)}>✓ SMTP OK</span>}
              {smtpOk === false && <span style={S.bdg(C.redDim, C.red)}>✗ SMTP chưa cấu hình</span>}
            </div>
            <p style={{ fontSize: 11, color: '#4a9a4a', lineHeight: 1.6, marginBottom: 10 }}>Nhập email nhận để test — email sẽ được gửi thật với nội dung bên dưới. Subject có tiền tố [TEST] để phân biệt.</p>
            <button style={{ ...S.btn('sm'), ...{ background: C.greenDim, border: `1px solid rgba(16,185,129,.3)`, color: C.green, marginBottom: 12 } }} onClick={checkSmtp}>🔌 Kiểm tra kết nối SMTP</button>
          </div>

          <div style={{ ...S.card(), border: `1px solid ${C.blueDim}` }}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: C.t2, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>📧 Email nhận (để test)</label>
              <input
                value={testTo}
                onChange={e => setTestTo(e.target.value)}
                type="email"
                placeholder="nhap-email-cua-ban@gmail.com"
                style={{ ...S.inp, border: `1px solid rgba(37,99,235,.4)` }}
              />
              <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>Điền email của bạn để nhận email test trước khi gửi hàng loạt</div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: C.t2, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Subject</label>
              <input value={testSubject} onChange={e => setTestSubject(e.target.value)} style={S.inp} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: C.t2, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Nội dung email</label>
              <textarea value={testBody} onChange={e => setTestBody(e.target.value)} style={{ ...S.inp, minHeight: 180, resize: 'vertical' as const }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                style={{ ...S.btn('p'), ...{ fontSize: 13, padding: '11px 20px', background: C.green, opacity: testStatus === 'sending' ? 0.5 : 1 } }}
                onClick={sendTestEmail}
                disabled={testStatus === 'sending'}
              >
                {testStatus === 'sending' ? '⏳ Đang gửi...' : '📤 Gửi email test ngay'}
              </button>
              {testStatus === 'ok' && <span style={{ fontSize: 12, color: C.green }}>{testMsg}</span>}
              {testStatus === 'err' && <span style={{ fontSize: 12, color: C.red }}>{testMsg}</span>}
            </div>
          </div>

          <div style={S.card()}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: C.t2 }}>💡 Hướng dẫn cấu hình SMTP để gửi email</div>
            <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.8 }}>
              <div>1. Vào <strong style={{color:C.t1}}>Vercel → Settings → Environment Variables</strong></div>
              <div>2. Thêm các biến sau:</div>
              <pre style={{ background: C.b0, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '8px 10px', marginTop: 6, fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: C.t2, lineHeight: 1.9 }}>{`SMTP_HOST     = smtp.gmail.com
SMTP_PORT     = 587
SMTP_USER     = leon@coincu.com  (hoặc gmail của bạn)
SMTP_PASS     = xxxx xxxx xxxx xxxx  (Gmail App Password)`}</pre>
              <div style={{ marginTop: 8, color: C.t3 }}>3. Gmail → <strong style={{color:C.t1}}>myaccount.google.com/apppasswords</strong> → tạo App Password (cần bật 2FA)</div>
              <div style={{ marginTop: 4, color: C.t3 }}>4. Sau khi thêm env vars → Redeploy trên Vercel</div>
            </div>
          </div>
        </>}

        {/* TRACKING */}
        {tab === 'tracking' && <>
          <div style={{ ...S.card(), background: `linear-gradient(135deg,${C.b1} 0%,#061520 100%)`, border: `1px solid rgba(0,212,255,.25)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ color: C.cyan }}>👁</span>
              <span style={{ fontWeight: 600, fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", color: C.cyan }}>Email open tracking — pixel 1×1</span>
              <span style={S.bdg(`rgba(0,212,255,.08)`, C.cyan)}>Live</span>
            </div>
            <p style={{ fontSize: 11, color: C.cyanMid, lineHeight: 1.6, marginBottom: 8 }}>Khi contact mở email → ghi Supabase + ping Telegram ngay. Follow up trong 1 tiếng tăng reply rate 3x.</p>
            <code style={{ display: 'block', background: '#03060d', border: `1px solid ${C.cyanDim}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, color: C.t2, fontFamily: "'JetBrains Mono',monospace" }}>
              {`<img src="/api/receipt?id={{email_id}}" width="1" height="1" style="display:none" />`}
            </code>
            <button style={{ ...S.btn('sm'), ...{ background: C.cyanDim, border: `1px solid rgba(0,212,255,.3)`, color: C.cyan, marginTop: 10 } }} onClick={simulateOpen}>▶ Giả lập mở email</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
            <StatBox label="Opened" value={openEvents.length} color={C.cyan} />
            <StatBox label="Open rate" value={sentCount > 0 ? `${Math.round(openEvents.length / sentCount * 100)}%` : '0%'} color={C.green} />
            <StatBox label="Chưa mở" value={Math.max(0, sentCount - openEvents.length)} />
          </div>
          <div style={{ background: C.b1, border: `1px solid ${C.bd}`, borderRadius: 10, overflow: 'hidden' }}>
            {openEvents.length === 0
              ? <div style={{ padding: 20, textAlign: 'center', color: C.t3, fontSize: 12 }}>Nhấn "Giả lập mở email" để xem event</div>
              : openEvents.map((ev, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: `1px solid ${C.bd}` }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: `rgba(0,212,255,.15)`, color: C.cyan, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>👁</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 12 }}>{ev.contact} <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '2px 7px', borderRadius: 20, background: `rgba(0,212,255,.1)`, color: C.cyan, border: `1px solid rgba(0,212,255,.2)`, fontWeight: 500 }}>👁 opened</span></div>
                    <div style={{ fontSize: 10, color: C.t3, fontFamily: "'JetBrains Mono',monospace" }}>{ev.email}</div>
                  </div>
                  <span style={{ fontSize: 10, color: C.t3, fontFamily: "'JetBrains Mono',monospace" }}>{ev.time}</span>
                </div>
              ))
            }
          </div>
        </>}

        {/* TELEGRAM */}
        {tab === 'telegram' && <>
          <div style={{ ...S.card(), background: `linear-gradient(135deg,${C.b1} 0%,#061520 100%)`, border: `1px solid rgba(0,212,255,.25)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ color: C.cyan }}>📱</span>
              <span style={{ fontWeight: 600, fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", color: C.cyan }}>Telegram bot notifications</span>
              <span style={S.bdg(tgOk === true ? C.greenDim : tgOk === false ? C.redDim : C.amberDim, tgOk === true ? C.green : tgOk === false ? C.red : C.amber)}>{tgOk === true ? 'Đã kết nối' : tgOk === false ? 'Lỗi kết nối' : 'Chưa cấu hình'}</span>
            </div>
            <p style={{ fontSize: 11, color: C.cyanMid, lineHeight: 1.6, marginBottom: 10 }}>Ping khi: contact mở email · có reply · gửi xong batch · auto-remind xong</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div><label style={{ fontSize: 11, color: C.t2, display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Bot Token</label><input value={tgToken} onChange={e => setTgToken(e.target.value)} type="password" placeholder="110201543:AAHdq..." style={S.inp} /></div>
              <div><label style={{ fontSize: 11, color: C.t2, display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Chat ID</label><input value={tgChat} onChange={e => setTgChat(e.target.value)} placeholder="123456789" style={S.inp} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...S.btn('tg') }} onClick={testTelegram}>🔌 Test kết nối</button>
              <button style={S.btn('p')} onClick={() => alert('Thêm TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID vào Vercel Environment Variables')}>💾 Lưu</button>
              <button style={S.btn()} onClick={() => addTgMsg(`🔥 TestProject đã reply!\n💬 "Interested! Send pricing?"\n⏰ ${new Date().toLocaleTimeString('vi-VN')}`)}>▶ Giả lập notify</button>
            </div>
          </div>

          <div style={{ fontSize: 10, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            Notification feed <div style={{ flex: 1, height: 1, background: C.bd }} />
          </div>
          <div style={{ background: '#02080e', border: `1px solid rgba(0,212,255,.15)`, borderRadius: 10, padding: 12, minHeight: 80 }}>
            {tgMsgs.length === 0
              ? <div style={{ textAlign: 'center', padding: 18, color: C.t3, fontSize: 12 }}>📱 Chưa có notification nào</div>
              : tgMsgs.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, marginBottom: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: C.cyanDim, border: `1px solid rgba(0,212,255,.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>🤖</div>
                  <div>
                    <div style={{ background: C.b2, border: `1px solid ${C.bd}`, borderRadius: '0 10px 10px 10px', padding: '8px 11px', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 3, fontFamily: "'JetBrains Mono',monospace" }}>{m.time}</div>
                  </div>
                </div>
              ))
            }
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
            {[['👁 Email opened', 'Ping ngay khi contact mở', C.cyan], ['💬 Contact replied', 'Ping + nội dung reply', C.green], ['✉️ Batch sent', 'Summary sau khi gửi xong', C.blue], ['⏰ Auto-remind', 'Summary cron 8h sáng', C.amber]].map(([t, d, c]) => (
              <div key={t as string} style={S.card()}>
                <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 3 }}><span style={{ color: c as string, marginRight: 4 }}>●</span>{t}</div>
                <div style={{ fontSize: 11, color: C.t3 }}>{d}</div>
              </div>
            ))}
          </div>
        </>}

        {/* ── USERS TAB ── */}
        {tab === 'users' && currentUser?.role === 'admin' && <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>👥 Quản lý Users</div>
            <button style={{ ...S.btn('p') }} onClick={() => { setUserForm({ id:'', username:'', password:'', role:'user' }); setShowUserForm(true) }}>+ Thêm user</button>
          </div>

          {showUserForm && (
            <div style={{ ...S.card(), marginBottom: 12, border: `1px solid ${C.blue}40` }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>{userForm.id ? 'Sửa' : 'Thêm'} user</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                <input placeholder="Username" value={userForm.username} onChange={e => setUserForm(p=>({...p, username: e.target.value}))}
                  style={{ background: C.b0, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 10px', color: C.t1, fontSize: 12, outline: 'none' }} />
                <input type="password" placeholder="Password" value={userForm.password} onChange={e => setUserForm(p=>({...p, password: e.target.value}))}
                  style={{ background: C.b0, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 10px', color: C.t1, fontSize: 12, outline: 'none' }} />
                <select value={userForm.role} onChange={e => setUserForm(p=>({...p, role: e.target.value}))}
                  style={{ background: C.b0, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 10px', color: C.t1, fontSize: 12, outline: 'none' }}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...S.btn('p') }} onClick={saveUser}>💾 Lưu</button>
                <button style={{ ...S.btn('sm'), background: C.b3, color: C.t2 }} onClick={() => setShowUserForm(false)}>Hủy</button>
              </div>
            </div>
          )}

          <div style={{ ...S.card() }}>
            <div style={{ background: C.b0, border: `1px solid ${C.bd}`, borderRadius: 8, overflow: 'hidden' }}>
              {users.map((u, i) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < users.length-1 ? `1px solid ${C.bd}` : 'none' }}>
                  <div style={{ width: 32, height: 32, background: u.role === 'admin' ? C.amberDim : C.blueDim, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: u.role === 'admin' ? C.amber : C.cyan }}>
                    {u.username[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{u.username}</div>
                    <div style={{ fontSize: 10, color: C.t3 }}>Last login: {u.last_login ? new Date(u.last_login).toLocaleString('vi-VN') : 'Chưa login'}</div>
                  </div>
                  <span style={S.bdg(u.role === 'admin' ? C.amberDim : C.blueDim, u.role === 'admin' ? C.amber : C.cyan)}>{u.role}</span>
                  <span style={{ fontSize: 10, color: C.t3 }}>{u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : ''}</span>
                  {u.id !== currentUser?.id && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setUserForm({ id: u.id, username: u.username, password: '••••••••', role: u.role }); setShowUserForm(true) }}
                        style={{ fontSize: 11, padding: '3px 8px', background: C.b3, border: `1px solid ${C.bd}`, borderRadius: 5, color: C.t2, cursor: 'pointer' }}>Sửa</button>
                      <button onClick={() => deleteUser(u.id)}
                        style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 5, color: '#ef4444', cursor: 'pointer' }}>Xóa</button>
                    </div>
                  )}
                </div>
              ))}
              {users.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.t3 }}>Chưa có user nào</div>}
            </div>
          </div>
        </>}

      </div>
    </div>
  )
}

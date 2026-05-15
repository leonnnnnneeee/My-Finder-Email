'use client'
import { useState, useEffect, useCallback } from 'react'

type Email = { id: string; address: string; source_url: string | null; domain: string | null; status: 'new' | 'sent' | 'failed'; contact_name?: string; position?: string; confidence?: number; source_type?: string; created_at: string }
type Site = { id: string; url: string; domain: string; last_crawled_at?: string; total_pages_crawled: number; total_emails_found: number }
type Log = { msg: string; t: 'info' | 'ok' | 'err' | 'dim' | 'warn' }

const card: React.CSSProperties = { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: '16px 18px', marginBottom: 12 }
const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }
const logBox: React.CSSProperties = { background: '#0f172a', borderRadius: 8, padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.8, maxHeight: 180, overflowY: 'auto' }
const prog: React.CSSProperties = { height: 3, background: 'var(--color-border-tertiary)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }
const lc = (t: Log['t']) => ({ info: '#60a5fa', ok: '#4ade80', err: '#f87171', dim: '#475569', warn: '#EF9F27' })[t]

function Btn({ onClick, disabled, variant, children }: any) {
  const s: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', border: variant === 'primary' ? 'none' : `0.5px solid var(--color-border-secondary)`, background: variant === 'primary' ? '#0f172a' : 'var(--color-background-primary)', color: variant === 'primary' ? '#fff' : variant === 'danger' ? 'var(--color-text-danger)' : 'var(--color-text-primary)', fontWeight: variant === 'primary' ? 500 : 400, opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap' as const, display: 'inline-flex', alignItems: 'center', gap: 5, borderColor: variant === 'danger' ? 'var(--color-border-danger)' : undefined }
  return <button style={s} onClick={onClick} disabled={disabled}>{children}</button>
}

function ProgBar({ pct }: { pct: number }) {
  return <div style={prog}><div style={{ height: '100%', width: `${pct}%`, background: '#0f172a', borderRadius: 3, transition: 'width .3s' }} /></div>
}

function LogPane({ logs }: { logs: Log[] }) {
  return <div style={logBox}>{logs.map((l, i) => <div key={i} style={{ color: lc(l.t) }}>{l.msg}</div>)}</div>
}

const srcBadge = (t?: string) => {
  const map: any = { hunter_bod: ['#FAEEDA', '#633806', 'BOD 👑'], hunter: ['#EEEDFE', '#3C3489', 'Hunter'], article: ['#E6F1FB', '#0C447C', 'Bài viết'], scrape: ['#EAF3DE', '#27500A', 'Scrape'], manual: ['#F1EFE8', '#444441', 'Thủ công'] }
  const [bg, color, label] = map[t || 'manual'] || map.manual
  return <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 500, background: bg, color }}>{label}</span>
}

export default function Page() {
  const [tab, setTab] = useState<'find' | 'hunter' | 'crawl' | 'list' | 'send'>('find')
  const [emails, setEmails] = useState<Email[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [fSt, setFSt] = useState('all')
  const [fSrc, setFSrc] = useState('all')
  const [q, setQ] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [findMode, setFindMode] = useState('contact')
  const [manual, setManual] = useState('')
  const [findLog, setFindLog] = useState<Log[]>([])
  const [fp, setFp] = useState(0)
  const [hunterDoms, setHunterDoms] = useState('')
  const [hunterMode, setHunterMode] = useState('bod')
  const [hunterLog, setHunterLog] = useState<Log[]>([])
  const [hp, setHp] = useState(0)
  const [newSite, setNewSite] = useState('')
  const [crawlLog, setCrawlLog] = useState<Log[]>([])
  const [cp, setCp] = useState(0)
  const [crawlingId, setCrawlingId] = useState<string | null>(null)
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState('')
  const [sendLog, setSendLog] = useState<Log[]>([])
  const [sp, setSp] = useState(0)

  const loadEmails = useCallback(async () => {
    const p = new URLSearchParams()
    if (fSt !== 'all') p.set('status', fSt)
    if (q) p.set('search', q)
    const r = await fetch(`/api/emails?${p}`); const d = await r.json()
    if (d.emails) setEmails(d.emails)
  }, [fSt, q])

  const loadSites = useCallback(async () => {
    const r = await fetch('/api/crawl-site'); const d = await r.json()
    if (d.sites) setSites(d.sites)
  }, [])

  useEffect(() => { loadEmails() }, [loadEmails])
  useEffect(() => { if (tab === 'crawl') loadSites() }, [tab, loadSites])

  const addLog = (set: any, msg: string, t: Log['t'] = 'info') => set((p: Log[]) => [...p, { msg, t }])

  async function doFind() {
    const urls = urlInput.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return alert('Nhập ít nhất 1 URL')
    setFindLog([]); setFp(0); setBusy(true)
    addLog(setFindLog, `▶ Quét ${urls.length} URL...`, 'info')
    const r = await fetch('/api/find-emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls, mode: findMode }) })
    const d = await r.json()
    for (let i = 0; i < (d.results || []).length; i++) {
      const x = d.results[i]; setFp(Math.round((i + 1) / d.results.length * 100))
      if (x.error) addLog(setFindLog, `✗ ${x.domain}: ${x.error}`, 'err')
      else { addLog(setFindLog, `✓ ${x.domain} — ${x.added} mới / ${x.found - x.added} trùng bỏ qua`, x.added > 0 ? 'ok' : 'dim'); x.emails?.forEach((e: any) => addLog(setFindLog, `  → ${e.addr}`, 'ok')) }
    }
    addLog(setFindLog, '─── xong ───', 'dim'); setBusy(false); loadEmails()
  }

  async function doManual() {
    if (!manual.trim()) return
    const [addr, src] = manual.split(',').map(s => s.trim())
    const r = await fetch('/api/emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: addr, source_url: src || null }) })
    const d = await r.json()
    if (d.error) return alert(d.error)
    setManual(''); addLog(setFindLog, `✓ Thêm: ${addr}`, 'ok'); loadEmails()
  }

  async function doHunter() {
    const domains = hunterDoms.split('\n').map(d => d.trim()).filter(Boolean)
    if (!domains.length) return alert('Nhập ít nhất 1 domain')
    setHunterLog([]); setHp(0); setBusy(true)
    addLog(setHunterLog, `▶ Hunter.io — ${hunterMode === 'bod' ? 'Chỉ BOD' : 'Tất cả'} từ ${domains.length} domain...`, 'info')
    const r = await fetch('/api/hunter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domains, mode: hunterMode }) })
    const d = await r.json()
    for (let i = 0; i < (d.results || []).length; i++) {
      const x = d.results[i]; setHp(Math.round((i + 1) / d.results.length * 100))
      if (x.error) { addLog(setHunterLog, `✗ ${x.domain}: ${x.error}`, 'err'); continue }
      addLog(setHunterLog, `✓ ${x.domain} (${x.company}) — ${x.added} mới · ${x.skipped} trùng`, x.added > 0 ? 'ok' : 'dim')
      x.emails?.forEach((e: any) => addLog(setHunterLog, `  → ${e.addr} | ${e.name || '?'} | ${e.position || '?'}${e.isBOD ? ' 👑' : ''} (${e.confidence}%)`, 'ok'))
    }
    addLog(setHunterLog, '─── xong ───', 'dim'); setBusy(false); loadEmails()
  }

  async function addSiteAndCrawl() {
    if (!newSite.trim()) return
    setCrawlLog([]); setCp(0)
    addLog(setCrawlLog, `▶ Thêm và quét: ${newSite}`, 'info')
    const r = await fetch('/api/crawl-site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: newSite.trim(), maxPages: 8 }) })
    const d = await r.json()
    if (d.error) { addLog(setCrawlLog, `✗ ${d.error}`, 'err'); return }
    setNewSite(''); processCrawlResult(d); loadSites(); loadEmails()
  }

  async function crawlSite(site: Site) {
    setCrawlingId(site.id); setCrawlLog([]); setCp(0)
    addLog(setCrawlLog, `▶ Quét bài mới từ ${site.domain} (đã quét ${site.total_pages_crawled} trang trước)...`, 'info')
    const r = await fetch('/api/crawl-site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: site.url, maxPages: 8 }) })
    const d = await r.json()
    if (d.error) { addLog(setCrawlLog, `✗ ${d.error}`, 'err'); setCrawlingId(null); return }
    processCrawlResult(d); setCrawlingId(null); loadSites(); loadEmails()
  }

  function processCrawlResult(d: any) {
    for (let i = 0; i < (d.results || []).length; i++) {
      const x = d.results[i]; setCp(Math.round((i + 1) / d.results.length * 100))
      addLog(setCrawlLog, `📄 ${x.title || x.url}`, 'info')
      if (x.advertiser) addLog(setCrawlLog, `  Advertiser: ${x.advertiser}`, 'dim')
      x.newEmails?.forEach((e: string) => addLog(setCrawlLog, `  ✓ ${e}`, 'ok'))
      if (x.skipped > 0) addLog(setCrawlLog, `  ~ ${x.skipped} trùng bỏ qua`, 'warn')
    }
    addLog(setCrawlLog, `─── ${d.pagesScanned} trang · ${d.newEmails} email mới ───`, 'ok')
  }

  async function doSend() {
    if (!fromName || !fromEmail || !subject || !body) return alert('Điền đầy đủ')
    const unsent = emails.filter(e => e.status === 'new')
    if (!unsent.length) return alert('Không có email chưa gửi')
    if (!confirm(`Gửi đến ${unsent.length} email?`)) return
    setSendLog([]); setSp(0); setBusy(true)
    const r = await fetch('/api/send-emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromName, fromEmail, subject, body }) })
    const d = await r.json()
    ;(d.results || []).forEach((x: any, i: number) => { setSp(Math.round((i + 1) / d.results.length * 100)); addLog(setSendLog, x.status === 'success' ? `✓ ${x.address}` : `✗ ${x.address}: ${x.error}`, x.status === 'success' ? 'ok' : 'err') })
    addLog(setSendLog, `─── ${d.sent} thành công / ${d.failed} thất bại ───`, 'ok')
    setBusy(false); loadEmails()
  }

  const unsentCount = emails.filter(e => e.status === 'new').length
  const sentCount = emails.filter(e => e.status === 'sent').length
  const bodCount = emails.filter(e => e.source_type === 'hunter_bod').length
  const filtered = emails.filter(e => { const mq = !q || e.address.includes(q) || (e.domain || '').includes(q); const ms = fSt === 'all' || e.status === fSt; const mr = fSrc === 'all' || e.source_type === fSrc; return mq && ms && mr })

  const TABS = [['find','🔍 Tìm URL'],['hunter','🎯 Hunter BOD'],['crawl','🕷 Bài viết'],['list',`📋 Danh sách (${emails.length})`],['send','✉️ Gửi']] as const

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', fontFamily: 'var(--font-sans)' }}>
      <div style={{ background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', height: 52 }}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>📧 Email Finder</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
          {[['Email', emails.length],['Chưa gửi', unsentCount],['Đã gửi', sentCount],['BOD', bodCount],['Sites', sites.length]].map(([l,v]) => (
            <div key={l as string} style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontWeight: 500, fontSize: 14, lineHeight: 1 }}>{v}</div>
              <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', padding: '0 24px' }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 500 : 400, color: tab === k ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', borderBottom: `2px solid ${tab === k ? '#0f172a' : 'transparent'}`, marginBottom: -0.5, transition: 'all .15s' }}>{l}</button>
        ))}
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '18px 16px 40px' }}>

        {tab === 'find' && <>
          <div style={card}>
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>Nhập URL để scrape email. Tự động bỏ trùng với toàn bộ danh sách hiện có.</p>
            <textarea value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder={'https://company.vn\nhttps://startup.io'} style={{ ...inp, minHeight: 90, resize: 'vertical', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={findMode} onChange={e => setFindMode(e.target.value)} style={{ ...inp, flex: 1 }}>
                <option value="contact">Contact / About / Footer</option>
                <option value="pr">Press Release / Sponsored</option>
              </select>
              <Btn variant="primary" onClick={doFind} disabled={busy}>🔍 Tìm ngay</Btn>
            </div>
          </div>
          {findLog.length > 0 && <div style={card}><ProgBar pct={fp} /><LogPane logs={findLog} /></div>}
          <div style={{ ...card, background: 'var(--color-background-secondary)', border: 'none' }}>
            <label style={lbl}>Thêm email thủ công</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={manual} onChange={e => setManual(e.target.value)} placeholder="email@domain.com, https://nguon.com" style={{ ...inp, flex: 1 }} onKeyDown={e => e.key === 'Enter' && doManual()} />
              <Btn onClick={doManual}>+ Thêm</Btn>
            </div>
          </div>
        </>}

        {tab === 'hunter' && <>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>Hunter.io Domain Search</span>
              <span style={{ fontSize: 11, background: '#EEEDFE', color: '#3C3489', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>API Key ✓</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>Nhập domain đối thủ để tìm email BOD (CEO, CFO, CMO, CTO, Founder...) hoặc toàn bộ email. Mỗi dòng 1 domain.</p>
            <textarea value={hunterDoms} onChange={e => setHunterDoms(e.target.value)} placeholder={'example.com\nstartup.io\ncompany.vn'} style={{ ...inp, minHeight: 90, resize: 'vertical', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={hunterMode} onChange={e => setHunterMode(e.target.value)} style={{ ...inp, flex: 1 }}>
                <option value="bod">Chỉ lấy BOD — CEO, CFO, CMO, CTO, Founder, Director...</option>
                <option value="all">Tất cả email tìm được</option>
              </select>
              <Btn variant="primary" onClick={doHunter} disabled={busy}>🎯 Tìm ngay</Btn>
            </div>
          </div>
          {hunterLog.length > 0 && <div style={card}><ProgBar pct={hp} /><LogPane logs={hunterLog} /></div>}
          <div style={{ ...card, background: '#EEEDFE', border: '0.5px solid #AFA9EC' }}>
            <p style={{ fontSize: 12, color: '#3C3489', lineHeight: 1.6 }}>
              💡 Hunter.io xác minh email từ nguồn công khai (LinkedIn, website, bài báo). Email BOD tìm được sẽ có tên đầy đủ + chức danh + độ tin cậy %. Env var: <code style={{ fontSize: 11 }}>HUNTER_API_KEY</code>
            </p>
          </div>
        </>}

        {tab === 'crawl' && <>
          <div style={card}>
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
              Thêm site đối thủ. Mỗi lần nhấn "Quét bài mới" sẽ chỉ crawl trang <strong>chưa quét</strong> — không bao giờ quét lại trang cũ.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newSite} onChange={e => setNewSite(e.target.value)} placeholder="https://livebitcoinnews.com/press-release/" style={{ ...inp, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addSiteAndCrawl()} />
              <Btn variant="primary" onClick={addSiteAndCrawl}>+ Thêm & quét</Btn>
            </div>
          </div>

          {sites.length === 0
            ? <div style={{ ...card, textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)' }}><div style={{ fontSize: 32, marginBottom: 8 }}>🕷</div><div>Chưa có site. Thêm URL ở trên.</div></div>
            : sites.map(site => (
              <div key={site.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{site.domain}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{site.url}</div>
                    <div style={{ display: 'flex', gap: 20 }}>
                      {[['Trang đã quét', site.total_pages_crawled, '#0f172a'], ['Email tìm được', site.total_emails_found, '#15803d'], ['Lần cuối', site.last_crawled_at ? new Date(site.last_crawled_at).toLocaleDateString('vi') : '—', '#64748b']].map(([l,v,c]) => (
                        <div key={l as string}><div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{l}</div><div style={{ fontSize: 15, fontWeight: 500, color: c as string }}>{v}</div></div>
                      ))}
                    </div>
                  </div>
                  <Btn variant="primary" onClick={() => crawlSite(site)} disabled={crawlingId === site.id}>
                    {crawlingId === site.id ? '⏳ Đang quét...' : '🕷 Quét bài mới'}
                  </Btn>
                </div>
              </div>
            ))
          }

          {crawlLog.length > 0 && <div style={card}><ProgBar pct={cp} /><LogPane logs={crawlLog} /></div>}
        </>}

        {tab === 'list' && <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 12 }}>
            {[['Tổng email', emails.length,'#0f172a'],['Chưa gửi', unsentCount,'#b45309'],['Đã gửi', sentCount,'#15803d'],['BOD 👑', bodCount,'#3C3489']].map(([l,v,c]) => (
              <div key={l as string} style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 22, fontWeight: 500, color: c as string }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm email..." style={{ ...inp, width: 150 }} />
              <select value={fSt} onChange={e => setFSt(e.target.value)} style={{ ...inp, width: 110 }}>
                <option value="all">Tất cả</option><option value="new">Chưa gửi</option><option value="sent">Đã gửi</option><option value="failed">Lỗi</option>
              </select>
              <select value={fSrc} onChange={e => setFSrc(e.target.value)} style={{ ...inp, width: 120 }}>
                <option value="all">Mọi nguồn</option><option value="hunter_bod">BOD 👑</option><option value="hunter">Hunter</option><option value="article">Bài viết</option><option value="scrape">Scrape</option><option value="manual">Thủ công</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn onClick={() => setSel(sel.size === emails.length ? new Set() : new Set(emails.map(e => e.id)))}>Chọn tất</Btn>
              <Btn variant="danger" onClick={async () => { if (!sel.size) return; if (!confirm(`Xoá ${sel.size}?`)) return; await fetch('/api/emails',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[...sel]})}); setSel(new Set()); loadEmails() }}>🗑 Xoá</Btn>
              <Btn onClick={() => { const rows=['email,domain,source,name,position,status',...emails.map(e=>`"${e.address}","${e.domain||''}","${e.source_type||''}","${e.contact_name||''}","${e.position||''}","${e.status}"`)]; const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'}));a.download='emails.csv';a.click() }}>⬇ CSV</Btn>
            </div>
          </div>
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {filtered.length === 0
              ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>Không có email</div>
              : filtered.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 12, background: e.status === 'sent' ? '#f0fdf4' : 'transparent' }}>
                  <input type="checkbox" checked={sel.has(e.id)} onChange={ev => { const s = new Set(sel); ev.target.checked ? s.add(e.id) : s.delete(e.id); setSel(s) }} />
                  <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.address}</span>
                  {e.contact_name && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{e.contact_name}</span>}
                  {e.position && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.position}</span>}
                  {srcBadge(e.source_type)}
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 500, background: e.status === 'sent' ? '#EAF3DE' : e.status === 'failed' ? '#FCEBEB' : '#FAEEDA', color: e.status === 'sent' ? '#27500A' : e.status === 'failed' ? '#791F1F' : '#633806', whiteSpace: 'nowrap' }}>
                    {e.status === 'sent' ? '✓ Đã gửi' : e.status === 'failed' ? 'Lỗi' : 'Mới'}
                  </span>
                </div>
              ))
            }
          </div>
        </>}

        {tab === 'send' && <>
          <div style={{ ...card, background: 'var(--color-background-secondary)', border: 'none', fontSize: 13 }}>
            <strong>{unsentCount}</strong> email chưa gửi · <strong>{sentCount}</strong> đã gửi sẽ <span style={{ color: '#15803d' }}>tự bỏ qua</span>
          </div>
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div><label style={lbl}>Tên người gửi</label><input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Công ty ABC" style={inp} /></div>
              <div><label style={lbl}>Email người gửi</label><input value={fromEmail} onChange={e => setFromEmail(e.target.value)} type="email" placeholder="hello@congty.com" style={inp} /></div>
            </div>
            <div style={{ marginBottom: 8 }}><label style={lbl}>Tiêu đề</label><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Hợp tác cùng phát triển" style={inp} /></div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Nội dung — dùng {'{{email}}'} {'{{domain}}'} {'{{name}}'}</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder={'Chào {{name}},\n\nChúng tôi muốn hợp tác với {{domain}}...\n\nTrân trọng'} style={{ ...inp, minHeight: 120, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={() => { const s=emails.find(e=>e.status==='new'); setPreview(`Từ: ${fromName} <${fromEmail}>\nTiêu đề: ${subject}\n\n${body.replace(/\{\{email\}\}/g,s?.address||'ex@ex.com').replace(/\{\{domain\}\}/g,s?.domain||'ex.com').replace(/\{\{name\}\}/g,s?.contact_name||'Anh/Chị')}`) }}>👁 Xem trước</Btn>
              <Btn variant="primary" onClick={doSend} disabled={busy || unsentCount === 0}>{busy ? '⏳ Đang gửi...' : `✉️ Gửi ${unsentCount} email`}</Btn>
            </div>
            {preview && <pre style={{ marginTop: 10, fontSize: 12, fontFamily: 'inherit', whiteSpace: 'pre-wrap', background: 'var(--color-background-secondary)', padding: 12, borderRadius: 8, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>{preview}</pre>}
          </div>
          {sendLog.length > 0 && <div style={card}><ProgBar pct={sp} /><LogPane logs={sendLog} /></div>}
        </>}

      </div>
    </div>
  )
}

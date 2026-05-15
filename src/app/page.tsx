'use client'
import { useState, useEffect, useCallback } from 'react'

type Email = { id: string; address: string; source_url: string | null; domain: string | null; status: 'new' | 'sent' | 'failed'; contact_name?: string; position?: string; confidence?: number; source_type?: string; created_at: string }
type Site = { id: string; url: string; domain: string; last_crawled_at?: string; total_pages_crawled: number; total_emails_found: number }
type Log = { msg: string; t: 'info' | 'ok' | 'err' | 'dim' | 'warn' }

const D = {
  b0:'#0f172a', b1:'#1e293b', b2:'#273548', b3:'#334155', b4:'#475569',
  t1:'#f1f5f9', t2:'#94a3b8', t3:'#64748b',
  bd:'#334155', bd2:'#475569',
  blue:'#3b82f6', bdim:'#1e3a5f',
  green:'#22c55e', gdim:'#14532d',
  amber:'#f59e0b', adim:'#451a03',
  red:'#ef4444', rdim:'#450a0a',
  purple:'#a78bfa', pdim:'#2e1065',
  teal:'#2dd4bf', tdim:'#042f2e',
  cyan:'#06b6d4', cdim:'#083344',
}

const lc = (t: Log['t']) => ({info:D.blue,ok:D.green,err:D.red,dim:D.t3,warn:D.amber})[t]

const css = {
  app: { background:D.b0, minHeight:'100vh', color:D.t1, fontFamily:'system-ui,sans-serif', fontSize:13 },
  hdr: { background:D.b1, borderBottom:`1px solid ${D.bd}`, display:'flex', alignItems:'center', gap:10, padding:'0 18px', height:50 } as React.CSSProperties,
  nav: { background:D.b1, borderBottom:`1px solid ${D.bd}`, display:'flex', padding:'0 6px', overflowX:'auto' as const },
  body: { background:D.b0, padding:14 },
  card: (accent?:string) => ({ background: accent||D.b1, border:`1px solid ${D.bd}`, borderRadius:10, padding:'13px 15px', marginBottom:10 } as React.CSSProperties),
  stat: { background:D.b1, border:`1px solid ${D.bd}`, borderRadius:10, padding:'10px 12px' } as React.CSSProperties,
  inp: { width:'100%', padding:'7px 10px', border:`1px solid ${D.bd}`, borderRadius:8, fontSize:12, background:D.b2, color:D.t1, outline:'none', boxSizing:'border-box' as const },
  btn: (v?:string) => ({ padding: v==='xl'?'11px 18px':'7px 13px', borderRadius:8, cursor:'pointer', border:`1px solid ${D.bd}`, background: v==='p'?D.blue:v==='tg'?D.cdim:D.b2, color: v==='p'?'#fff':v==='tg'?D.cyan:D.t1, fontSize: v==='xl'?13:12, fontWeight: v==='p'||v==='xl'?500:400, borderColor: v==='p'?'transparent':v==='tg'?'#0e7490':D.bd, display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap' as const } as React.CSSProperties),
  prog: { height:3, background:D.b3, borderRadius:3, overflow:'hidden', marginBottom:8 } as React.CSSProperties,
  logBox: { background:'#060d1a', border:`1px solid ${D.bd}`, borderRadius:8, padding:'10px 12px', fontFamily:'monospace', fontSize:11, lineHeight:1.9, maxHeight:160, overflowY:'auto' as const },
  bdg: (bg:string,col:string) => ({ fontSize:10, padding:'2px 7px', borderRadius:20, fontWeight:500, background:bg, color:col, whiteSpace:'nowrap' as const, flexShrink:0 } as React.CSSProperties),
}

const SITES_PRESET = [
  {name:'BlockchainReporter',url:'https://blockchainreporter.net',icon:'⛓'},
  {name:'CaptainAltcoin',url:'https://captainaltcoin.com',icon:'⚓'},
  {name:'Coindoo',url:'https://coindoo.com',icon:'🪙'},
  {name:'AnalyticsInsight',url:'https://analyticsinsight.net',icon:'📊'},
  {name:'LiveBitcoinNews',url:'https://livebitcoinnews.com',icon:'₿'},
  {name:'ZyCrypto',url:'https://zycrypto.com',icon:'🔐'},
  {name:'MoneyCheck',url:'https://moneycheck.com',icon:'💰'},
  {name:'ThePortugalNews',url:'https://theportugalnews.com',icon:'🌊'},
  {name:'Optimisus',url:'https://optimisus.com',icon:'📈'},
  {name:'CoinGabbar',url:'https://www.coingabbar.com',icon:'🪙'},
  {name:'TimesTableid',url:'https://timestabloid.com',icon:'📰'},
  {name:'CryptoTimes',url:'https://www.cryptotimes.io',icon:'⏰'},
  {name:'TronWeekly',url:'https://www.tronweekly.com',icon:'⚡'},
  {name:'CryptoBrowser',url:'https://cryptobrowser.io',icon:'🌐'},
  {name:'GlobeNewswire',url:'https://www.globenewswire.com/en/search/keyword/crypto',icon:'🗞'},
  {name:'Crypto.news',url:'https://crypto.news/sponsored/',icon:'📡'},
  {name:'CryptoRank',url:'https://cryptorank.io/upcoming-ico',icon:'🏆'},
  {name:'CoinMarketCap',url:'https://coinmarketcap.com/new/',icon:'📉'},
  {name:'Crunchbase Crypto',url:'https://www.crunchbase.com/hub/cryptocurrency-companies',icon:'🔍'},
]

export default function Page() {
  const [tab, setTab] = useState<'dash'|'sites'|'hunter'|'list'|'send'|'tracking'|'telegram'>('dash')
  const [emails, setEmails] = useState<Email[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [fSt, setFSt] = useState('all')
  const [fSrc, setFSrc] = useState('all')
  const [search, setSearch] = useState('')
  const [findLog, setFindLog] = useState<Log[]>([])
  const [hunterLog, setHunterLog] = useState<Log[]>([])
  const [crawlLog, setCrawlLog] = useState<Log[]>([])
  const [sendLog, setSendLog] = useState<Log[]>([])
  const [fp, setFp] = useState(0)
  const [hp, setHp] = useState(0)
  const [cp, setCp] = useState(0)
  const [sp, setSp] = useState(0)
  const [urlInput, setUrlInput] = useState('')
  const [findMode, setFindMode] = useState('contact')
  const [manual, setManual] = useState('')
  const [hunterDoms, setHunterDoms] = useState('')
  const [hunterMode, setHunterMode] = useState('bod')
  const [newSiteUrl, setNewSiteUrl] = useState('')
  const [crawlingId, setCrawlingId] = useState<string|null>(null)
  const [fromName, setFromName] = useState('LEON (Mr.)')
  const [fromEmail, setFromEmail] = useState('leon@coincu.com')
  const [subject, setSubject] = useState('Boost {{project}} Visibility — Coincu PR & CMC Top News')
  const [body, setBody] = useState(`Hi {{project}},\n\nI came across your recent press release and wanted to reach out about amplifying {{project}} visibility further.\n\nAt Coincu, we offer:\n• Press Release Distribution\n• CoinMarketCap Top News Listing\n• Sponsored Articles\n• Organic Coverage\n\nWe have helped 200+ blockchain projects boost their reach.\n\nFeel free to drop me a message via Telegram: https://t.me/iamleonnn\n\nBest,\nLEON (Mr.)\nChief Business Development Officer — Coincu\nE: leon@coincu.com`)
  const [preview, setPreview] = useState('')
  const [tgToken, setTgToken] = useState('')
  const [tgChat, setTgChat] = useState('')
  const [tgStatus, setTgStatus] = useState<'idle'|'ok'|'err'>('idle')
  const [tgMsgs, setTgMsgs] = useState<{text:string,time:string}[]>([])
  const [openEvents, setOpenEvents] = useState<{email:string,project:string,time:string}[]>([])
  const [dups, setDups] = useState(0)
  const [skipped, setSkipped] = useState(0)

  const loadEmails = useCallback(async () => {
    const p = new URLSearchParams()
    if (fSt !== 'all') p.set('status', fSt)
    if (search) p.set('search', search)
    try {
      const r = await fetch(`/api/emails?${p}`)
      const d = await r.json()
      if (d.emails) setEmails(d.emails)
    } catch {}
  }, [fSt, search])

  const loadSites = useCallback(async () => {
    try {
      const r = await fetch('/api/crawl-site')
      const d = await r.json()
      if (d.sites) setSites(d.sites)
    } catch {}
  }, [])

  useEffect(() => { loadEmails() }, [loadEmails])
  useEffect(() => { if (tab === 'sites') loadSites() }, [tab, loadSites])

  const addLog = (set:any, msg:string, t:Log['t']='info') => set((p:Log[]) => [...p, {msg,t}])

  const unsentCount = emails.filter(e => e.status === 'new').length
  const sentCount = emails.filter(e => e.status === 'sent').length
  const bodCount = emails.filter(e => e.source_type === 'hunter_bod').length
  const openCount = openEvents.length

  async function doFind() {
    const urls = urlInput.split('\n').map(u=>u.trim()).filter(Boolean)
    if (!urls.length) return alert('Nhập ít nhất 1 URL')
    setFindLog([]); setFp(0); setBusy(true)
    addLog(setFindLog, `▶ Quét ${urls.length} URL...`, 'info')
    try {
      const r = await fetch('/api/find-emails', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({urls,mode:findMode})})
      const d = await r.json()
      for (let i=0;i<(d.results||[]).length;i++) {
        const x=d.results[i]; setFp(Math.round((i+1)/d.results.length*100))
        if (x.error) addLog(setFindLog,`✗ ${x.domain}: ${x.error}`,'err')
        else { addLog(setFindLog,`✓ ${x.domain} — ${x.added} mới · ${x.found-x.added} trùng`,'ok'); x.emails?.forEach((e:any)=>addLog(setFindLog,`  → ${e.addr}`,'ok')) }
      }
    } catch (e:any) { addLog(setFindLog, `✗ ${e.message}`, 'err') }
    addLog(setFindLog,'─── xong ───','dim'); setBusy(false); loadEmails()
  }

  async function doManual() {
    if (!manual.trim()) return
    const [addr,src] = manual.split(',').map(s=>s.trim())
    try {
      const r = await fetch('/api/emails',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:addr,source_url:src||null})})
      const d = await r.json()
      if (d.error) return alert(d.error)
      setManual(''); addLog(setFindLog,`✓ Thêm: ${addr}`,'ok'); loadEmails()
    } catch {}
  }

  async function doHunter() {
    const domains = hunterDoms.split('\n').map(d=>d.trim()).filter(Boolean)
    if (!domains.length) return alert('Nhập ít nhất 1 domain')
    setHunterLog([]); setHp(0); setBusy(true)
    addLog(setHunterLog,`▶ Hunter.io — ${hunterMode==='bod'?'Chỉ BOD':'Tất cả'} từ ${domains.length} domain...`,'info')
    try {
      const r = await fetch('/api/hunter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domains,mode:hunterMode})})
      const d = await r.json()
      for (let i=0;i<(d.results||[]).length;i++) {
        const x=d.results[i]; setHp(Math.round((i+1)/d.results.length*100))
        if (x.error) { addLog(setHunterLog,`✗ ${x.domain}: ${x.error}`,'err'); continue }
        addLog(setHunterLog,`✓ ${x.domain} — ${x.added} mới · ${x.skipped} trùng`,x.added>0?'ok':'dim')
        x.emails?.forEach((e:any)=>addLog(setHunterLog,`  → ${e.addr} | ${e.name||'?'} | ${e.position||'?'}${e.isBOD?' 👑':''} (${e.confidence}%)`,'ok'))
      }
    } catch (e:any) { addLog(setHunterLog,`✗ ${e.message}`,'err') }
    addLog(setHunterLog,'─── xong ───','dim'); setBusy(false); loadEmails()
  }

  async function crawlSite(site:Site) {
    setCrawlingId(site.id); setCrawlLog([]); setCp(0)
    addLog(setCrawlLog,`▶ Quét bài mới từ ${site.domain}...`,'info')
    try {
      const r = await fetch('/api/crawl-site',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({siteUrl:site.url,maxPages:8})})
      const d = await r.json()
      if (d.error) { addLog(setCrawlLog,`✗ ${d.error}`,'err'); setCrawlingId(null); return }
      for (let i=0;i<(d.results||[]).length;i++) {
        const x=d.results[i]; setCp(Math.round((i+1)/d.results.length*100))
        addLog(setCrawlLog,`📄 ${x.title||x.url}`,'info')
        x.newEmails?.forEach((e:string)=>addLog(setCrawlLog,`  ✓ ${e}`,'ok'))
        if (x.skipped>0) addLog(setCrawlLog,`  ~ ${x.skipped} trùng`,'warn')
      }
      addLog(setCrawlLog,`─── ${d.pagesScanned} trang · ${d.newEmails} email mới ───`,'ok')
    } catch (e:any) { addLog(setCrawlLog,`✗ ${e.message}`,'err') }
    setCrawlingId(null); loadSites(); loadEmails()
  }

  async function doSend() {
    if (!fromName||!fromEmail||!subject||!body) return alert('Điền đầy đủ')
    if (!confirm(`Gửi đến ${unsentCount} email?`)) return
    setSendLog([]); setSp(0); setBusy(true)
    try {
      const r = await fetch('/api/send-emails',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fromName,fromEmail,subject,body})})
      const d = await r.json()
      ;(d.results||[]).forEach((x:any,i:number)=>{
        setSp(Math.round((i+1)/d.results.length*100))
        addLog(setSendLog,x.status==='success'?`✓ ${x.address}`:`✗ ${x.address}: ${x.error}`,x.status==='success'?'ok':'err')
      })
      addLog(setSendLog,`─── ${d.sent} thành công / ${d.failed} thất bại ───`,'ok')
    } catch (e:any) { addLog(setSendLog,`✗ ${e.message}`,'err') }
    setBusy(false); loadEmails()
  }

  async function testTelegram() {
    if (!tgToken||!tgChat) return alert('Nhập Bot Token và Chat ID')
    try {
      const r = await fetch('/api/telegram')
      const d = await r.json()
      setTgStatus(d.ok?'ok':'err')
      if (d.ok) { setTgMsgs(p=>[{text:`✅ Kết nối thành công! Bot: @${d.bot}`,time:new Date().toLocaleTimeString('vi-VN')},...p]) }
    } catch { setTgStatus('err') }
  }

  async function addSiteAndCrawl() {
    if (!newSiteUrl.trim()) return
    const domain = newSiteUrl.replace(/https?:\/\//,'').split('/')[0].replace('www.','')
    if (sites.find(s=>s.domain===domain)) return alert('Site đã tồn tại')
    try {
      await fetch('/api/crawl-site',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({siteUrl:newSiteUrl.trim(),maxPages:1})})
      setNewSiteUrl(''); loadSites()
    } catch {}
  }

  const filtered = emails.filter(e=>{ const mq=!search||e.address.includes(search)||(e.domain||'').includes(search); const ms=fSt==='all'||e.status===fSt; const mr=fSrc==='all'||e.source_type===fSrc; return mq&&ms&&mr })

  const TABS = [['dash','🏠 Dashboard'],['sites','🕷 Bài viết'],['hunter','🎯 Hunter BOD'],['list','📋 Danh sách'],['send','✉️ Gửi'],['tracking','👁 Tracking'],['telegram','📱 Telegram']] as const

  const SectionCard = ({children, accent}:{children:React.ReactNode,accent?:string}) => (
    <div style={css.card(accent)}>{children}</div>
  )

  const StatGrid = ({items}:{items:[string,number|string,string?][]}) => (
    <div style={{display:'grid',gridTemplateColumns:`repeat(${items.length},1fr)`,gap:8,marginBottom:10}}>
      {items.map(([l,v,c])=>(
        <div key={l as string} style={css.stat}>
          <div style={{fontSize:10,color:D.t3,marginBottom:3}}>{l}</div>
          <div style={{fontSize:22,fontWeight:500,color:c||D.t1}}>{v}</div>
        </div>
      ))}
    </div>
  )

  const LogPane = ({logs,pct}:{logs:Log[],pct:number}) => (
    <div style={css.card()}>
      <div style={{...css.prog}}><div style={{height:'100%',width:`${pct}%`,background:D.blue,borderRadius:3,transition:'width .3s'}}/></div>
      <div style={css.logBox}>{logs.map((l,i)=><div key={i} style={{color:lc(l.t)}}>{l.msg}</div>)}</div>
    </div>
  )

  const srcLabel = (t?:string) => ({hunter_bod:'BOD 👑',hunter:'Hunter',article:'Bài viết',crunchbase:'Crunchbase',manual:'Thủ công'})[t||'']||'Thủ công'
  const srcBg = (t?:string):React.CSSProperties => {
    const m:any={hunter_bod:[D.adim,D.amber],hunter:[D.pdim,D.purple],article:[D.bdim,D.blue],crunchbase:[D.rdim,D.red],manual:[D.b3,D.t2]}
    const[bg,col]=m[t||'manual']||m.manual; return css.bdg(bg,col)
  }
  const stBg = (s:string):React.CSSProperties => {
    if(s==='sent') return css.bdg(D.gdim,D.green)
    if(s==='failed') return css.bdg(D.rdim,D.red)
    return css.bdg(D.adim,D.amber)
  }

  return (
    <div style={css.app}>
      {/* HEADER */}
      <div style={css.hdr}>
        <span style={{fontSize:18}}>₿</span>
        <span style={{fontWeight:500,fontSize:15}}>Crypto Email Finder</span>
        <span style={{fontSize:10,background:D.b3,color:D.t2,padding:'2px 8px',borderRadius:20}}>19 sites · crypto only</span>
        <span style={{fontSize:10,background:D.gdim,color:D.green,padding:'2px 8px',borderRadius:20,border:`1px solid ${D.gdim}`}}>Tracking ON</span>
        <div style={{marginLeft:'auto',display:'flex',gap:16}}>
          {([['Email',emails.length,D.t1],['Chưa gửi',unsentCount,D.amber],['Đã gửi',sentCount,D.green],['BOD',bodCount,D.purple],['Opened',openCount,D.cyan]] as [string,number,string][]).map(([l,v,c])=>(
            <div key={l} style={{textAlign:'center'}}>
              <div style={{fontSize:15,fontWeight:500,color:c,lineHeight:1}}>{v}</div>
              <div style={{fontSize:10,color:D.t3,marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* NAV */}
      <div style={css.nav}>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:'10px 13px',border:'none',background:'none',cursor:'pointer',fontSize:12,fontWeight:tab===k?500:400,color:tab===k?D.t1:D.t2,borderBottom:`2px solid ${tab===k?D.blue:'transparent'}`,marginBottom:-1,whiteSpace:'nowrap' as const,transition:'all .15s'}}>{l}</button>
        ))}
      </div>

      {/* BODY */}
      <div style={css.body}>

        {/* DASHBOARD */}
        {tab==='dash' && <>
          <SectionCard accent='#130c00'>
            <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:5}}>
              <span style={{color:D.amber,fontSize:13}}>⚠</span>
              <span style={{fontWeight:500,color:D.amber,fontSize:13}}>Bộ lọc Crypto Only đang bật</span>
            </div>
            <p style={{fontSize:11,color:'#a06010',lineHeight:1.6}}>Chỉ lấy email từ dự án: blockchain, crypto, DeFi, NFT, Web3, token, coin, exchange, wallet. Dự án không liên quan bị bỏ qua tự động.</p>
          </SectionCard>
          <SectionCard>
            <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>Quét 19 crypto sites</div>
            <div style={{fontSize:11,color:D.t3,marginBottom:12}}>Nhấn 1 nút — tự quét, lọc crypto, bỏ trùng, gửi Telegram khi xong</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button style={css.btn('xl')} onClick={()=>setTab('sites')}>🕷 Quét tất cả sites</button>
              <button style={css.btn('p')} onClick={()=>setTab('hunter')}>🎯 Hunter BOD</button>
              <button style={css.btn('tg')} onClick={()=>setTab('telegram')}>📱 Telegram</button>
            </div>
          </SectionCard>
          <StatGrid items={[['Tổng email',emails.length],['Chưa gửi',unsentCount,D.amber],['Đã gửi',sentCount,D.green],['BOD Hunter',bodCount,D.purple]]}/>
          <StatGrid items={[['Sites theo dõi',sites.length||19],['Tracking opened',openCount,D.cyan],['Non-crypto lọc',skipped,D.red],['Trùng chặn',dups,D.amber]]}/>
        </>}

        {/* SITES */}
        {tab==='sites' && <>
          <SectionCard>
            <label style={{fontSize:11,color:D.t2,display:'block',marginBottom:4}}>Thêm site đối thủ mới</label>
            <div style={{display:'flex',gap:8}}>
              <input value={newSiteUrl} onChange={e=>setNewSiteUrl(e.target.value)} placeholder="https://newcryptosite.com/press-release/" style={{...css.inp,flex:1}} onKeyDown={e=>e.key==='Enter'&&addSiteAndCrawl()} />
              <button style={css.btn('p')} onClick={addSiteAndCrawl}>+ Thêm</button>
            </div>
          </SectionCard>
          {SITES_PRESET.map((preset,i)=>{
            const site = sites.find(s=>s.domain===preset.url.replace(/https?:\/\//,'').split('/')[0].replace('www.',''))
            const running = crawlingId === site?.id
            return (
              <div key={i} style={{...css.card(), display:'flex', alignItems:'center', gap:10, borderColor:running?D.blue:D.bd, background:running?'#0a1525':D.b1}}>
                <div style={{width:28,height:28,borderRadius:8,background:D.b3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>{preset.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:500,fontSize:12,marginBottom:2}}>{preset.name}</div>
                  <div style={{fontSize:10,color:D.t3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{preset.url}</div>
                  {site && <div style={{display:'flex',gap:12,marginTop:4}}>
                    {[['Quét',site.total_pages_crawled+' trang'],['Email',site.total_emails_found+''],['Cuối',site.last_crawled_at?new Date(site.last_crawled_at).toLocaleDateString('vi'):'—']].map(([l,v])=>(
                      <div key={l} style={{fontSize:10}}><span style={{color:D.t3}}>{l} </span><span style={{fontWeight:500}}>{v}</span></div>
                    ))}
                  </div>}
                </div>
                {site ? (
                  <button style={css.btn('p')} onClick={()=>crawlSite(site)} disabled={running||busy}>
                    {running?'⏳ Quét...':'🔄 Quét mới'}
                  </button>
                ) : (
                  <span style={{fontSize:10,color:D.t3}}>Chưa add</span>
                )}
              </div>
            )
          })}
          {crawlLog.length>0 && <LogPane logs={crawlLog} pct={cp}/>}
        </>}

        {/* HUNTER */}
        {tab==='hunter' && <>
          <SectionCard accent='#0a1525'>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <span style={{fontWeight:500,fontSize:13}}>Hunter.io Domain Search</span>
              <span style={{...css.bdg(D.pdim,D.purple)}}>API Key ✓</span>
            </div>
            <p style={{fontSize:11,color:'#6060b0',marginBottom:10,lineHeight:1.6}}>Tìm email BOD (CEO, CFO, CMO, CTO, Founder) kèm tên thật + chức danh + % tin cậy. Mỗi dòng 1 domain.</p>
            <textarea value={hunterDoms} onChange={e=>setHunterDoms(e.target.value)} placeholder={'blockchainreporter.net\ncaptainaltcoin.com\ncoindoo.com'} style={{...css.inp,minHeight:90,resize:'vertical',marginBottom:8}}/>
            <div style={{display:'flex',gap:8}}>
              <select value={hunterMode} onChange={e=>setHunterMode(e.target.value)} style={{...css.inp,flex:1}}>
                <option value="bod">Chỉ BOD — CEO, CFO, CMO, CTO, Founder, Director</option>
                <option value="all">Tất cả email</option>
              </select>
              <button style={css.btn('p')} onClick={doHunter} disabled={busy}>🎯 Tìm ngay</button>
            </div>
          </SectionCard>
          {hunterLog.length>0 && <LogPane logs={hunterLog} pct={hp}/>}
        </>}

        {/* LIST */}
        {tab==='list' && <>
          <StatGrid items={[['Tổng',emails.length],['Chưa gửi',unsentCount,D.amber],['Đã gửi',sentCount,D.green],['BOD 👑',bodCount,D.purple]]}/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}}>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm email..." style={{...css.inp,width:150}}/>
              <select value={fSt} onChange={e=>setFSt(e.target.value)} style={{...css.inp,width:105}}>
                <option value="all">Tất cả</option><option value="new">Chưa gửi</option><option value="sent">Đã gửi</option><option value="failed">Lỗi</option>
              </select>
              <select value={fSrc} onChange={e=>setFSrc(e.target.value)} style={{...css.inp,width:120}}>
                <option value="all">Mọi nguồn</option><option value="hunter_bod">BOD 👑</option><option value="hunter">Hunter</option><option value="article">Bài viết</option><option value="manual">Thủ công</option>
              </select>
            </div>
            <div style={{display:'flex',gap:6}}>
              <button style={css.btn()} onClick={()=>setSel(sel.size===emails.length?new Set():new Set(emails.map(e=>e.id)))}>Chọn tất</button>
              <button style={{...css.btn(),color:D.red,borderColor:D.rdim}} onClick={async()=>{if(!sel.size)return;if(!confirm(`Xoá ${sel.size}?`))return;await fetch('/api/emails',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[...sel]})});setSel(new Set());loadEmails()}}>🗑 Xoá</button>
              <button style={css.btn()} onClick={()=>{const rows=['email,domain,source,name,position,status',...emails.map(e=>`"${e.address}","${e.domain||''}","${e.source_type||''}","${e.contact_name||''}","${e.position||''}","${e.status}"`)];const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'}));a.download='emails.csv';a.click()}}>⬇ CSV</button>
            </div>
          </div>
          <div style={{background:D.b1,border:`1px solid ${D.bd}`,borderRadius:10,overflow:'hidden'}}>
            {filtered.length===0
              ? <div style={{padding:28,textAlign:'center',color:D.t3,fontSize:12}}>Không có email</div>
              : filtered.map(e=>(
                <div key={e.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderBottom:`1px solid ${D.bd}`,fontSize:12,background:e.status==='sent'?'#060f05':D.b1}}>
                  <input type="checkbox" checked={sel.has(e.id)} onChange={ev=>{const s=new Set(sel);ev.target.checked?s.add(e.id):s.delete(e.id);setSel(s)}}/>
                  <span style={{flex:1,fontFamily:'monospace',fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:D.t1}}>{e.address}</span>
                  {e.contact_name&&<span style={{fontSize:10,color:D.t2,whiteSpace:'nowrap'}}>{e.contact_name}</span>}
                  {e.position&&<span style={{fontSize:10,color:D.t3,maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.position}</span>}
                  <span style={srcBg(e.source_type)}>{srcLabel(e.source_type)}</span>
                  <span style={stBg(e.status)}>{e.status==='sent'?'✓ Đã gửi':e.status==='failed'?'Lỗi':'Mới'}</span>
                </div>
              ))
            }
          </div>
        </>}

        {/* SEND */}
        {tab==='send' && <>
          <div style={{...css.card(),background:D.b2,border:'none',fontSize:12,marginBottom:10}}>
            <strong style={{color:D.t1}}>{unsentCount}</strong><span style={{color:D.t2}}> email chưa gửi · </span>
            <strong style={{color:D.t1}}>{sentCount}</strong><span style={{color:D.green}}> đã gửi sẽ tự bỏ qua</span>
          </div>
          <SectionCard>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
              <div><label style={{fontSize:11,color:D.t2,display:'block',marginBottom:4}}>Tên người gửi</label><input value={fromName} onChange={e=>setFromName(e.target.value)} placeholder="LEON (Mr.)" style={css.inp}/></div>
              <div><label style={{fontSize:11,color:D.t2,display:'block',marginBottom:4}}>Email người gửi</label><input value={fromEmail} onChange={e=>setFromEmail(e.target.value)} type="email" style={css.inp}/></div>
            </div>
            <div style={{marginBottom:8}}><label style={{fontSize:11,color:D.t2,display:'block',marginBottom:4}}>Subject — dùng {'{{project}}'}</label><input value={subject} onChange={e=>setSubject(e.target.value)} style={css.inp}/></div>
            <div style={{marginBottom:12}}><label style={{fontSize:11,color:D.t2,display:'block',marginBottom:4}}>Nội dung — {'{{email}}'} {'{{domain}}'} {'{{name}}'} {'{{project}}'}</label>
              <textarea value={body} onChange={e=>setBody(e.target.value)} style={{...css.inp,minHeight:150,resize:'vertical'}}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button style={css.btn()} onClick={()=>{const s=emails.find(e=>e.status==='new');setPreview(`Từ: ${fromName} <${fromEmail}>\nSubject: ${subject.replace(/\{\{project\}\}/g,s?.contact_name||'Project')}\n\n${body.replace(/\{\{email\}\}/g,s?.address||'').replace(/\{\{domain\}\}/g,s?.domain||'').replace(/\{\{name\}\}/g,s?.contact_name||'Team').replace(/\{\{project\}\}/g,s?.contact_name||'Project')}`)}}>👁 Xem trước</button>
              <button style={css.btn('p')} onClick={doSend} disabled={busy||unsentCount===0}>{busy?'⏳ Đang gửi...':`✉️ Gửi ${unsentCount} email`}</button>
            </div>
            {preview&&<pre style={{marginTop:10,fontSize:11,fontFamily:'monospace',whiteSpace:'pre-wrap',background:D.b2,padding:12,borderRadius:8,color:D.t2,lineHeight:1.7}}>{preview}</pre>}
          </SectionCard>
          {sendLog.length>0&&<LogPane logs={sendLog} pct={sp}/>}
        </>}

        {/* TRACKING */}
        {tab==='tracking' && <>
          <SectionCard accent={D.cdim}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
              <span style={{color:D.cyan,fontSize:15}}>👁</span>
              <span style={{fontWeight:500,color:D.cyan,fontSize:13}}>Email open tracking — pixel 1×1</span>
              <span style={{...css.bdg(D.cdim,D.cyan)}}>Live</span>
            </div>
            <p style={{fontSize:11,color:'#3a8a9a',lineHeight:1.6}}>Mỗi email gửi ra tự nhúng pixel tracking ẩn. Khi contact mở → ghi Supabase + ping Telegram ngay trong vòng vài giây.</p>
            <code style={{display:'block',marginTop:8,background:'#020d14',border:`1px solid ${D.cdim}`,borderRadius:6,padding:'6px 10px',fontSize:11,color:D.t2}}>
              {`<img src="/api/track-open?id={{email_id}}" width="1" height="1" style="display:none" />`}
            </code>
          </SectionCard>
          <StatGrid items={[['Đã mở email',openCount,D.cyan],['Open rate',emails.length>0?`${Math.round(openCount/emails.length*100)}%`:'0%',D.green],['Chưa mở',Math.max(0,sentCount-openCount),D.t3]]}/>
          <div style={{background:D.b1,border:`1px solid ${D.bd}`,borderRadius:10,overflow:'hidden'}}>
            {openEvents.length===0
              ? <div style={{padding:28,textAlign:'center',color:D.t3,fontSize:12}}>👁 Chưa có tracking event nào — events sẽ hiện ở đây khi contact mở email</div>
              : openEvents.map((ev,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',borderBottom:`1px solid ${D.bd}`,fontSize:12}}>
                  <span style={{fontSize:16}}>👁</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500}}>{ev.project}</div>
                    <div style={{fontSize:10,color:D.t3,fontFamily:'monospace'}}>{ev.email}</div>
                  </div>
                  <span style={{...css.bdg(D.gdim,D.green)}}>Opened</span>
                  <span style={{fontSize:10,color:D.t3}}>{ev.time}</span>
                </div>
              ))
            }
          </div>
        </>}

        {/* TELEGRAM */}
        {tab==='telegram' && <>
          <SectionCard accent={D.cdim}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
              <span style={{color:D.cyan,fontSize:15}}>📱</span>
              <span style={{fontWeight:500,color:D.cyan,fontSize:13}}>Telegram bot notifications</span>
              <span style={{...css.bdg(tgStatus==='ok'?D.gdim:tgStatus==='err'?D.rdim:D.adim,tgStatus==='ok'?D.green:tgStatus==='err'?D.red:D.amber)}}>{tgStatus==='ok'?'Đã kết nối':tgStatus==='err'?'Lỗi':'Chưa cấu hình'}</span>
            </div>
            <p style={{fontSize:11,color:'#3a8a9a',lineHeight:1.6,marginBottom:10}}>Tự động ping khi: contact mở email, có reply, gửi xong batch, auto-remind xong.</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
              <div><label style={{fontSize:11,color:D.t2,display:'block',marginBottom:4}}>Bot Token</label><input value={tgToken} onChange={e=>setTgToken(e.target.value)} placeholder="110201543:AAHdqTcvCH1..." type="password" style={css.inp}/></div>
              <div><label style={{fontSize:11,color:D.t2,display:'block',marginBottom:4}}>Chat ID</label><input value={tgChat} onChange={e=>setTgChat(e.target.value)} placeholder="123456789" style={css.inp}/></div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button style={css.btn('tg')} onClick={testTelegram}>🔌 Test kết nối</button>
              <button style={css.btn('p')} onClick={()=>alert('Thêm TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID vào Vercel Environment Variables')}>💾 Lưu vào Vercel</button>
            </div>
          </SectionCard>
          <div style={{marginBottom:8,fontSize:11,fontWeight:500,color:D.t2,textTransform:'uppercase',letterSpacing:'.06em'}}>Lịch sử notifications</div>
          <div style={{background:'#020d10',border:`1px solid ${D.cdim}`,borderRadius:10,padding:12,minHeight:80}}>
            {tgMsgs.length===0
              ? <div style={{textAlign:'center',padding:20,color:D.t3,fontSize:12}}>📱 Chưa có notification nào — test kết nối để bắt đầu</div>
              : tgMsgs.map((m,i)=>(
                <div key={i} style={{display:'flex',gap:8,marginBottom:10,alignItems:'flex-start'}}>
                  <div style={{width:28,height:28,borderRadius:'50%',background:D.cdim,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>🤖</div>
                  <div>
                    <div style={{background:D.b2,borderRadius:'0 8px 8px 8px',padding:'8px 10px',fontSize:12,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{m.text}</div>
                    <div style={{fontSize:10,color:D.t3,marginTop:3}}>{m.time}</div>
                  </div>
                </div>
              ))
            }
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
            {[['👁 Email opened','Ping ngay khi contact mở email'],['💬 Contact replied','Ping khi có reply + nội dung'],['✉️ Batch sent','Summary sau khi gửi xong'],['⏰ Auto-remind','Summary cron 8h sáng hàng ngày']].map(([t,d])=>(
              <div key={t as string} style={css.card()}>
                <div style={{fontWeight:500,marginBottom:3,fontSize:12}}>{t}</div>
                <div style={{fontSize:11,color:D.t3}}>{d}</div>
              </div>
            ))}
          </div>
        </>}

        {/* FIND URL (hidden but keep for URL scraping) */}
        {tab==='dash' && false && <>
          <SectionCard>
            <textarea value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder={'https://company.vn\nhttps://startup.io'} style={{...css.inp,minHeight:90,resize:'vertical',marginBottom:8}}/>
            <div style={{display:'flex',gap:8}}>
              <select value={findMode} onChange={e=>setFindMode(e.target.value)} style={{...css.inp,flex:1}}>
                <option value="contact">Contact / About</option>
                <option value="pr">Press Release</option>
              </select>
              <button style={css.btn('p')} onClick={doFind} disabled={busy}>🔍 Tìm</button>
            </div>
          </SectionCard>
          {findLog.length>0&&<LogPane logs={findLog} pct={fp}/>}
          <div style={{...css.card(),background:D.b2}}>
            <div style={{display:'flex',gap:8}}>
              <input value={manual} onChange={e=>setManual(e.target.value)} placeholder="email@domain.com, nguon.com" style={{...css.inp,flex:1}} onKeyDown={e=>e.key==='Enter'&&doManual()}/>
              <button style={css.btn()} onClick={doManual}>+ Thêm</button>
            </div>
          </div>
        </>}

      </div>
    </div>
  )
}

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const APP_URL = 'https://my-finder-email-v2bh.vercel.app'

export async function POST() {
  const { data: sites } = await supabase.from('competitor_sites').select('id, url, domain')
  if (!sites) return NextResponse.json({ error: 'No sites' }, { status: 500 })

  const results: any[] = []
  let totalSaved = 0

  for (const site of sites) {
    try {
      // Get RSS URLs
      const urlsRes = await fetch(`${APP_URL}/api/crawl-site?action=urls&siteUrl=${encodeURIComponent(site.url)}`)
      const urlsData = await urlsRes.json()
      const urls: string[] = urlsData.urls || []
      const preloaded = urlsData.preloadedEmails || {}

      if (!urls.length) { results.push({ domain: site.domain, saved: 0, urls: 0 }); continue }

      let siteSaved = 0
      // Crawl each article
      for (const url of urls.slice(0, 10)) {
        try {
          const r = await fetch(`${APP_URL}/api/crawl-site`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              articleUrl: url, siteUrl: site.url,
              siteId: site.id, preloadedEmails: preloaded, dryRun: false
            })
          })
          const d = await r.json()
          siteSaved += d.saved || 0
        } catch {}
      }

      totalSaved += siteSaved
      results.push({ domain: site.domain, saved: siteSaved, urls: urls.length })
    } catch (e: any) {
      results.push({ domain: site.domain, saved: 0, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, totalSaved, results })
}

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// We should use relative URLs for internal API calls on the server
// But Next.js fetch requires absolute URLs. We can use a generic host or reconstruct it.
// Actually, it's better to extract the logic instead of fetching itself, but for now we keep the same logic.
const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://my-finder-email-v2bh.vercel.app' // They should set this in Railway

export async function POST(req: Request) {
  try {
    const host = req.headers.get('host')
    const protocol = req.headers.get('x-forwarded-proto') || 'https'
    const baseUrl = `${protocol}://${host}`

    const { rows: sites } = await db.query('SELECT id, url, domain FROM competitor_sites')
    if (!sites || sites.length === 0) return NextResponse.json({ error: 'No sites' }, { status: 404 })

    const results: any[] = []
    let totalSaved = 0

    for (const site of sites) {
      try {
        // Get RSS URLs
        const urlsRes = await fetch(`${baseUrl}/api/crawl-site?action=urls&siteUrl=${encodeURIComponent(site.url)}`)
        const urlsData = await urlsRes.json()
        const urls: string[] = urlsData.urls || []
        const preloaded = urlsData.preloadedEmails || {}

        if (!urls.length) { results.push({ domain: site.domain, saved: 0, urls: 0 }); continue }

        let siteSaved = 0
        // Crawl each article
        for (const url of urls.slice(0, 10)) {
          try {
            const r = await fetch(`${baseUrl}/api/crawl-site`, {
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

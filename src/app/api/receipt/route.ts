import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    try {
      await db.query(
        'UPDATE emails SET opened_at = CURRENT_TIMESTAMP, open_count = COALESCE(open_count, 0) + 1 WHERE id = $1',
        [id]
      )
    } catch (e) {
      // ignore silently
    }
  }
  // Return 1x1 transparent pixel
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  return new NextResponse(pixel, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } })
}

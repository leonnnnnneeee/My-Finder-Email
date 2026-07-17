import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const { data } = await supabase.from('emails').select('open_count').eq('id', id).single()
    await supabase.from('emails').update({ 
      opened_at: new Date().toISOString(),
      open_count: (data?.open_count || 0) + 1
    }).eq('id', id)
  }
  // Return 1x1 transparent pixel
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  return new NextResponse(pixel, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } })
}

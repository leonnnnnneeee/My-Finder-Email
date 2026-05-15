import { createClient } from '@supabase/supabase-js'

export const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const supabase = {
  from: (table: string) => getSupabase().from(table)
}

export type Email = {
  id: string
  address: string
  source_url: string | null
  domain: string | null
  status: 'new' | 'sent' | 'failed'
  sent_at: string | null
  created_at: string
}

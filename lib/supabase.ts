import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function makeClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// Singleton por processo (server-side only)
let _client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (!_client) _client = makeClient()
  return _client
}

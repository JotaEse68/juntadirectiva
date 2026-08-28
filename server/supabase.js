import { createClient } from '@supabase/supabase-js'

let cachedClient
let cachedPublicClient

export function supabaseAdmin() {
  if (cachedClient) return cachedClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase no configurado')
  cachedClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return cachedClient
}

export function supabasePublic() {
  if (cachedPublicClient) return cachedPublicClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const publishableKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) throw new Error('Supabase público no configurado')
  cachedPublicClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return cachedPublicClient
}

export function bearerToken(req) {
  const header = req.headers.get('authorization') || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

export async function requireUser(req) {
  const token = bearerToken(req)
  if (!token) return { user: null, error: 'AUTH_REQUIRED' }
  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token)
    if (error || !data.user) return { user: null, error: 'AUTH_INVALID' }
    return { user: data.user, token }
  } catch (error) {
    console.error('Supabase auth error:', error)
    return { user: null, error: 'AUTH_UNAVAILABLE' }
  }
}

export async function callRpc(name, params) {
  const { data, error } = await supabaseAdmin().rpc(name, params)
  if (error) throw new Error(`${name}: ${error.message}`)
  return Array.isArray(data) ? data[0] : data
}

export async function getAccount(userId) {
  await callRpc('refund_stale_report_reservations', { p_user_id: userId })
  const client = supabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)
  const [{ data: profile, error: profileError }, { data: reports, error: reportsError }, { data: usage, error: usageError }] = await Promise.all([
    client.from('profiles').select('report_credits, extra_analysis_credits, premium_access, marketing_consent').eq('user_id', userId).single(),
    client.from('reports').select('id, situation, verdict, report_text, quick_takes, language, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    client.from('daily_usage').select('used').eq('usage_date', today).eq('scope_type', 'user').eq('scope_key', userId).maybeSingle(),
  ])
  if (profileError) throw new Error(`account profile: ${profileError.message}`)
  if (reportsError) throw new Error(`account reports: ${reportsError.message}`)
  if (usageError) throw new Error(`account usage: ${usageError.message}`)
  return { profile: { ...profile, free_remaining: Math.max(0, 2 - (usage?.used || 0)) }, reports: reports || [] }
}

export function authErrorResponse(code, headers = {}) {
  const unavailable = code === 'AUTH_UNAVAILABLE'
  return new Response(JSON.stringify({
    error: unavailable ? 'El acceso no está disponible. Inténtalo de nuevo en unos minutos.' : 'Inicia sesión con tu correo para continuar.',
    code,
  }), {
    status: unavailable ? 503 : 401,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

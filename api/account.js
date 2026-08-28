export const config = { runtime: 'edge' }

import { deviceIdentity } from '../server/deviceIdentity.js'
import { authErrorResponse, getAccount, requireUser, supabaseAdmin } from '../server/supabase.js'

function cors(origin = '') {
  const configured = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '')
    .split(',').map(value => value.trim()).filter(Boolean)
  const allowed = configured.length ? configured : ['https://juntadirectiva.iapacks.com', 'https://juntadirectiva.vercel.app']
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  }
}

function json(data, status, headers, setCookie) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(setCookie ? { 'Set-Cookie': setCookie } : {}) },
  })
}

export default async function handler(req) {
  const c = cors(req.headers.get('origin') || '')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c })
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Método no permitido' }, 405, c)

  const auth = await requireUser(req)
  if (!auth.user) return authErrorResponse(auth.error, c)

  try {
    if (req.method === 'GET') {
      const [account, device] = await Promise.all([getAccount(auth.user.id), deviceIdentity(req)])
      return json({ email: auth.user.email, ...account }, 200, c, device.setCookie)
    }

    const body = await req.json()
    if (body.action === 'marketing-consent') {
      const { error } = await supabaseAdmin().from('profiles').update({ marketing_consent: Boolean(body.consent), updated_at: new Date().toISOString() }).eq('user_id', auth.user.id)
      if (error) throw error
      return json({ updated: true }, 200, c)
    }

    if (body.action === 'save-report') {
      const reservationId = String(body.reservationId || '')
      const situation = String(body.situation || '').slice(0, 12000)
      const verdict = String(body.verdict || '').slice(0, 12000)
      const reportText = String(body.reportText || '').slice(0, 60000)
      if (!reservationId || !situation || !reportText) return json({ error: 'Informe incompleto' }, 400, c)

      const client = supabaseAdmin()
      const { data: reservation, error: reservationError } = await client.from('report_reservations')
        .select('id, status').eq('id', reservationId).eq('user_id', auth.user.id).single()
      if (reservationError || reservation?.status !== 'completed') return json({ error: 'Reserva de informe no válida' }, 409, c)

      const record = {
        reservation_id: reservationId,
        user_id: auth.user.id,
        situation,
        verdict,
        report_text: reportText,
        quick_takes: Array.isArray(body.quickTakes) ? body.quickTakes.slice(0, 12) : [],
        language: body.language === 'en' ? 'en' : 'es',
      }
      const { data, error } = await client.from('reports').upsert(record, { onConflict: 'reservation_id' }).select().single()
      if (error) throw error
      return json({ saved: true, report: data }, 200, c)
    }

    return json({ error: 'Acción no soportada' }, 400, c)
  } catch (error) {
    console.error('account API error:', error)
    return json({ error: 'No se pudo actualizar tu cuenta.' }, 500, c)
  }
}

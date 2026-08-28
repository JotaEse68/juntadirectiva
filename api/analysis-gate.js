export const config = { runtime: 'edge' }

import { issueAnalysisTicket } from '../server/analysisTicket.js'
import { abuseHash, deviceIdentity } from '../server/deviceIdentity.js'
import { authErrorResponse, callRpc, requireUser } from '../server/supabase.js'

function cors(origin = '') {
  const configured = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '')
    .split(',').map(value => value.trim()).filter(Boolean)
  const allowedOrigins = configured.length ? configured : [
    'https://juntadirectiva.iapacks.com',
    'https://juntadirectiva.vercel.app',
  ]
  return {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  }
}

function getIP(req) {
  return req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function json(data, status, headers, setCookie) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      ...(setCookie ? { 'Set-Cookie': setCookie } : {}),
    },
  })
}

export default async function handler(req) {
  const c = cors(req.headers.get('origin') || '')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: c })

  let body
  try { body = await req.json() } catch {
    return json({ error: 'JSON inválido' }, 400, c)
  }

  const auth = await requireUser(req)
  if (!auth.user) return authErrorResponse(auth.error, c)

  if (body.action === 'check') {
    let device
    try {
      device = await deviceIdentity(req)
      const result = await callRpc('claim_analysis', {
        p_user_id: auth.user.id,
        p_ip_hash: await abuseHash(getIP(req)),
        p_device_hash: await abuseHash(device.id),
      })
      if (!result?.allowed) {
        const message = result?.code === 'NO_FREE_ANALYSES'
          ? 'Ya has utilizado tus dos análisis gratis de hoy.'
          : 'Se ha alcanzado el límite gratuito de esta conexión por hoy.'
        return json({ allowed: false, code: result?.code || 'NO_FREE_ANALYSES', error: message }, 429, c, device.setCookie)
      }
      const ticket = await issueAnalysisTicket(auth.user.id, result.tier)
      return json({ ...result, ticket }, 200, c, device.setCookie)
    } catch (error) {
      console.error('analysis authorization error:', error)
      return json({ allowed: false, code: 'ANALYSIS_AUTH_UNAVAILABLE', error: 'No se pudo autorizar el análisis. Inténtalo de nuevo en unos minutos.' }, 503, c, device?.setCookie)
    }
  }

  if (body.action === 'reserve-report' || body.action === 'consume-report') {
    let reservation
    try {
      reservation = await callRpc('reserve_report_credit', { p_user_id: auth.user.id })
      if (!reservation?.allowed) {
        return json({ allowed: false, code: 'NO_REPORT_CREDITS', error: 'No tienes créditos de informe disponibles.' }, 402, c)
      }
      const claims = { reservationId: reservation.reservation_id }
      const [quickTicket, reportTicket] = await Promise.all([
        issueAnalysisTicket(auth.user.id, 'premium-quick', 12, claims),
        issueAnalysisTicket(auth.user.id, 'premium-report', 1, claims),
      ])
      return json({
        allowed: true,
        reservationId: reservation.reservation_id,
        remaining: reservation.credits_remaining,
        quickTicket,
        reportTicket,
      }, 200, c)
    } catch (error) {
      console.error('report reservation error:', error)
      if (reservation?.reservation_id) {
        await callRpc('refund_report_reservation', {
          p_user_id: auth.user.id,
          p_reservation_id: reservation.reservation_id,
        }).catch(refundError => console.error('report reservation rollback error:', refundError))
      }
      return json({ allowed: false, code: 'ANALYSIS_AUTH_UNAVAILABLE', error: 'No se pudo reservar el informe. Tu crédito no se consumirá.' }, 503, c)
    }
  }

  return json({ error: 'Acción no soportada' }, 400, c)
}

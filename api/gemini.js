// Edge Function: reenvía la key de Gemini que trae el propio usuario ("bring your own key").
// Google tampoco permite llamadas hechas directo desde el navegador (CORS), así que este endpoint
// solo hace de puente: recibe la key en el body de la petición y la reenvía a Google en el momento.
// No se guarda en ningún sitio ni se registra en logs.
export const config = { runtime: 'edge' }

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export default async function handler(req) {
  const c = cors()
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: c })

  let body
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } }) }

  // Sin tope propio: es la cuenta del usuario, no la nuestra — capar aquí a 1200 cortaba en
  // seco el informe de pago (pide 7500) para cualquiera que use su propia key de Gemini,
  // mientras que la misma compra con la key del servidor (api/coach.js) llegaba completa.
  const { apiKey, model = 'gemini-flash-latest', system, userPrompt, maxTokens = 800, attachments = [] } = body
  if (!apiKey) return new Response(JSON.stringify({ error: 'Falta la API key de Gemini' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  if (!system || !userPrompt) return new Response(JSON.stringify({ error: 'Faltan prompts' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  if (userPrompt.length > 12000 || system.length > 8000) return new Response(JSON.stringify({ error: 'Prompt demasiado largo' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`

  let geminiRes
  try {
    geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }, ...attachments.filter(a => a?.kind === 'image' && /^image\//.test(a.mimeType || '') && a.data?.length < 12_000_000).map(a => ({ inline_data: { mime_type: a.mimeType, data: a.data } }))] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    })
  } catch { return new Response(JSON.stringify({ error: 'Error conectando con Gemini' }), { status: 502, headers: { ...c, 'Content-Type': 'application/json' } }) }

  if (!geminiRes.ok) {
    const t = await geminiRes.text().catch(() => '')
    let msg = `Error Gemini ${geminiRes.status}`
    try { msg = JSON.parse(t).error?.message || msg } catch {}
    return new Response(JSON.stringify({ error: msg }), { status: geminiRes.status, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  return new Response(geminiRes.body, {
    status: 200,
    headers: { ...c, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
}

// Edge Function: reenvía la key de OpenAI que trae el propio usuario ("bring your own key").
// OpenAI bloquea las llamadas hechas directo desde el navegador (CORS), así que este endpoint
// solo hace de puente: recibe la key en el body de la petición y la reenvía a OpenAI en el momento.
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
  // seco el informe de pago (pide 7500) para cualquiera que use su propia key de OpenAI,
  // mientras que la misma compra con la key del servidor (api/coach.js) llegaba completa.
  const { apiKey, model = 'gpt-4o-mini', system, userPrompt, maxTokens = 800, attachments = [] } = body
  if (!apiKey) return new Response(JSON.stringify({ error: 'Falta la API key de OpenAI' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  if (!system || !userPrompt) return new Response(JSON.stringify({ error: 'Faltan prompts' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  if (userPrompt.length > 12000 || system.length > 8000) return new Response(JSON.stringify({ error: 'Prompt demasiado largo' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })

  let openaiRes
  try {
    openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: attachments.length ? [{ type: 'text', text: userPrompt }, ...attachments.filter(a => a?.kind === 'image' && /^image\//.test(a.mimeType || '') && a.data?.length < 12_000_000).map(a => ({ type: 'image_url', image_url: { url: `data:${a.mimeType};base64,${a.data}` } }))] : userPrompt }],
        stream: true,
      }),
    })
  } catch { return new Response(JSON.stringify({ error: 'Error conectando con OpenAI' }), { status: 502, headers: { ...c, 'Content-Type': 'application/json' } }) }

  if (!openaiRes.ok) {
    const t = await openaiRes.text().catch(() => '')
    let msg = `Error OpenAI ${openaiRes.status}`
    try { msg = JSON.parse(t).error?.message || msg } catch {}
    return new Response(JSON.stringify({ error: msg }), { status: openaiRes.status, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  return new Response(openaiRes.body, {
    status: 200,
    headers: { ...c, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
}

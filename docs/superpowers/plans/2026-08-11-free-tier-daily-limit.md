# Free Tier Daily Limit & Proactive-Expert Directors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hourly call-based free limit with 2 analyses/day (server-enforced, paid unlock for more), give every free analysis a readable 3-section mini-report (no download, 4th section locked behind the existing paid informe completo), and rewrite the 12 directors' closing lines from judge-style verdicts to proactive recommendations.

**Architecture:** New Vercel KV-backed `api/analysis-gate.js` edge function gates `conveneBoard` before any director is called (client checks first, aborts on 429 — no wasted LLM cost). A third Stripe product ("análisis extra", 2,99€) grants +3/day, verified server-side like the existing informe completo purchases. `useReport.js` gains a `tier` param picking between a 3-section free system prompt and the existing 4-section paid one — the free prompt never mentions the step-by-step plan, so it can't leak to a free client. Director/Chairman prompts move from "vota apruebo/no apruebo" to "cierra con tu recomendación + convicción alta/media/condicionada" — a single shared vocabulary lets `consensus.js` classify with plain string matching, no extra LLM call.

**Tech Stack:** React 18 + Vite (existing), Vercel Edge Functions (existing, no SDKs — raw `fetch` to REST APIs, matching `api/checkout.js`/`api/verify-checkout.js`), Vercel KV / Upstash Redis REST API (new), Stripe REST API (existing pattern, one new Product/Price).

## Global Constraints

- No accounts/login exists or is being added. "Per user" = "per IP", same as every other limiter in this app.
- No test framework exists in this project (`package.json` has no `test` script, no vitest/jest). Do not add one. Verify with `npm run build` (catches syntax/import errors) and small throwaway `node` scripts for pure-logic files (deleted after use) — this matches how the Stripe checkout work earlier in this session was actually verified (build locally, curl/browser-test after deploy, since Vercel Edge Functions can't run locally without the `vercel` CLI, which isn't installed).
- Never hardcode secrets (Stripe key, KV token) in source — server-side env vars only, exactly like `STRIPE_SECRET_KEY` today.
- Keep the existing hourly call-based limiter in `api/coach.js` (30 calls/hour) untouched — it stays as a secondary abuse ceiling under the new daily limiter, not replaced.
- All new/modified Spanish-language UI copy and prompts must match the existing tone and orthography (accented Spanish, ¿informal tú, no emoji spam beyond what's already in the file).

---

### Task 1: Rewrite director & Chairman prompts for proactive-recommendation tone

**Files:**
- Modify: `src/lib/directors.js` (all 12 `systemPrompt` fields)
- Modify: `src/hooks/useBoard.js:41-47` (`callVerdict`'s `verdictSystem`)
- Modify: `src/App.jsx:137` (`getDirectorVote`'s `keywords` array)

**Interfaces:**
- Produces: every director's `systemPrompt` now ends its closing instruction with the literal phrase pattern `convicción alta`, `convicción media`, or `convicción condicionada a` (Task 2 depends on this exact vocabulary existing in generated text).

- [ ] **Step 1: Replace each director's closing instruction in `src/lib/directors.js`**

Open `src/lib/directors.js`. Each of the 12 `systemPrompt` strings ends with a sentence starting "Termina con tu...". Replace that one sentence in each (leave everything else in the file — `tags`, `personality`, `contribution`, the rest of `systemPrompt` — untouched). The 12 replacements, in file order:

`estratega` (Elena Voss) — replace:
```
Termina con tu posición en el debate (a favor/en contra/condicionado).
```
with:
```
Cierra con tu recomendación estratégica concreta: qué movimiento harías tú primero. Termina la última línea con tu convicción: convicción alta / convicción media / convicción condicionada a [qué].
```

`financiero` (Marcus Chen) — replace:
```
Termina con tu voto: apruebo / no apruebo / apruebo con condiciones [especifica cuáles].
```
with:
```
Cierra con tu recomendación financiera concreta: qué harías tú con los números que tienes. Termina la última línea con tu convicción: convicción alta / convicción media / convicción condicionada a [qué dato o cifra falta].
```

`marketing` (Sofia Reyes) — replace:
```
Termina con tu posición en el debate.
```
with:
```
Cierra con tu recomendación de mercado concreta: qué mensaje o movimiento lanzarías tú primero. Termina la última línea con tu convicción: convicción alta / convicción media / convicción condicionada a [qué].
```

`operaciones` (David Okafor) — replace:
```
Termina con tu evaluación: viable / viable con ajustes / inviable en esta forma.
```
with:
```
Cierra con tu recomendación operativa concreta: cómo lo ejecutarías tú. Termina la última línea con tu convicción: convicción alta / convicción media / convicción condicionada a [qué recurso o ajuste].
```

`legal` (Ana Petrov) — replace:
```
Termina con tu evaluación de riesgo: bajo / medio / alto, con justificación.
```
with:
```
Cierra con tu recomendación concreta para proceder sobre base sólida. Termina la última línea con tu convicción: convicción alta / convicción media / convicción condicionada a [qué salvaguarda].
```

`tecnologia` (Raj Patel) — replace:
```
Termina con tu valoración técnica: simple / moderado / complejo.
```
with:
```
Cierra con tu recomendación técnica concreta: qué construirías o automatizarías tú primero. Termina la última línea con tu convicción: convicción alta / convicción media / convicción condicionada a [qué].
```

`ventas` (Carlos Mendez) — replace:
```
Termina con tu estimación de impacto en ventas: alto / medio / bajo.
```
with:
```
Cierra con tu recomendación de revenue concreta: qué venderías o negociarías tú primero. Termina la última línea con tu convicción: convicción alta / convicción media / convicción condicionada a [qué].
```

`producto` (Yuki Tanaka) — replace:
```
Termina con tu posición: apoyo / apoyo con cambios / no apoyo.
```
with:
```
Cierra con tu recomendación de producto concreta: qué construirías o cambiarías tú primero para el usuario. Termina la última línea con tu convicción: convicción alta / convicción media / convicción condicionada a [qué].
```

`personas` (Isabel Torres) — replace:
```
Termina con tu evaluación de capacidad humana: el equipo puede / puede con refuerzo / no puede sin cambios.
```
with:
```
Cierra con tu recomendación concreta sobre el equipo: qué harías tú primero con las personas que tienes. Termina la última línea con tu convicción: convicción alta / convicción media / convicción condicionada a [qué refuerzo].
```

`datos` (Nadia Kovac) — replace:
```
Termina con tu nivel de confianza en la decisión: alta / media / baja confianza, con razón.
```
with:
```
Cierra con tu recomendación concreta sobre qué medir primero. Termina la última línea con tu convicción: convicción alta / convicción media / convicción condicionada a [qué dato falta].
```

`mentor` (Roberto Alcántara) — replace:
```
Termina con tu posición como chairman: proceder / proceder con cautela / parar y replantear.
```
with:
```
Cierra con tu recomendación como mentor: qué harías tú primero dado lo que has visto antes. Termina la última línea con tu convicción: convicción alta / convicción media / convicción condicionada a [qué].
```

`jottarina` (Jottarina) — replace:
```
Termina con tu veredicto sin rodeos: sí / no / "sí, pero así no".
```
with:
```
Cierra con tu recomendación sin rodeos: qué harías tú primero. Termina la última línea con tu convicción: convicción alta / convicción media / convicción condicionada a [qué].
```

- [ ] **Step 2: Soften the Chairman verdict-synthesis prompt in `src/hooks/useBoard.js`**

In `callVerdict`, replace the `verdictSystem` template literal (currently lines 41-47):
```js
  const verdictSystem = `Eres Roberto Alcántara, Chairman de esta junta directiva. Tras escuchar a todos los directores, tu rol es sintetizar el debate y emitir el veredicto final de la junta.
Tu síntesis debe:
1. Identificar los 2-3 puntos de consenso más importantes
2. Señalar el principal punto de desacuerdo o tensión
3. Dar el VEREDICTO FINAL: proceder / proceder con condiciones / no proceder — con las condiciones específicas si aplica
4. Listar 3 PRÓXIMOS PASOS concretos y priorizados
Sé directo, ejecutivo y claro. Máximo 400 palabras.`
```
with:
```js
  const verdictSystem = `Eres Roberto Alcántara, Chairman de esta junta directiva. Tras escuchar a todos los directores, tu rol es sintetizar el debate en una recomendación clara y accionable — no en una sentencia.
Tu síntesis debe:
1. Identificar los 2-3 puntos de consenso más importantes entre los directores
2. Señalar la principal tensión u objeción a tener en cuenta, siempre acompañada de cómo abordarla
3. Dar tu RECOMENDACIÓN FINAL: proceder / proceder así [con los ajustes concretos] / replantear así [la alternativa concreta que sí funcionaría]
4. Listar 3 PRÓXIMOS PASOS concretos y priorizados
Sé directo, ejecutivo y claro — y siempre constructivo: incluso cuando la recomendación es replantear, da el camino alternativo, nunca solo el freno. Máximo 400 palabras.`
```

- [ ] **Step 3: Update the vote-keyword lookup in `src/App.jsx`**

`getDirectorVote` (around line 137) scans a director's text for the closing line using a keyword list. Replace:
```js
    const keywords = ['voto:', 'posición:', 'evaluación:', 'veredicto:']
```
with:
```js
    const keywords = ['convicción', 'voto:', 'posición:', 'evaluación:', 'veredicto:']
```
(Old keywords kept as a fallback in case any director response doesn't perfectly follow the new instruction — cheap safety net, no downside to leaving them.)

- [ ] **Step 4: Verify no old vote vocabulary remains and the build still compiles**

Run:
```bash
grep -n "Termina con tu" src/lib/directors.js
```
Expected: no output (all 12 replaced).

Run:
```bash
npm run build
```
Expected: build succeeds, same as the last successful build (`✓ built in`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/directors.js src/hooks/useBoard.js src/App.jsx
git commit -m "Rewrite director and Chairman closings from verdicts to recommendations"
```

---

### Task 2: Update `consensus.js` classifier for the new shared vocabulary

**Files:**
- Modify: `src/lib/consensus.js` (full rewrite of the classification logic)

**Interfaces:**
- Consumes: director text ending in `convicción alta` / `convicción media` / `convicción condicionada a ...` (produced by Task 1).
- Produces: `classifyVote(directorId, text): 'favor' | 'contra' | 'mixto' | null` and `computeConsensus(directorStates): { favor, contra, mixto, sinDato, total }` — same exported names and signatures as today, so `App.jsx`'s `computeConsensus(directorStates)` call and `VerdictPanel`'s consumption of the returned shape need no changes.

- [ ] **Step 1: Replace `src/lib/consensus.js` with the simplified classifier**

The old file needed 12 separate per-director regex tables because every director used different vote vocabulary (`apruebo`, `viable`, `sí`, ...). Task 1 made that vocabulary uniform, so one shared matcher now covers all 12 directors — replace the entire file:

```js
// Heurística de consenso: cada director cierra su intervención con su nivel de convicción
// sobre SU PROPIA recomendación ("convicción alta / media / condicionada a X"). Ya no votan
// a favor/en contra de un plan único — cada uno da su propio camino, así que el consenso mide
// cuánta convicción comparten, no si "aprueban" algo. El vocabulario es el mismo para los 12
// directores (ver src/lib/directors.js), así que un único matcher basta — antes hacía falta
// una tabla de reglas por director porque cada uno usaba palabras distintas.

function extractTail(text) {
  if (!text) return ''
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length === 0) return ''
  // Normalmente es la última línea, pero se toman las últimas dos por si el modelo la parte en dos.
  return lines.slice(-2).join(' ').toLowerCase()
}

export function classifyVote(directorId, text) {
  const tail = extractTail(text)
  if (!tail) return null
  if (tail.includes('conviccion condicionada') || tail.includes('convicción condicionada')) return 'contra'
  if (tail.includes('conviccion media') || tail.includes('convicción media')) return 'mixto'
  if (tail.includes('conviccion alta') || tail.includes('convicción alta')) return 'favor'
  return null
}

// directorStates: { [id]: { status, text } }
export function computeConsensus(directorStates) {
  const counts = { favor: 0, contra: 0, mixto: 0, sinDato: 0 }
  Object.entries(directorStates || {}).forEach(([id, s]) => {
    if (s.status !== 'done') return
    const v = classifyVote(id, s.text)
    if (v) counts[v]++
    else counts.sinDato++
  })
  const total = counts.favor + counts.contra + counts.mixto + counts.sinDato
  return { ...counts, total }
}
```

`directorId` stays as the first parameter for signature compatibility even though it's now unused — nothing else in the codebase needs to change its call sites.

- [ ] **Step 2: Write a throwaway verification script**

Create a temporary file `scripts/verify-consensus.mjs` (not committed — deleted in Step 4):
```js
import { classifyVote, computeConsensus } from '../src/lib/consensus.js'

const cases = [
  ['estratega', 'Blah blah.\nConvicción alta: el timing es correcto.', 'favor'],
  ['financiero', 'Los números están ajustados.\nConvicción media: falta validar el CAC real.', 'mixto'],
  ['legal', 'Riesgo bajo si se documenta.\nConvicción condicionada a firmar el NDA primero.', 'contra'],
  ['jottarina', 'Nadie lo dice pero es obvio.\nConvicción alta: hazlo ya.', 'favor'],
  ['datos', 'Sin señal clara todavía.', null],
]

let failed = 0
for (const [id, text, expected] of cases) {
  const got = classifyVote(id, text)
  const ok = got === expected
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${id}: expected ${expected}, got ${got}`)
}

const consensus = computeConsensus({
  estratega: { status: 'done', text: cases[0][1] },
  financiero: { status: 'done', text: cases[1][1] },
  legal: { status: 'done', text: cases[2][1] },
})
console.log('computeConsensus sample:', consensus)
const consensusOk = consensus.favor === 1 && consensus.mixto === 1 && consensus.contra === 1 && consensus.total === 3
console.log(consensusOk ? 'OK   computeConsensus counts correct' : 'FAIL computeConsensus counts wrong')
if (!consensusOk) failed++

process.exit(failed > 0 ? 1 : 0)
```

- [ ] **Step 3: Run the verification script**

```bash
node scripts/verify-consensus.mjs
```
Expected: every line prints `OK`, exit code 0. If any print `FAIL`, fix `consensus.js` (most likely cause: a typo in the `includes()` strings) and re-run before continuing.

- [ ] **Step 4: Delete the throwaway script and verify the build**

```bash
rm scripts/verify-consensus.mjs
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/consensus.js
git commit -m "Simplify consensus classifier to match the directors' shared recommendation vocabulary"
```

---

### Task 3: Add Vercel KV and build `api/analysis-gate.js`

**Files:**
- Create: `api/analysis-gate.js`

**Interfaces:**
- Produces: `POST /api/analysis-gate` with body `{ action: 'check' }` → `200 { allowed: true, tier: 'free'|'extra', degraded?: true }` or `429 { allowed: false, error: string }`. Body `{ action: 'grant-extra', sessionId: string }` → `200 { granted: boolean }` or `4xx/5xx { error: string }`. Consumed by Task 7's `App.jsx` changes.

- [ ] **Step 1: Add the Vercel KV integration (manual dashboard step)**

In the Vercel dashboard, open the `juntadirectiva` project → **Storage** tab → **Create Database** → **KV** (Upstash-backed, free tier is enough for this volume) → connect it to the project. This automatically adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` as environment variables on the project (Production + Preview) — no manual env var entry needed, unlike `STRIPE_SECRET_KEY` which had to be typed in by hand.

- [ ] **Step 2: Write `api/analysis-gate.js`**

```js
// Edge Function: gate de análisis gratis/día por IP, respaldado en Vercel KV (Upstash REST).
// Sin cuentas — "por usuario" aquí significa "por IP", igual que el resto de límites de la app.
// Complementa (no sustituye) el límite por hora de api/coach.js: éste cuenta sesiones/día,
// aquél sigue limitando llamadas/hora como red de seguridad contra abuso.
export const config = { runtime: 'edge' }

const FREE_DAILY_LIMIT = 2
const KEY_TTL_SECONDS = 26 * 60 * 60 // 26h: cubre el día completo con margen de zona horaria

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function getIP(req) {
  return req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}

async function kvCommand(path) {
  const base = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!base || !token) throw new Error('KV no configurado')
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`KV error ${res.status}`)
  const data = await res.json()
  return data.result
}

async function kvGetInt(key) {
  const v = await kvCommand(`/get/${encodeURIComponent(key)}`)
  return v == null ? 0 : parseInt(v, 10) || 0
}
const kvIncr = (key) => kvCommand(`/incr/${encodeURIComponent(key)}`)
const kvIncrBy = (key, amount) => kvCommand(`/incrby/${encodeURIComponent(key)}/${amount}`)
const kvDecr = (key) => kvCommand(`/decr/${encodeURIComponent(key)}`)
const kvExpire = (key, seconds) => kvCommand(`/expire/${encodeURIComponent(key)}/${seconds}`)

async function checkAndConsume(ip) {
  const today = todayUTC()
  const freeKey = `analysis:${ip}:${today}:free`
  const extraKey = `analysis:${ip}:${today}:extra`

  try {
    const freeUsed = await kvGetInt(freeKey)
    if (freeUsed < FREE_DAILY_LIMIT) {
      await kvIncr(freeKey)
      await kvExpire(freeKey, KEY_TTL_SECONDS)
      return { allowed: true, tier: 'free' }
    }
    const extraLeft = await kvGetInt(extraKey)
    if (extraLeft > 0) {
      await kvDecr(extraKey)
      return { allowed: true, tier: 'extra' }
    }
    return { allowed: false }
  } catch {
    // KV caído: no bloqueamos el uso gratuito por un problema de infraestructura.
    return { allowed: true, tier: 'free', degraded: true }
  }
}

async function grantExtra(ip, sessionId) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe no configurado')

  const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const session = await stripeRes.json()
  if (!stripeRes.ok) throw new Error(session.error?.message || 'Sesión no encontrada')
  if (session.payment_status !== 'paid' || session.metadata?.product !== 'extra') {
    return { granted: false }
  }

  const today = todayUTC()
  const extraKey = `analysis:${ip}:${today}:extra`
  await kvIncrBy(extraKey, 3)
  await kvExpire(extraKey, KEY_TTL_SECONDS)
  return { granted: true }
}

export default async function handler(req) {
  const c = cors()
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: c })

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  const ip = getIP(req)

  if (body.action === 'check') {
    const result = await checkAndConsume(ip)
    if (!result.allowed) {
      return new Response(JSON.stringify({ allowed: false, error: 'Sin análisis gratis hoy. Compra análisis extra para seguir analizando.' }), {
        status: 429, headers: { ...c, 'Content-Type': 'application/json' }
      })
    }
    return new Response(JSON.stringify(result), { status: 200, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  if (body.action === 'grant-extra') {
    if (!body.sessionId) return new Response(JSON.stringify({ error: 'sessionId requerido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
    try {
      const result = await grantExtra(ip, body.sessionId)
      return new Response(JSON.stringify(result), { status: 200, headers: { ...c, 'Content-Type': 'application/json' } })
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Error verificando el pago' }), { status: 502, headers: { ...c, 'Content-Type': 'application/json' } })
    }
  }

  return new Response(JSON.stringify({ error: 'Acción no soportada' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
}
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```
Expected: build succeeds. (This only checks the file is valid JS the bundler can process — the KV/Stripe calls themselves are exercised live in Task 8, same as `checkout.js` and `verify-checkout.js` were.)

- [ ] **Step 4: Commit**

```bash
git add api/analysis-gate.js
git commit -m "Add daily free/extra analysis gate backed by Vercel KV"
```

---

### Task 4: Create the "Análisis extra" Stripe product and wire its price

**Files:**
- Modify: `api/checkout.js` (the `PRICES` map)

**Interfaces:**
- Consumes: the live Stripe account already used for the informe completo products (`acct_1N9WhxFNpWfaUovU`).
- Produces: `PRICES.extra` price ID, consumed by `POST /api/checkout { product: 'extra' }` (Task 7's `handleBuyExtra`).

- [ ] **Step 1: Create the product in the live Stripe dashboard**

Same flow used for the two existing products: navigate to `https://dashboard.stripe.com/acct_1N9WhxFNpWfaUovU/products/create`, name it `Junta Directiva AI - Análisis extra`, price `2,99` EUR, type **Único** (one-time, not recurring), save. Note the resulting `price_...` ID.

- [ ] **Step 2: Add the price ID to `api/checkout.js`**

In `api/checkout.js`, the `PRICES` map currently has two entries:
```js
const PRICES = {
  single: 'price_1U3B1eFNpWfaUovUQrzZfQAn', // Informe completo — 4,99 €
  bundle: 'price_1U3B48FNpWfaUovU5Mhdvviq', // Pack 3 informes — 9,99 €
}
```
Add a third:
```js
const PRICES = {
  single: 'price_1U3B1eFNpWfaUovUQrzZfQAn', // Informe completo — 4,99 €
  bundle: 'price_1U3B48FNpWfaUovU5Mhdvviq', // Pack 3 informes — 9,99 €
  extra:  'price_XXXXXXXXXXXXXXXXXXXXXXXX', // Análisis extra (+3 ese día) — 2,99 €
}
```
(Replace `price_XXXXXXXXXXXXXXXXXXXXXXXX` with the real ID from Step 1.)

- [ ] **Step 3: Verify the build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add api/checkout.js
git commit -m "Add análisis extra Stripe price"
```

---

### Task 5: Split free (3-section) vs paid (4-section) report generation

**Files:**
- Modify: `src/hooks/useReport.js`

**Interfaces:**
- Consumes: same call shape as today (`situation, meetingType, activeDirectors, directorStates, verdict, apiKey, provider`), plus a new `tier: 'free' | 'paid'` param (defaults to `'paid'` so any caller that doesn't pass it keeps today's behavior).
- Produces: `report` object gains a `locked: boolean` field (`true` when `tier === 'free'`) — consumed by Task 6's `ReportModal.jsx`.

- [ ] **Step 1: Replace `src/hooks/useReport.js`**

```js
import { useState, useCallback } from 'react'
import { DIRECTORS } from '../lib/directors.js'
import { streamCompletion } from '../lib/aiClient.js'

// Opinión exprés (2-3 frases) de un director que no participó en el debate en vivo —
// para que ningún miembro de la junta de 12 quede sin decir nada en el informe.
async function quickTake({ director, situation, apiKey, provider }) {
  const userMsg = `SITUACIÓN: ${situation}

Como ${director.name} (${director.title}), da tu opinión exprés en 2-3 frases desde tu especialidad. No es un análisis largo — solo tu primera reacción experta y directa, sin rodeos.`
  return streamCompletion({ provider, apiKey, system: director.systemPrompt, userMsg, maxTokens: 180 })
}

const REPORT_SYSTEM_PAID = `Eres el equipo editorial de Junta Directiva AI. A partir de un debate ya completado, produces el INFORME COMPLETO — un documento notablemente más profundo y útil que el veredicto gratuito ya entregado al usuario. No repitas el veredicto, amplíalo.

Estructura obligatoria, con estos encabezados exactos en mayúsculas, cada uno en su propia línea:

RESUMEN AMPLIADO
Dos o tres párrafos que profundizan en el análisis más allá del veredicto rápido, conectando los puntos de vista de los directores que sí debatieron en vivo con las opiniones exprés de los que no.

IDEAS ADICIONALES
4 a 6 ideas concretas y accionables que NO aparecieron en el veredicto rápido.

RECURSOS Y HERRAMIENTAS RECOMENDADAS
Nombra herramientas, plataformas, metodologías o tipos de recursos reales y conocidos, agrupados por categoría. No inventes URLs ni enlaces específicos — solo nombres reales de herramientas o categorías de búsqueda.

PLAN DE MEJORA DETALLADO
6 a 8 pasos concretos y priorizados. Para cada uno indica el esfuerzo estimado (bajo/medio/alto) entre paréntesis.

Sé denso en valor, cero relleno ni frases genéricas. Este informe debe sentirse claramente superior al veredicto gratuito.`

const REPORT_SYSTEM_FREE = `Eres el equipo editorial de Junta Directiva AI. A partir de un debate ya completado, produces una ampliación gratuita del veredicto — más profunda que el veredicto rápido, pero sin el plan de ejecución detallado (eso es exclusivo de la versión de pago). No lo menciones ni lo insinúes, simplemente no lo incluyas.

Estructura obligatoria, con estos encabezados exactos en mayúsculas, cada uno en su propia línea:

RESUMEN AMPLIADO
Dos o tres párrafos que profundizan en el análisis más allá del veredicto rápido, conectando los puntos de vista de los directores que sí debatieron en vivo con las opiniones exprés de los que no.

IDEAS ADICIONALES
4 a 6 ideas concretas y accionables que NO aparecieron en el veredicto rápido.

RECURSOS Y HERRAMIENTAS RECOMENDADAS
Nombra herramientas, plataformas, metodologías o tipos de recursos reales y conocidos, agrupados por categoría. No inventes URLs ni enlaces específicos — solo nombres reales de herramientas o categorías de búsqueda.

Sé denso en valor, cero relleno ni frases genéricas.`

export function useReport() {
  const [report, setReport] = useState(null)       // { text, quickTakes: [{director,text}], locked }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const generateReport = useCallback(async ({ situation, meetingType, activeDirectors, directorStates, verdict, apiKey, provider, tier = 'paid' }) => {
    setLoading(true)
    setError(null)
    setReport(null)
    try {
      const activeIds = new Set(activeDirectors.map(d => d.id))
      const missingDirectors = DIRECTORS.filter(d => !activeIds.has(d.id))

      const quickResults = await Promise.all(missingDirectors.map(async (director) => {
        try {
          const text = await quickTake({ director, situation, apiKey, provider })
          return { director, text }
        } catch {
          return { director, text: null }
        }
      }))
      const quickTakes = quickResults.filter(q => q.text)

      const liveSummary = activeDirectors
        .map(d => `${d.name} (${d.title}) [debate en vivo]:\n${directorStates[d.id]?.text || ''}`)
        .join('\n\n')
      const quickSummary = quickTakes
        .map(q => `${q.director.name} (${q.director.title}) [opinión exprés]:\n${q.text}`)
        .join('\n\n')

      const reportPrompt = `SITUACIÓN ORIGINAL:
${situation}

VEREDICTO YA ENTREGADO AL USUARIO (gratuito, no lo repitas):
${verdict || '(sin veredicto disponible)'}

DEBATE EN VIVO:
${liveSummary}

OPINIONES EXPRÉS DE LOS DIRECTORES QUE NO PARTICIPARON EN VIVO:
${quickSummary || '(todos los directores participaron en vivo)'}

Produce el informe siguiendo exactamente la estructura indicada.`

      const system = tier === 'free' ? REPORT_SYSTEM_FREE : REPORT_SYSTEM_PAID
      const text = await streamCompletion({ provider, apiKey, system, userMsg: reportPrompt, maxTokens: tier === 'free' ? 900 : 1500 })
      setReport({ text, quickTakes, locked: tier === 'free' })
    } catch (err) {
      setError(err.message || 'No se pudo generar el informe')
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => { setReport(null); setError(null) }, [])

  return { report, loading, error, generateReport, reset }
}
```

- [ ] **Step 2: Verify the build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useReport.js
git commit -m "Split free (3-section) and paid (4-section) report generation in useReport"
```

---

### Task 6: Add locked/free mode to `ReportModal`

**Files:**
- Modify: `src/components/ReportModal.jsx`

**Interfaces:**
- Consumes: `report.locked` (from Task 5), new props `onUpgrade: () => void` and `upgrading: boolean`.
- Produces: no new exports — same default export, two new optional props.

- [ ] **Step 1: Replace `src/components/ReportModal.jsx`**

```jsx
import React from 'react'

const KNOWN_HEADERS = [
  'RESUMEN AMPLIADO',
  'IDEAS ADICIONALES',
  'RECURSOS Y HERRAMIENTAS RECOMENDADAS',
  'PLAN DE MEJORA DETALLADO',
]

function parseSections(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const sections = []
  let current = null
  for (const line of lines) {
    const clean = line.replace(/^#+\s*/, '').replace(/\*\*/g, '')
    const isHeader = KNOWN_HEADERS.some(h => clean.toUpperCase() === h || clean.toUpperCase().startsWith(h))
    if (isHeader) {
      current = { title: clean, lines: [] }
      sections.push(current)
    } else if (current) {
      current.lines.push(clean)
    } else {
      current = { title: '', lines: [clean] }
      sections.push(current)
    }
  }
  return sections
}

function buildDownloadText(situation, verdict, report) {
  const parts = [
    'JUNTA DIRECTIVA AI — INFORME COMPLETO',
    '='.repeat(40),
    '',
    `SITUACIÓN: ${situation}`,
    '',
    'VEREDICTO RÁPIDO',
    '-'.repeat(20),
    verdict || '',
    '',
    report.text,
  ]
  if (report.quickTakes?.length) {
    parts.push('', 'OPINIONES EXPRÉS DE LOS DEMÁS DIRECTORES', '-'.repeat(20))
    report.quickTakes.forEach(q => {
      parts.push(`${q.director.name} (${q.director.title}): ${q.text}`, '')
    })
  }
  return parts.join('\n')
}

export default function ReportModal({ situation, verdict, report, loading, error, onClose, onUpgrade, upgrading }) {
  const handleDownload = () => {
    const text = buildDownloadText(situation, verdict, report)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'informe-junta-directiva.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,13,31,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: '20px', animation: 'fadeIn .2s ease' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--blue-bd)', borderRadius: 'var(--r-xl)', width: '100%', maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', animation: 'fadeUp .3s ease' }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '10px', color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '2px', fontWeight: 500 }}>Junta Directiva AI</p>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--t1)' }}>
              {report?.locked ? '📄 Ampliación del veredicto' : '📄 Informe completo'}
            </p>
          </div>
          <button onClick={onClose} style={{ fontSize: '18px', color: 'var(--t3)', padding: '4px 8px' }}>×</button>
        </div>

        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: '13px', color: 'var(--blue)', marginBottom: '12px' }}>
                Consultando a los directores que no debatieron en vivo y ampliando el análisis...
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '5px' }}>
                <span className="dot"></span><span className="dot"></span><span className="dot"></span>
              </div>
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: '14px 18px', background: 'var(--red-dim)', border: '1px solid var(--red-bd)', borderRadius: 'var(--r-md)', color: 'var(--red)', fontSize: '13px' }}>
              ⚠️ {error}
            </div>
          )}

          {report && !loading && (
            <>
              {parseSections(report.text).map((section, i) => (
                <div key={i} style={{ marginBottom: '22px' }}>
                  {section.title && (
                    <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '10px' }}>
                      {section.title}
                    </p>
                  )}
                  {section.lines.map((l, j) => (
                    <p key={j} style={{ fontSize: '13.5px', lineHeight: 1.7, color: 'var(--t1)', marginBottom: '8px' }}>{l}</p>
                  ))}
                </div>
              ))}

              {report.locked && (
                <div style={{ marginBottom: '22px', padding: '18px', borderRadius: 'var(--r-md)', border: '1px dashed var(--blue-bd)', background: 'var(--blue-dim)' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '8px' }}>
                    🔒 Plan de mejora paso a paso
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--t2)', lineHeight: 1.6, marginBottom: '12px' }}>
                    6 a 8 pasos concretos y priorizados, con el esfuerzo estimado de cada uno — disponible en el informe completo.
                  </p>
                  <button
                    onClick={onUpgrade}
                    disabled={upgrading}
                    style={{ padding: '10px 18px', borderRadius: 'var(--r-sm)', border: 'none', background: upgrading ? 'var(--bg3)' : 'var(--blue)', color: upgrading ? 'var(--t2)' : 'var(--bg0)', fontSize: '13px', fontWeight: 700, cursor: upgrading ? 'not-allowed' : 'pointer' }}
                  >
                    {upgrading ? 'Procesando...' : 'Desbloquear plan paso a paso · 4,99 €'}
                  </button>
                </div>
              )}

              {report.quickTakes?.length > 0 && (
                <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--bd)' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '14px' }}>
                    Opinión exprés de los demás directores
                  </p>
                  {report.quickTakes.map(({ director, text }) => (
                    <div key={director.id} style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, background: director.colorDim, border: `1px solid ${director.colorBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                        {director.emoji}
                      </div>
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: 700, color: director.color, marginBottom: '2px' }}>{director.name} <span style={{ fontWeight: 400, color: 'var(--t3)' }}>· {director.title}</span></p>
                        <p style={{ fontSize: '13px', color: 'var(--t2)', lineHeight: 1.6 }}>{text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {report && !loading && (
          <div style={{ padding: '16px 28px', borderTop: '1px solid var(--bd)', display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 'var(--r-sm)', border: '1px solid var(--bd)', color: 'var(--t2)', fontSize: '13px' }}>Cerrar</button>
            {!report.locked && (
              <button onClick={handleDownload} style={{ flex: 2, padding: '11px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--blue)', color: 'var(--bg0)', fontSize: '13px', fontWeight: 700 }}>
                ⬇️ Descargar informe
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ReportModal.jsx
git commit -m "Add locked/free mode to ReportModal with upgrade CTA"
```

---

### Task 7: Wire the daily gate, free mini-report, and análisis-extra purchase into `App.jsx`

**Files:**
- Create: `src/components/DailyLimitBanner.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `POST /api/analysis-gate` (Task 3), `PRICES.extra` via `POST /api/checkout` (Task 4), `generateReport({..., tier})` (Task 5), `ReportModal`'s `onUpgrade`/`upgrading` props (Task 6).
- Produces: nothing new consumed elsewhere — this is the top-level wiring task.

- [ ] **Step 1: Create `src/components/DailyLimitBanner.jsx`**

```jsx
import React from 'react'

export default function DailyLimitBanner({ error, onBuyExtra, buying }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--red-bd)', borderRadius: 'var(--r-md)',
      padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginTop: '12px',
    }}>
      <p style={{ flex: 1, minWidth: '200px', fontSize: '13px', color: 'var(--t2)', lineHeight: 1.5 }}>
        ⚠️ {error}
      </p>
      <button
        onClick={onBuyExtra}
        disabled={buying}
        style={{
          padding: '10px 18px', borderRadius: 'var(--r-md)', border: 'none',
          background: buying ? 'var(--bg3)' : 'var(--blue)', color: buying ? 'var(--t2)' : 'var(--bg0)',
          fontSize: '13px', fontWeight: 700, cursor: buying ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {buying ? 'Procesando...' : '3 análisis extra · 2,99 €'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add imports and new state to `src/App.jsx`**

Change the React import (line 1) to include `useRef`:
```js
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
```

Add the `DailyLimitBanner` import next to the other component imports (after the `DownloadBanner` import):
```js
import DailyLimitBanner from './components/DailyLimitBanner.jsx'
```

In the component body, after the existing `checkoutError` state declaration, add:
```js
  const [sessionTier, setSessionTier] = useState(null) // 'free' | 'extra' | 'own-key' | null
  const [gateError, setGateError] = useState(null)
  const [gateChecking, setGateChecking] = useState(false)
  const [buyingExtra, setBuyingExtra] = useState(false)
  const autoReportFiredRef = useRef(false)
```

- [ ] **Step 3: Extend the checkout-return `useEffect` to handle the "extra" product**

Replace the existing effect:
```js
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('checkout_session_id')
    if (!sessionId) return
    window.history.replaceState({}, '', window.location.pathname)
    fetch('/api/verify-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.paid) addReportCredits(data.product === 'bundle' ? 3 : 1)
        else setCheckoutError('El pago no se completó.')
      })
      .catch(() => setCheckoutError('No se pudo verificar el pago.'))
  }, [addReportCredits])
```
with:
```js
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('checkout_session_id')
    if (!sessionId) return
    window.history.replaceState({}, '', window.location.pathname)
    fetch('/api/verify-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
      .then(res => res.json())
      .then(data => {
        if (!data.paid) { setCheckoutError('El pago no se completó.'); return }
        if (data.product === 'extra') {
          fetch('/api/analysis-gate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'grant-extra', sessionId }),
          })
            .then(res => res.json())
            .then(grant => {
              if (grant.granted) setGateError(null)
              else setCheckoutError('El pago se confirmó pero no se pudo activar. Contacta soporte.')
            })
            .catch(() => setCheckoutError('El pago se confirmó pero no se pudo activar. Contacta soporte.'))
        } else {
          addReportCredits(data.product === 'bundle' ? 3 : 1)
        }
      })
      .catch(() => setCheckoutError('No se pudo verificar el pago.'))
  }, [addReportCredits])
```

- [ ] **Step 4: Add the free mini-report auto-trigger effect**

Find these two lines:
```js
  const doneCount  = Object.values(directorStates).filter(s => s.status === 'done').length
  const totalCount = activeDirectors.length
```
and insert immediately after them (before `const handleConvene = ...`):
```js

  // Sesiones gratis/extra (no BYOK): en cuanto llega el veredicto, se genera automáticamente
  // la ampliación de 3 secciones — legible en pantalla, sin descarga, sin gastar un crédito.
  useEffect(() => {
    if (!isDone || !verdict) return
    if (sessionTier !== 'free' && sessionTier !== 'extra') return
    if (autoReportFiredRef.current) return
    autoReportFiredRef.current = true
    setShowReport(true)
    generateReport({ situation, meetingType, activeDirectors, directorStates, verdict, apiKey: null, provider: 'claude', tier: 'free' })
  }, [isDone, verdict, sessionTier, situation, meetingType, activeDirectors, directorStates, generateReport])
```
(This position is after `isDone` is declared, so it's in scope.)

- [ ] **Step 5: Update `handleConvene` to check the gate first**

Replace:
```js
  const handleConvene = useCallback(async () => {
    if (!situation.trim() || !isIdle || selectedIds.length === 0) return
    const directors = orderForDebate(selectedIds, DIRECTORS)
    await conveneBoard({ directors, situation: situation.trim(), meetingType, contextBlock: buildContextBlock(), apiKey: apiKey || null, provider: apiProvider })
  }, [situation, meetingType, selectedIds, apiKey, apiProvider, isIdle, conveneBoard])
```
with:
```js
  const handleConvene = useCallback(async () => {
    if (!situation.trim() || !isIdle || selectedIds.length === 0) return
    setGateError(null)

    let tier = 'own-key'
    if (!apiKey) {
      setGateChecking(true)
      try {
        const res = await fetch('/api/analysis-gate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check' }),
        })
        const data = await res.json()
        setGateChecking(false)
        if (!res.ok || !data.allowed) {
          setGateError(data.error || 'Sin análisis gratis hoy.')
          return
        }
        tier = data.tier
      } catch {
        setGateChecking(false)
        tier = 'free' // el mismo criterio "falla abierto" que el servidor, por si el propio fetch falla
      }
    }

    setSessionTier(tier)
    autoReportFiredRef.current = false
    const directors = orderForDebate(selectedIds, DIRECTORS)
    await conveneBoard({ directors, situation: situation.trim(), meetingType, contextBlock: buildContextBlock(), apiKey: apiKey || null, provider: apiProvider })
  }, [situation, meetingType, selectedIds, apiKey, apiProvider, isIdle, conveneBoard])
```

- [ ] **Step 6: Add the "buy análisis extra" handler and reset the new state on `handleReset`**

Add, next to `handleBuyReport`:
```js
  const handleBuyExtra = async () => {
    setCheckoutError(null)
    setBuyingExtra(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: 'extra' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error creando el pago')
      window.location.href = data.url
    } catch (err) {
      setCheckoutError(err.message)
      setBuyingExtra(false)
    }
  }
```

Replace `handleReset`:
```js
  const handleReset = () => { reset(); resetReport(); resetChat(); setShowReport(false); setSituation('') }
```
with:
```js
  const handleReset = () => {
    reset(); resetReport(); resetChat(); setShowReport(false); setSituation('')
    setSessionTier(null); setGateError(null); autoReportFiredRef.current = false
  }
```

- [ ] **Step 7: Update the free-mode copy and render `DailyLimitBanner`**

In the nav badge (around line 176), replace:
```js
            {apiKey ? `${PROVIDERS[apiProvider]?.emoji || '🔑'} ${PROVIDERS[apiProvider]?.label || 'key propia'}` : '🌐 3/hora'}
```
with:
```js
            {apiKey ? `${PROVIDERS[apiProvider]?.emoji || '🔑'} ${PROVIDERS[apiProvider]?.label || 'key propia'}` : '🌐 2/día'}
```

In the idle-screen footer copy (around line 311), replace:
```js
                {apiKey ? '🔑 Tu API key · reuniones ilimitadas' : '🌐 Modo gratuito · 3 reuniones/hora'} ·{' '}
```
with:
```js
                {apiKey ? '🔑 Tu API key · reuniones ilimitadas' : '🌐 Modo gratuito · 2 análisis/día'} ·{' '}
```

Update the convene button's `disabled` and label to account for `gateChecking` (around lines 302-308):
```js
              <button
                onClick={handleConvene}
                disabled={!situation.trim() || ctxProcessing || gateChecking || selectedIds.length === 0}
                style={{ padding: '17px', borderRadius: 'var(--r-md)', border: 'none', background: (situation.trim() && selectedIds.length > 0) ? 'var(--blue)' : 'var(--bg3)', color: (situation.trim() && selectedIds.length > 0) ? 'var(--bg0)' : 'var(--t3)', fontSize: '15px', fontWeight: 700, cursor: (situation.trim() && selectedIds.length > 0) ? 'pointer' : 'not-allowed', transition: 'all .2s', letterSpacing: '.02em' }}
              >
                {selectedIds.length === 0 ? '⚠️ Elige al menos un director' : gateChecking ? 'Comprobando disponibilidad...' : '🏛️ Convocar la junta'}
              </button>

              {gateError && (
                <DailyLimitBanner error={gateError} onBuyExtra={handleBuyExtra} buying={buyingExtra} />
              )}
```
(This replaces just the `<button>` block; the surrounding `<p>` with "Modo gratuito" stays where it is, right after.)

- [ ] **Step 8: Wire the new `ReportModal` props**

Replace:
```js
      {showReport && (
        <ReportModal
          situation={situation}
          verdict={verdict}
          report={report}
          loading={reportLoading}
          error={reportError}
          onClose={() => setShowReport(false)}
        />
      )}
```
with:
```js
      {showReport && (
        <ReportModal
          situation={situation}
          verdict={verdict}
          report={report}
          loading={reportLoading}
          error={reportError}
          onClose={() => setShowReport(false)}
          onUpgrade={() => handleBuyReport('single')}
          upgrading={buyingReport}
        />
      )}
```

- [ ] **Step 9: Verify the build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/App.jsx src/components/DailyLimitBanner.jsx
git commit -m "Wire daily analysis gate, free mini-report, and análisis extra purchase into App"
```

---

### Task 8: Deploy to production and verify end-to-end

**Files:** none (deploy + manual verification only)

- [ ] **Step 1: Push to `main`**

```bash
git push origin main
```

- [ ] **Step 2: Wait for the Vercel deployment to finish**

```bash
gh api "repos/JotaEse68/juntadirectiva/deployments" --jq '.[0].id'
```
Then, with that ID:
```bash
gh api "repos/JotaEse68/juntadirectiva/deployments/<ID>/statuses" --jq '.[0].state'
```
Expected: `success`. If `failure`/`error`, check the Vercel build logs before continuing.

- [ ] **Step 3: Curl-verify the daily gate progression**

```bash
curl -s -X POST https://juntadirectiva.vercel.app/api/analysis-gate -H "Content-Type: application/json" -d '{"action":"check"}'
curl -s -X POST https://juntadirectiva.vercel.app/api/analysis-gate -H "Content-Type: application/json" -d '{"action":"check"}'
curl -s -X POST https://juntadirectiva.vercel.app/api/analysis-gate -H "Content-Type: application/json" -d '{"action":"check"}'
```
Expected: 1st and 2nd calls return `{"allowed":true,"tier":"free"}`, 3rd returns `{"allowed":false,"error":"Sin análisis gratis hoy. Compra análisis extra para seguir analizando."}` with HTTP 429. (All three calls come from the same machine/IP, so they share one day's counter — exactly what's being verified.)

- [ ] **Step 4: Curl-verify the análisis-extra checkout session creation**

```bash
curl -s -X POST https://juntadirectiva.vercel.app/api/checkout -H "Content-Type: application/json" -d '{"product":"extra"}'
```
Expected: `{"url":"https://checkout.stripe.com/c/pay/cs_live_..."}` — confirms `PRICES.extra` resolves to a real, valid Stripe price.

- [ ] **Step 5: Browser-verify the full free-analysis flow**

Using the Chrome browser tool: navigate to `https://juntadirectiva.vercel.app/`, fill in a situation, convene the board. Confirm:
- Director responses close with "convicción alta/media/condicionada..." language, not "apruebo/viable/sí".
- Right after the verdict, the report modal auto-opens showing RESUMEN AMPLIADO, IDEAS ADICIONALES, and RECURSOS — with no PLAN DE MEJORA section and no "Descargar informe" button, instead the locked CTA card.
- The consensus bar in `VerdictPanel` still renders a sensible favor/contra/mixto split (not everything falling into `sinDato`).

- [ ] **Step 6: Browser-verify the blocked state and análisis-extra purchase**

Run a 3rd analysis in the same browser session (reusing the IP already exhausted in Step 3's curl calls, so it should block immediately). Confirm the `DailyLimitBanner` appears with the "3 análisis extra · 2,99 €" button, and clicking it redirects to a real Stripe Checkout page (do not complete the payment unless asked to — same precedent as the informe completo purchase flow).

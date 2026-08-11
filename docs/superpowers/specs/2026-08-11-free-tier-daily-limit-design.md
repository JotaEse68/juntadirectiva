# Free tier daily limit, paid analysis unlock, proactive-expert directors

## Context

Today the app has two separate gates:
- A per-IP, per-hour, call-counting rate limit (`api/coach.js`, 30 calls/hour) that caps free-mode usage. It's the only thing standing between "free" and "abused."
- A per-report paywall (`api/checkout.js` / `api/verify-checkout.js`, just shipped) that unlocks the "informe completo" (4 sections + download) for 4,99€ (single) or 9,99€ (pack of 3), tracked as credits in `localStorage`.

The owner wants three changes, decided across a brainstorming session:

1. Free usage reframed as **2 analyses/day** (not calls/hour) — a unit users actually understand — with a **paid unlock** for more the same day instead of a hard wall until tomorrow.
2. Each free analysis should show a **readable, non-downloadable mini-report** in-page (3 of the 4 informe-completo sections), not just the short verdict it shows today. The 4th section (step-by-step plan) and the download button stay behind the existing paid informe completo.
3. The 12 directors currently close their turn with a binary-ish verdict ("apruebo/no apruebo", "viable/inviable", "sí/no"). This reads as judgmental. Rewrite to close with a concrete recommendation instead, and rework the consensus heuristic to match.

## Goals

- 2 free analyses/day, enforced server-side per IP, reliably across redeploys and Vercel regions (rules out the current in-memory approach for anything day-scoped).
- A new Stripe product — "Análisis extra", 2,99€, one-time — that grants +3 analyses for the current day when purchased.
- Free analyses auto-show a 3-section mini-report in-page; the 4th section only exists server-side for paid generations (never sent to a free client, not just hidden client-side).
- Director system prompts rewritten to close with an actionable recommendation instead of a verdict; consensus classification reworked to match the new vocabulary without adding an extra LLM call.
- Chairman's final verdict synthesis prompt softened to stay consistent in tone with the directors.

## Non-goals

- No accounts/login. "Per user" means "per IP" — same ceiling as every other limit in this app already accepts.
- No new pricing tiers beyond the two Stripe products that already exist (single/bundle informe) plus the one new one (análisis extra). No subscriptions.
- The existing hourly call-based limiter in `api/coach.js` is not removed — it stays as a secondary abuse ceiling under the new daily limiter.
- Not rebuilding consensus into an LLM-based classifier. Stays pattern-based, just with new vocabulary.

## Architecture

### Daily counters: Vercel KV

Add the Vercel KV integration (free tier) to the project. Two counters per IP per UTC day:

```
key: analysis:{ip}:{YYYY-MM-DD}:free   → int, free analyses used today (cap 2)
key: analysis:{ip}:{YYYY-MM-DD}:extra  → int, paid extra analyses remaining today
```

Both keys set with a TTL of ~26h (covers the day plus timezone slack) so KV self-cleans; no cron/cleanup job needed.

New endpoint `api/analysis-gate.js` (edge function, same shape as the other `api/*.js` files):

- `POST { action: 'check' }` — on session start (before `conveneBoard` calls any director). Reads both counters for the caller's IP+day.
  - If `free < 2`: increments `free`, returns `{ allowed: true, tier: 'free' }`.
  - Else if `extra > 0`: decrements `extra`, returns `{ allowed: true, tier: 'extra' }`.
  - Else: returns `{ allowed: false }` with a 429 and a message pointing at the "análisis extra" purchase.
- `POST { action: 'grant-extra', sessionId }` — called after a successful "análisis extra" Stripe checkout, mirrors `verify-checkout.js`'s payment confirmation (never trusts the client), then adds +3 to `extra` for the caller's IP+day.

`useBoard.js`'s `conveneBoard` calls `action: 'check'` first; on `allowed: false` it surfaces the message and never starts the director loop (no wasted LLM cost). The result's `tier` also determines whether the app auto-generates the 3-section mini-report afterward (see below) or, for `apiKey`-equipped users (bring-your-own-key, already unlimited), skips the daily gate entirely — unchanged from today's "reuniones ilimitadas" behavior.

### Report content split: free (3 sections) vs paid (4 sections + download)

`useReport.js`'s `REPORT_SYSTEM` prompt currently asks for all 4 sections in one generation, gated entirely behind a purchased credit. That splits in two:

- **Free path** (auto-triggered right after the verdict, for `tier: 'free'` or `tier: 'extra'` sessions): a new, shorter system prompt asking only for RESUMEN AMPLIADO, IDEAS ADICIONALES, RECURSOS Y HERRAMIENTAS RECOMENDADAS. No mention of a step-by-step plan exists in this prompt at all — the model never generates it, so it can never leak to the client. Rendered read-only in a variant of `ReportModal` (or the same component with a `readOnly` prop) with no download button and a locked "Plan de mejora paso a paso — desbloquear por 4,99€" card at the bottom, linking into the existing `DownloadBanner` purchase flow.
- **Paid path** (unchanged mechanism, `handleGenerateReport` gated by `reportCredits`): keeps generating all 4 sections via the existing `REPORT_SYSTEM` prompt and keeps the download button.

If a user who already saw the free 3-section version then buys the informe completo, the paid generation runs fresh (regenerates sections 1–3 too) rather than trying to "append" the 4th section to the earlier free text — simplest, avoids stitching two separate model outputs together.

### New Stripe product: "Análisis extra"

Same pattern as the two existing products (`docs` already cover creation): one more Product + Price in the live Stripe account, 2,99€, one-time. Its price ID goes in `api/checkout.js`'s `PRICES` map (`extra: 'price_...'`) alongside `single`/`bundle`. `DownloadBanner`-style purchase button, but its home is the "you're out of free analyses today" state on the main convene screen, not the informe completo banner — new small component, not a reuse of `DownloadBanner`. On return from Stripe, `App.jsx`'s existing `checkout_session_id` handling extends: verify via `verify-checkout.js` as today, and when `product === 'extra'`, additionally call `api/analysis-gate.js` with `action: 'grant-extra'` to credit the day's counter (rather than a `localStorage` credit, since this one must be server-enforced).

### Director tone: recommendation instead of verdict

Every director's `systemPrompt` in `directors.js` gets its closing instruction rewritten. Shape stays parallel across all 12 (still parseable, still one clear line at the end) but the vocabulary moves from judge language to advisor language. Concretely, replace lines like:

> Termina con tu voto: apruebo / no apruebo / apruebo con condiciones [especifica cuáles].

with something in the shape of:

> Cierra con tu recomendación concreta: qué harías tú primero y por qué. Si señalas un riesgo, acompáñalo siempre de cómo mitigarlo — nunca lo dejes como objeción sola. Indica tu nivel de convicción: alta / media / condicionada a [qué].

The "alta / media / condicionada a X" tail is the load-bearing bit — it keeps a small closed vocabulary so `consensus.js` can still pattern-match deterministically (no extra LLM call, no added latency/cost), just reclassifying `alta → favor`, `media → mixto`, `condicionada → mixto/contra` depending on director, instead of today's `apruebo/viable/sí`. Each of the 12 `DIRECTOR_VOTE_RULES` entries gets updated to the director's new closing vocabulary; `GENERIC_RULES` gets the same treatment as a fallback.

The Chairman's verdict-synthesis prompt (`callVerdict` in `useBoard.js`) keeps its "proceder / proceder con condiciones / no proceder" structure (that one isn't a per-director judgment, it's the board's actual final call, which the product still needs) but its surrounding language softens to match — leads with the synthesized recommendation, frames "no proceder" as "replantear así" rather than a rejection.

## Data flow: a free analysis, start to finish

1. User fills situation, clicks "Convocar la junta".
2. `conveneBoard` calls `POST /api/analysis-gate { action: 'check' }` first (skipped if the user has their own API key — unlimited as today).
3. `allowed: false` → show the "sin análisis gratis hoy" state with the 2,99€ unlock button; stop, no director calls made.
4. `allowed: true` → debate runs exactly as today (directors, then Chairman verdict) — only the prompt wording changed, not the flow.
5. Right after the verdict lands, the app auto-calls the free 3-section report generation and shows it read-only, no download, with the locked 4th-section card.
6. If the user buys "análisis extra" from the locked state in step 3: Stripe Checkout → back to the app → `verify-checkout` confirms payment → `analysis-gate` grants +3 → user can immediately convene again.
7. If the user buys the informe completo from the mini-report's locked card: existing flow, unchanged.

## Error handling

- KV unreachable: `analysis-gate` fails open to `{ allowed: true, tier: 'free' }` rather than blocking legitimate free use over an infra hiccup — logged, not surfaced to the user. (Mirrors this app's existing philosophy of degrading gracefully rather than hard-failing on non-critical infra, same as the rest of `api/*.js`.)
- Free 3-section report generation failing: shown as an inline error in the mini-report area, doesn't block the verdict/debate the user already got.
- Everything payment-related keeps the existing pattern: server-side verification only, never trust a client-supplied "I paid" flag.

## Testing

- `analysis-gate.js`: unit-style checks (or manual curl, matching how `checkout.js`/`verify-checkout.js` were smoke-tested) for the free→extra→blocked progression and the fail-open behavior.
- `consensus.js`: existing classify function gets new fixtures for the new per-director vocabulary; verify no director silently falls through to `sinDato` after the rewrite (that was the whole reason the per-director rule tables exist instead of one generic list).
- Manual pass in the browser: exhaust 2 free analyses, confirm the 3rd is blocked with the unlock CTA, buy análisis extra (can use a real low-value purchase, refundable via Stripe dashboard, same as offered for the informe completo flow), confirm the 3rd goes through and the counter behaves.

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import DebateChat from './components/DebateChat.jsx'
import DirectorModal from './components/DirectorModal.jsx'
import DirectorsRoster from './components/DirectorsRoster.jsx'
import VerdictPanel from './components/VerdictPanel.jsx'
import DownloadBanner from './components/DownloadBanner.jsx'
import DailyLimitBanner from './components/DailyLimitBanner.jsx'
import ReportModal from './components/ReportModal.jsx'
import ChairmanChat from './components/ChairmanChat.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import PrivateAccessModal from './components/PrivateAccessModal.jsx'
import { useBoard } from './hooks/useBoard.js'
import { useContextBuilder } from './hooks/useContext.js'
import { useReport } from './hooks/useReport.js'
import { useChairmanChat } from './hooks/useChairmanChat.js'
import ContextPanel from './components/ContextPanel.jsx'
import { DIRECTORS, MEETING_TYPES, selectDirectorsForMeeting, orderForDebate } from './lib/directors.js'
import { computeConsensus } from './lib/consensus.js'
import { I18nProvider, useI18n } from './lib/i18n.js'

const STORAGE_KEY = 'junta_api_key'
const STORAGE_PROVIDER_KEY = 'junta_api_provider'
const CREDITS_KEY = 'junta_report_credits'
const MAX_CHARS = 2000
const PREMIUM_ACCESS_KEY = 'junta_premium_access'
// Claves de sessionStorage para sobrevivir la navegación completa de página que hace el
// redirect a Stripe Checkout — todo el estado de React se pierde en ese salto, así que lo
// que haga falta para retomar la sesión al volver se guarda aquí justo antes de redirigir.
const PENDING_REPORT_KEY = 'junta_pending_report_context'
const PENDING_SITUATION_KEY = 'junta_pending_situation'

// Etiquetas del "perfil rápido" para el texto que se inyecta en `situation` — siempre en
// español, igual que el resto del contexto que leen los directores (el idioma solo afecta
// a los textos de la interfaz vía t()).
const PROFILE_STRUCTURE_TEXT = { solo: 'una sola persona (solopreneur)', team: 'equipo pequeño de 2 a 5 personas' }
const PROFILE_BUDGET_TEXT = { zero: '0€/mes, solo herramientas gratuitas', some: 'hasta 100-300€/mes' }
const PROFILE_HOURS_TEXT = { low: 'menos de 5 horas a la semana', high: '5 horas o más a la semana' }

// Interruptor de dos posiciones para el perfil rápido: mismo mecanismo que las píldoras
// (click en un lado la activa, click de nuevo la desactiva -> vuelve a null/"sin responder"),
// pero como un único track deslizante en vez de dos botones sueltos, para que ocupe menos
// espacio. Tres estados visuales: sin elegir (track neutro, thumb centrado), izquierda o
// derecha (track azul metalizado, thumb pegado a ese lado).
function ProfileToggle({ leftId, leftLabel, rightId, rightLabel, value, onChange }) {
  const isLeft = value === leftId
  const isRight = value === rightId
  const isSet = isLeft || isRight
  const thumbLeft = isLeft ? '4px' : isRight ? 'calc(100% - 34px)' : 'calc(50% - 15px)'
  const labelStyle = (active) => ({
    position: 'absolute', top: 0, width: '50%', height: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: active ? 700 : 500,
    color: active ? '#fff' : isSet ? 'rgba(255,255,255,0.6)' : 'var(--t3)',
    transition: 'color .2s ease', pointerEvents: 'none', padding: '0 6px', textAlign: 'center',
  })
  return (
    <div
      role="radiogroup"
      aria-label={`${leftLabel} / ${rightLabel}`}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const target = (e.clientX - rect.left) < rect.width / 2 ? leftId : rightId
        onChange(value === target ? null : target)
      }}
      style={{
        position: 'relative', width: '156px', height: '38px', borderRadius: '999px',
        cursor: 'pointer', userSelect: 'none', margin: '0 auto',
        background: isSet ? 'linear-gradient(135deg, var(--blue), var(--blue-lt))' : 'var(--bg3)',
        border: `1px solid ${isSet ? 'var(--blue-bd)' : 'var(--bd)'}`,
        transition: 'background .25s ease, border-color .25s ease',
      }}
    >
      <span style={{ ...labelStyle(isLeft), left: 0 }}>{leftLabel}</span>
      <span style={{ ...labelStyle(isRight), right: 0 }}>{rightLabel}</span>
      <div style={{
        position: 'absolute', top: '4px', left: thumbLeft, width: '30px', height: '30px',
        borderRadius: '50%', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        transition: 'left .25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }} />
    </div>
  )
}

function buildProfileLine(profile) {
  const parts = []
  if (profile.structure) parts.push(`Estructura: ${PROFILE_STRUCTURE_TEXT[profile.structure]}`)
  if (profile.budget) parts.push(`Presupuesto mensual en software: ${PROFILE_BUDGET_TEXT[profile.budget]}`)
  if (profile.hours) parts.push(`Disponibilidad semanal para implementar: ${PROFILE_HOURS_TEXT[profile.hours]}`)
  if (parts.length === 0) return ''
  return `PERFIL DEL CONSULTANTE (dato ya confirmado, no lo vuelvas a preguntar): ${parts.join('. ')}.`
}

export default function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  )
}

// Los mensajes de error del servidor (analysis-gate.js, coach.js) vienen en español fijo —
// cuando traen un `code` conocido se traducen aquí; el texto crudo del servidor solo se usa
// como último recurso para códigos de error que no forman parte del flujo de pago habitual.
const ERROR_CODE_KEYS = {
  NO_FREE_ANALYSES: 'gate.noFreeToday',
  NO_REPORT_CREDITS: 'gate.noReportCredits',
  PAYMENT_REQUIRED: 'gate.paymentRequired',
}

function AppInner() {
  const { lang, setLang, t } = useI18n()
  const localizeApiError = (data, fallbackKey) => {
    const codeKey = ERROR_CODE_KEYS[data?.code]
    return codeKey ? t(codeKey) : (data?.error || t(fallbackKey))
  }
  const [situation, setSituation]   = useState('')
  const [profile, setProfile] = useState({ structure: null, budget: null, hours: null })
  const [meetingType, setMeetingType] = useState('decision')
  const [selectedIds, setSelectedIds] = useState(() => selectDirectorsForMeeting('decision', DIRECTORS).map(d => d.id))
  const [apiKey, setApiKey]         = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [apiProvider, setApiProvider] = useState(() => localStorage.getItem(STORAGE_PROVIDER_KEY) || 'claude')
  const [showSettings, setShowSettings] = useState(false)
  const [selectedDirector, setSelectedDirector] = useState(null)
  const [privateAccess, setPrivateAccess] = useState(false)
  const [showPrivateAccess, setShowPrivateAccess] = useState(() => window.location.pathname === '/acceso-privado')

  const { conveneBoard, reset, retry, clearHistory, restoredSession, pause, resume, directorStates, verdict, verdictLoading, phase, activeDirectors, globalError, isPaused } = useBoard()
  const { items: ctxItems, addNote, processFile, processURL, removeItem: removeCtxItem,
          buildContextBlock, buildSituationBrief, hasContext, isProcessing: ctxProcessing } = useContextBuilder()
  const { report, loading: reportLoading, error: reportError, generateReport, reset: resetReport } = useReport()
  const [showReport, setShowReport] = useState(false)
  const { messages: chatMessages, sending: chatSending, error: chatError, freeMessagesUsed, sendMessage: sendChatMessage, reset: resetChat } = useChairmanChat()

  const [reportCredits, setReportCredits] = useState(() => Number(localStorage.getItem(CREDITS_KEY) || 0))
  const [buyingReport, setBuyingReport] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)
  const [gateError, setGateError] = useState(null)
  const [gateChecking, setGateChecking] = useState(false)
  const [buyingExtra, setBuyingExtra] = useState(false)
  const [boardMode, setBoardMode] = useState('fast')
  const [premiumAccess, setPremiumAccess] = useState(() => localStorage.getItem(PREMIUM_ACCESS_KEY) === 'true')
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  useEffect(() => {
    if (!restoredSession?.situation) return
    setSituation(restoredSession.situation)
    setMeetingType(restoredSession.meetingType || 'decision')
    if (restoredSession.directors?.length) setSelectedIds(restoredSession.directors.map(d => d.id))
  }, [restoredSession])

  useEffect(() => {
    if (!showPrivateAccess) return
    fetch('/api/private-access').then(res => res.json()).then(data => {
      if (data.authorized) {
        setPrivateAccess(true)
        setShowPrivateAccess(false)
        setShowSettings(true)
        window.history.replaceState({}, '', '/')
      }
    }).catch(() => {})
  }, [showPrivateAccess])

  const addReportCredits = useCallback((n) => {
    setReportCredits(prev => {
      const next = prev + n
      localStorage.setItem(CREDITS_KEY, String(next))
      return next
    })
  }, [])

  // Al volver de Stripe Checkout, confirma el pago server-side y desbloquea el informe.
  // El checkout_session_id se mantiene en la URL mientras la verificación está en curso
  // (valor informativo / permite reintentar a mano si algo falla) y solo se retira una vez
  // se conoce el resultado — no antes.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('checkout_session_id')
    if (!sessionId) return

    const clearUrl = () => window.history.replaceState({}, '', window.location.pathname)

    ;(async () => {
      try {
        const res = await fetch('/api/verify-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        const data = await res.json()
        if (!data.paid) { setCheckoutError(t('checkout.notCompleted')); return }

        if (data.product === 'extra') {
          const grantRes = await fetch('/api/analysis-gate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'grant-extra', sessionId }),
          })
          const grant = await grantRes.json()
          // alreadyGranted (replay de una sesión ya canjeada) no es un error: el usuario ya
          // tiene su crédito de una carga anterior de esta misma pantalla — no hace falta
          // asustarle con un mensaje de soporte.
          if (grant.granted || grant.alreadyGranted) {
            setGateError(null)
            try {
              const raw = sessionStorage.getItem(PENDING_SITUATION_KEY)
              if (raw) {
                const parsed = JSON.parse(raw)
                if (parsed.situation != null) setSituation(parsed.situation)
                if (parsed.meetingType) setMeetingType(parsed.meetingType)
                if (parsed.selectedIds) setSelectedIds(parsed.selectedIds)
              }
            } catch {}
            sessionStorage.removeItem(PENDING_SITUATION_KEY)
          } else {
            setCheckoutError(t('checkout.confirmedNotActivated'))
          }
        } else {
          // El crédito y el acceso premium se acreditan server-side (KV), verificados contra
          // Stripe — no basta con que /api/verify-checkout diga "paid" para dárselos por
          // buenos aquí: eso es justo lo que dejaba generar el informe gratis con solo tocar
          // localStorage. grant-report es quien realmente los concede.
          const grantRes = await fetch('/api/analysis-gate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'grant-report', sessionId }),
          })
          const grant = await grantRes.json()

          if (grant.granted) {
            localStorage.setItem(PREMIUM_ACCESS_KEY, 'true')
            setPremiumAccess(true)
            localStorage.setItem(CREDITS_KEY, String(grant.credits))
            setReportCredits(grant.credits)
            setGateError(null)
          } else if (!grant.alreadyGranted) {
            setCheckoutError(t('checkout.confirmedNotActivated'))
            return
          }
          // alreadyGranted (replay de una sesión ya canjeada): el usuario ya tiene su
          // crédito y acceso de una carga anterior de esta misma pantalla, no hace falta
          // repetir el aviso ni bloquearle.

          // Si esta compra viene del CTA de "informe completo" dentro de un debate ya
          // terminado, retoma ese contexto y genera el informe de inmediato sobre el
          // análisis para el que se compró, en vez de dejar al usuario en la pantalla
          // inicial con el crédito sin usar. El gasto real del crédito lo hace el propio
          // generateReport contra el servidor, no este efecto.
          try {
            const raw = sessionStorage.getItem(PENDING_REPORT_KEY)
            if (raw) {
              const parsed = JSON.parse(raw)
              if (parsed.situation != null) setSituation(parsed.situation)
              addReportCredits(-1) // solo refleja en pantalla el crédito que generateReport va a consumir de inmediato en el servidor
              setShowReport(true)
              generateReport({ ...parsed, apiKey: null, provider: 'claude', tier: 'paid', lang })
            }
          } catch {}
          sessionStorage.removeItem(PENDING_REPORT_KEY)
        }
      } catch {
        setCheckoutError(t('checkout.couldNotVerify'))
      } finally {
        clearUrl()
      }
    })()
  }, [addReportCredits, generateReport])

  const consensus = useMemo(() => computeConsensus(directorStates), [directorStates])

  const handleGenerateReport = () => {
    if (reportCredits <= 0) return
    addReportCredits(-1)
    setShowReport(true)
    generateReport({ situation, meetingType, activeDirectors, directorStates, verdict, apiKey: apiKey || null, provider: apiProvider, lang })
  }

  const handleBuyReport = async (product) => {
    setCheckoutError(null)
    setBuyingReport(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('checkout.createFailed'))
      // El redirect a Stripe es una navegación completa: se pierde todo el estado de React.
      // Si ya hay un debate terminado, se guarda para poder retomarlo y gastar el crédito
      // recién comprado sobre él en cuanto se vuelva (ver el efecto de checkout_session_id).
      if (isDone && verdict) {
        try {
          sessionStorage.setItem(PENDING_REPORT_KEY, JSON.stringify({ situation, meetingType, activeDirectors, directorStates, verdict }))
        } catch {}
      }
      window.location.href = data.url
    } catch (err) {
      setCheckoutError(err.message)
      setBuyingReport(false)
    }
  }

  const handleSendChat = (text, attachments = []) => {
    sendChatMessage(text, attachments, { situation, activeDirectors, directorStates, verdict }, { apiKey: apiKey || null, provider: apiProvider })
  }

  const toggleDirector = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleMeetingTypeChange = (id) => {
    setMeetingType(id)
    setSelectedIds(selectDirectorsForMeeting(id, DIRECTORS).map(d => d.id))
  }

  const isIdle     = phase === 'idle'
  const isRunning  = !isIdle && phase !== 'done'
  const isDone     = phase === 'done'

  const doneCount  = Object.values(directorStates).filter(s => s.status === 'done').length
  const totalCount = activeDirectors.length

  const handleConvene = useCallback(async () => {
    const writtenSituation = situation.trim()
    const contextBrief = buildSituationBrief()
    if ((!writtenSituation && !contextBrief) || !isIdle || selectedIds.length === 0) return
    setGateError(null)

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
          setGateError(localizeApiError(data, 'gate.noFreeToday'))
          return
        }
      } catch {
        setGateChecking(false)
      }
    }

    const directors = orderForDebate(selectedIds, DIRECTORS)
    const baseSituation = writtenSituation || `Analiza el proyecto descrito en los documentos y fuentes de apoyo.\n\n${contextBrief}`
    const profileLine = buildProfileLine(profile)
    const effectiveSituation = profileLine ? `${profileLine}\n\n${baseSituation}` : baseSituation
    await conveneBoard({ directors, situation: effectiveSituation, meetingType, contextBlock: buildContextBlock(), apiKey: apiKey || null, provider: apiProvider, mode: boardMode })
  }, [situation, meetingType, selectedIds, apiKey, apiProvider, boardMode, isIdle, conveneBoard, buildContextBlock, buildSituationBrief, profile])

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
      if (!res.ok) throw new Error(data.error || t('checkout.createFailed'))
      // Igual que en handleBuyReport: se pierde el estado de React en el redirect. Aquí no
      // hay debate que retomar, pero al menos se evita que el usuario tenga que reescribir
      // lo que ya había tecleado.
      try {
        sessionStorage.setItem(PENDING_SITUATION_KEY, JSON.stringify({ situation, meetingType, selectedIds }))
      } catch {}
      window.location.href = data.url
    } catch (err) {
      setCheckoutError(err.message)
      setBuyingExtra(false)
    }
  }

  const handleReset = () => {
    reset(); resetReport(); resetChat(); setShowReport(false); setSituation('')
    setGateError(null); setProfile({ structure: null, budget: null, hours: null })
  }
  const handleSaveKey = (provider, key) => {
    localStorage.setItem(STORAGE_KEY, key)
    localStorage.setItem(STORAGE_PROVIDER_KEY, key ? provider : 'claude')
    setApiKey(key)
    setApiProvider(key ? provider : 'claude')
  }
  const handleDeleteSession = () => {
    clearHistory(); resetReport(); resetChat(); setShowReport(false); setSituation(''); setGateError(null)
    setProfile({ structure: null, budget: null, hours: null })
  }
  const handlePrivateGranted = () => {
    setPrivateAccess(true)
    setShowPrivateAccess(false)
    setShowSettings(true)
    window.history.replaceState({}, '', '/')
  }

  // Extrae el voto de un director del texto generado
  const getDirectorVote = (dirId) => {
    const state = directorStates[dirId]
    if (!state?.text) return null
    const lines = state.text.split('\n').filter(l => l.trim())
    const keywords = ['convicción', 'voto:', 'posición:', 'evaluación:', 'veredicto:']
    for (const line of lines.slice(-5)) {
      if (keywords.some(k => line.toLowerCase().includes(k))) return line.trim()
    }
    return null
  }

  if (showPrivateAccess) return <PrivateAccessModal onGranted={handlePrivateGranted} />

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* NAV */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(6,13,31,0.96)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--bd)',
        padding: '0 28px', height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', background: 'var(--blue-dim)', border: '1px solid var(--blue-bd)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🏛️</div>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--t1)', letterSpacing: '-.01em' }}>Junta Directiva</span>
          <span style={{ fontSize: '11px', color: 'var(--t3)', marginLeft: '2px' }}>AI Board</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isRunning && (
            <span style={{ fontSize: '12px', color: 'var(--blue)', padding: '4px 12px', borderRadius: '20px', background: 'var(--blue-dim)', border: '1px solid var(--blue-bd)' }}>
              {phase === 'convening' ? t('nav.convening') : phase === 'debating' ? (isPaused ? `${t('nav.paused')} · ${doneCount}/${totalCount}` : `${t('nav.working')} · ${doneCount}/${totalCount}`) : phase === 'contrasting' ? t('nav.contrasting') : t('nav.verdict')}
            </span>
          )}
          {phase === 'debating' && (
            <button
              onClick={isPaused ? resume : pause}
              title={isPaused ? t('nav.resumeTitle') : t('nav.pauseTitle')}
              style={{ padding: '6px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--bd)', color: 'var(--t3)', fontSize: '13px' }}
            >
              {isPaused ? '▶️' : '⏸️'}
            </button>
          )}
          <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '20px', border: '1px solid var(--bd)', color: 'var(--t3)', background: 'transparent' }}>
            🌐 {t('nav.freeAnalyses')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--bd)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
            <button
              onClick={() => setLang('en')}
              title="English"
              style={{ padding: '6px 9px', fontSize: '11px', fontWeight: 600, border: 'none', background: lang === 'en' ? 'var(--blue-dim)' : 'transparent', color: lang === 'en' ? 'var(--blue)' : 'var(--t3)' }}
            >
              EN
            </button>
            <button
              onClick={() => setLang('es')}
              title="Español"
              style={{ padding: '6px 9px', fontSize: '11px', fontWeight: 600, border: 'none', background: lang === 'es' ? 'var(--blue-dim)' : 'transparent', color: lang === 'es' ? 'var(--blue)' : 'var(--t3)' }}
            >
              ES
            </button>
          </div>
        </div>
      </nav>

      <main style={{ flex: 1, maxWidth: '860px', margin: '0 auto', padding: '52px 24px 64px', width: '100%' }}>

        {/* ── PANTALLA INICIAL ── */}
        {isIdle && (
          <div className="home-flow">
            {/* Hero */}
            <div className="fade-up home-hero" style={{ textAlign: 'center', marginBottom: '36px' }}>
              <p style={{ fontSize: '11px', color: 'var(--blue)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: '16px', fontWeight: 500 }}>
                {t('hero.kicker')}
              </p>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(34px, 5vw, 58px)', fontWeight: 400, lineHeight: 1.1, marginBottom: '18px', color: 'var(--t1)' }}>
                {t('board.title')}
              </h1>
              <p style={{ fontSize: '16px', color: 'var(--t2)', maxWidth: '480px', margin: '0 auto', lineHeight: 1.7 }}>
                {t('board.subtitle')}
              </p>
            </div>

            {/* Franja de "dolores reales" del solopreneur, resueltos en una línea cada uno —
                da cuerpo al hero sin convertirlo en un muro de texto único. */}
            <div className="fade-up" style={{
              order: 1, marginBottom: '36px', display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px',
              maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto',
            }}>
              {[
                { emoji: '😮‍💨', title: t('pain.lonelyTitle'), body: t('pain.lonelyBody') },
                { emoji: '🌀', title: t('pain.overloadTitle'), body: t('pain.overloadBody') },
                { emoji: '💶', title: t('pain.spendTitle'), body: t('pain.spendBody') },
              ].map((p, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '20px 16px', border: '1px solid var(--bd)', borderRadius: 'var(--r-md)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: '22px', marginBottom: '10px' }}>{p.emoji}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--t1)', marginBottom: '6px' }}>{p.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--t3)', lineHeight: 1.5 }}>{p.body}</div>
                </div>
              ))}
            </div>

            {/* El elenco — pills seleccionables: quién participa en esta sesión */}
            <div className="fade-up board-customization" style={{ marginBottom: '48px', animationDelay: '.08s' }}>
              <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '14px', textAlign: 'center', fontWeight: 500 }}>
                {t('board.chooseParticipants').replace('{specialists}', DIRECTORS.length).replace('{selected}', selectedIds.length)}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--t2)', textAlign: 'center', margin: '-5px auto 16px', maxWidth: '520px' }}>
                {t('board.chooseHint')}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {DIRECTORS.map(d => {
                  const isOn = selectedIds.includes(d.id)
                  const isJottarina = d.id === 'jottarina'
                  const activeBorder = isJottarina ? 'var(--red-bd)' : 'var(--blue-bd)'
                  const activeColor  = isJottarina ? 'var(--red)' : 'var(--blue)'
                  const activeBg     = isJottarina ? 'var(--red-dim)' : 'var(--blue-dim)'
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggleDirector(d.id)}
                      title={(isOn ? t('board.removeDirector') : t('board.includeDirector')).replace('{name}', d.name)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '7px',
                        padding: '7px 14px', borderRadius: '24px',
                        border: `1px solid ${isOn ? activeBorder : 'var(--bd)'}`,
                        background: isOn ? activeBg : 'rgba(255,255,255,0.03)',
                        color: isOn ? activeColor : 'var(--t3)',
                        opacity: isOn ? 1 : 0.55,
                        cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                        transition: 'all .15s',
                      }}
                    >
                      <span>{d.emoji}</span>
                      <span>{d.name}</span>
                      <span style={{ fontWeight: 400, opacity: .7, fontSize: '11px' }}>· {d.tags[0]}</span>
                      {!isOn && <span style={{ fontSize: '11px' }}>✕</span>}
                    </button>
                  )
                })}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--t3)', textAlign: 'center', marginTop: '10px' }}>
                {boardMode === 'fast' ? t('board.fastNote') : t('board.deepNote')}
              </p>
            </div>

            {/* Formulario */}
            <div className="fade-up composer-card" style={{ animationDelay: '.14s', background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r-xl)', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="meeting-type">
                <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 500 }}>{t('form.meetingType')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                  {MEETING_TYPES.map(mt => (
                    <button key={mt.id} onClick={() => handleMeetingTypeChange(mt.id)}
                      style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', textAlign: 'left', border: `1px solid ${meetingType === mt.id ? 'var(--blue-bd)' : 'var(--bd)'}`, background: meetingType === mt.id ? 'var(--blue-dim)' : 'var(--bg3)', transition: 'all .2s' }}>
                      <div style={{ fontSize: '16px', marginBottom: '4px' }}>{mt.icon}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: meetingType === mt.id ? 'var(--blue)' : 'var(--t1)', marginBottom: '2px' }}>{t(`meeting.${mt.id}`)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>{t(`meeting.${mt.id}Desc`)}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Perfil rápido (opcional): se inyecta en `situation` vía buildProfileLine
                  (arriba) para que los directores no tengan que preguntar tiempo/presupuesto
                  dentro del debate. Debajo de "Tipo de reunión", antes de la situación. */}
              <div className="profile-field" style={{ textAlign: 'center', paddingTop: '4px', borderTop: '1px solid var(--bd)' }}>
                <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: '18px', marginBottom: '6px', fontWeight: 500 }}>
                  {t('profile.label')}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '16px', lineHeight: 1.5, maxWidth: '460px', marginLeft: 'auto', marginRight: 'auto' }}>
                  {t('profile.hint')}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '24px' }}>
                  {[
                    { key: 'structure', label: t('profile.structureLabel'), options: [['solo', t('profile.structureSolo')], ['team', t('profile.structureTeam')]] },
                    { key: 'budget', label: t('profile.budgetLabel'), options: [['zero', t('profile.budgetZero')], ['some', t('profile.budgetSome')]] },
                    { key: 'hours', label: t('profile.hoursLabel'), options: [['low', t('profile.hoursLow')], ['high', t('profile.hoursHigh')]] },
                  ].map(group => (
                    <div key={group.key} style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '9px', fontWeight: 500 }}>{group.label}</p>
                      <ProfileToggle
                        leftId={group.options[0][0]} leftLabel={group.options[0][1]}
                        rightId={group.options[1][0]} rightLabel={group.options[1][1]}
                        value={profile[group.key]}
                        onChange={(id) => setProfile(prev => ({ ...prev, [group.key]: id }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="situation-field">
                <p style={{ fontSize: '11px', color: 'var(--blue)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 700 }}>{t('form.situationLabel')}</p>
                <textarea
                  id="board-situation"
                  value={situation}
                  onChange={e => setSituation(e.target.value.slice(0, MAX_CHARS))}
                  placeholder={t('form.situationPlaceholder')}
                  maxLength={MAX_CHARS}
                  aria-describedby="board-situation-hint board-situation-count"
                  rows={5}
                  style={{ width: '100%', padding: '16px', background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 'var(--r-md)', color: 'var(--t1)', fontSize: '15px', lineHeight: 1.7, resize: 'vertical', outline: 'none', transition: 'border-color .2s', minHeight: '130px' }}
                  onFocus={e => e.target.style.borderColor = 'var(--blue-bd)'}
                  onBlur={e => e.target.style.borderColor = 'var(--bd)'}
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleConvene() }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <span id="board-situation-hint" style={{ fontSize: '11px', color: 'var(--t3)' }}>{t('form.cmdEnterHint')}</span>
                  <span id="board-situation-count" style={{ fontSize: '11px', color: 'var(--t3)' }}>{situation.length}/{MAX_CHARS}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '12px' }}>
                  {[
                    t('form.exampleHire'),
                    t('form.exampleLaunch'),
                    t('form.exampleInvest'),
                    t('form.exampleCrisis'),
                  ].map(example => (
                    <button key={example} type="button" onClick={() => setSituation(example)} style={{ padding: '6px 10px', border: '1px solid var(--bd)', borderRadius: '20px', color: 'var(--t2)', background: 'var(--bg3)', fontSize: '11px', textAlign: 'left' }}>
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              <fieldset className="board-mode-field" style={{ border: 0, padding: 0 }}>
                <legend style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 500 }}>
                  {t('form.deliberationPace')}
                  <span style={{ marginLeft: '6px', fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid var(--blue-bd)', textTransform: 'none', letterSpacing: 'normal', fontWeight: 600 }}>
                    {t('form.deliberationPaceHint')}
                  </span>
                </legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                  <button type="button" onClick={() => setBoardMode('fast')} aria-pressed={boardMode === 'fast'} style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', border: `1px solid ${boardMode === 'fast' ? 'var(--blue-bd)' : 'var(--bd)'}`, background: boardMode === 'fast' ? 'var(--blue-dim)' : 'var(--bg3)', color: 'var(--t1)', textAlign: 'left' }}><strong style={{ fontSize: '13px', color: 'var(--blue)' }}>{t('form.fastBoard')}</strong><span style={{ display: 'block', marginTop: '3px', fontSize: '11px', color: 'var(--t2)' }}>{t('form.fastBoardDesc')}</span></button>
                  <button type="button" onClick={() => (premiumAccess || apiKey || privateAccess) && setBoardMode('deep')} aria-pressed={boardMode === 'deep'} style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', border: `1px solid ${boardMode === 'deep' ? 'var(--blue-bd)' : 'var(--bd)'}`, background: boardMode === 'deep' ? 'var(--blue-dim)' : 'var(--bg3)', color: 'var(--t1)', textAlign: 'left', opacity: premiumAccess || apiKey || privateAccess ? 1 : .62 }}><strong style={{ fontSize: '13px', color: 'var(--blue)' }}>{t('form.deepBoard')} {!(premiumAccess || apiKey || privateAccess) && t('form.deepBoardPremium')}</strong><span style={{ display: 'block', marginTop: '3px', fontSize: '11px', color: 'var(--t2)' }}>{t('form.deepBoardDesc')}</span></button>
                </div>
                {!(premiumAccess || apiKey || privateAccess) && <p style={{ marginTop: '7px', fontSize: '11px', color: 'var(--t3)' }}>{t('form.deepBoardHint')}</p>}
              </fieldset>

              {/* Panel de contexto enriquecido */}
              <div className="context-field">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                  <p style={{ fontSize:'11px', color:'var(--t3)', letterSpacing:'.08em', textTransform:'uppercase', fontWeight:500 }}>
                    {t('context.label')}
                    <span style={{ marginLeft:'6px', fontSize:'10px', padding:'2px 7px', borderRadius:'4px', background:'var(--blue-dim)', color:'var(--blue)', border:'1px solid var(--blue-bd)' }}>
                      {t('context.optional')}
                    </span>
                  </p>
                  {hasContext && (
                    <span style={{ fontSize:'11px', color:'var(--blue)' }}>
                      {ctxItems.filter(i => i.status === 'done').length} {ctxItems.filter(i => i.status === 'done').length !== 1 ? t('context.sourcesReadyPlural') : t('context.sourcesReady')}
                    </span>
                  )}
                </div>
                <ContextPanel
                  items={ctxItems}
                  onProcessFile={(f) => processFile(f, apiKey||null, apiProvider)}
                  onProcessURL={(url) => processURL(url, apiKey||null, apiProvider)}
                  onAddNote={(text) => addNote(text, apiKey||null, apiProvider)}
                  onRemove={removeCtxItem}
                  isProcessing={ctxProcessing}
                />
              </div>

              <p className="privacy-note" style={{ fontSize: '11px', color: 'var(--t3)', lineHeight: 1.55 }}>{t('form.privacyNote')}</p>

              <button
                onClick={handleConvene}
                disabled={(!situation.trim() && !hasContext) || ctxProcessing || gateChecking || selectedIds.length === 0}
                style={{ padding: '17px', borderRadius: 'var(--r-md)', border: 'none', background: ((situation.trim() || hasContext) && selectedIds.length > 0) ? 'var(--blue)' : 'var(--bg3)', color: ((situation.trim() || hasContext) && selectedIds.length > 0) ? 'var(--bg0)' : 'var(--t3)', fontSize: '15px', fontWeight: 700, cursor: ((situation.trim() || hasContext) && selectedIds.length > 0) ? 'pointer' : 'not-allowed', transition: 'all .2s', letterSpacing: '.02em' }}
              >
                {selectedIds.length === 0 ? t('form.chooseAtLeastOne') : gateChecking ? t('form.checkingAvailability') : `🏛️ ${t('action.convene')}`}
              </button>

              {gateError && (
                <DailyLimitBanner error={gateError} onBuyExtra={handleBuyExtra} buying={buyingExtra} />
              )}

              <p className="free-mode-note" style={{ fontSize: '12px', color: 'var(--t3)', textAlign: 'center' }}>{t('form.freeMode')}</p>
            </div>

            <section className="board-overview fade-up" aria-labelledby="overview-title" style={{ animationDelay: '.18s' }}>
              <div>
                <p className="eyebrow">{t('overview.kicker')}</p>
                <h2 id="overview-title">{t('overview.title')}</h2>
              </div>
              <ol className="board-overview__steps">
                <li><span>01</span><div><strong>{t('overview.stepOne')}</strong><p>{t('overview.stepOneDesc')}</p></div></li>
                <li><span>02</span><div><strong>{t('overview.stepTwo')}</strong><p>{t('overview.stepTwoDesc')}</p></div></li>
                <li><span>03</span><div><strong>{t('overview.stepThree')}</strong><p>{t('overview.stepThreeDesc')}</p></div></li>
              </ol>
            </section>

          </div>
        )}

        {/* ── DEBATE / RESULTADOS ── */}
        {(isRunning || isDone) && (
          <div>
            {!online && <div role="alert" style={{ marginBottom: '18px', padding: '13px 16px', borderLeft: '2px solid var(--amber)', background: 'rgba(245,180,60,.08)', color: 'var(--t2)', fontSize: '13px' }}>{t('errors.offline')}</div>}
            {/* Header sesión */}
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '11px', color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 500 }}>
                  {phase === 'convening' ? t('nav.convening') : phase === 'debating' ? t('status.debating').replace('{done}', doneCount).replace('{total}', totalCount) : phase === 'contrasting' ? t('status.contrasting') : phase === 'verdict' ? t('status.verdictLoading') : t('status.done')}
                </p>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: 400, color: 'var(--t1)', lineHeight: 1.3, maxWidth: '580px', fontStyle: 'italic' }}>
                  "{situation.slice(0, 110)}{situation.length > 110 ? '…' : ''}"
                </h2>
              </div>
              {isDone && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}><button onClick={handleReset} style={{ padding: '9px 18px', borderRadius: 'var(--r-sm)', border: '1px solid var(--bd)', color: 'var(--t2)', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 }}>{t('action.newSessionShort')}</button><button onClick={handleDeleteSession} style={{ padding: '9px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--red-bd)', color: 'var(--red)', fontSize: '12px' }}>{t('action.deleteSession')}</button></div>}
            </div>

            {/* Error */}
            {globalError && (
              <div style={{ padding: '14px 18px', background: 'var(--red-dim)', border: '1px solid var(--red-bd)', borderRadius: 'var(--r-md)', color: 'var(--red)', fontSize: '13px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <span>⚠️ {globalError}</span>
                <button onClick={retry} style={{ color: 'var(--red)', textDecoration: 'underline', fontWeight: 700 }}>{t('errors.retry')}</button>
              </div>
            )}

            {/* Conversación de la junta */}
            <div style={{ marginBottom: '32px' }}>
              <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '18px', fontWeight: 500 }}>
                {t('board.conversationLabel')}
              </p>
              <DebateChat directors={activeDirectors} directorStates={directorStates} phase={phase} onClickDirector={setSelectedDirector} />
            </div>

            {Object.values(directorStates).some(state => state.status === 'error') && doneCount > 0 && <p style={{ margin: '-12px 0 24px', padding: '11px 14px', borderLeft: '2px solid var(--amber)', background: 'rgba(245,180,60,.08)', color: 'var(--t2)', fontSize: '12px', lineHeight: 1.5 }}>{t('errors.partial')}</p>}

            {/* Veredicto — la conclusión, al final de la conversación */}
            {(verdict || verdictLoading) && (
              <div style={{ marginBottom: '28px' }}>
                <VerdictPanel text={verdict} loading={verdictLoading} consensus={isDone ? consensus : null} />
              </div>
            )}

            {/* Banner informe completo — aparece cuando hay veredicto */}
            {isDone && verdict && (
              <div style={{ marginBottom: '28px' }}>
                <DownloadBanner
                  loading={reportLoading}
                  credits={reportCredits}
                  onGenerate={handleGenerateReport}
                  onBuy={handleBuyReport}
                  buying={buyingReport}
                />
                {checkoutError && (
                  <p style={{ fontSize: '12px', color: 'var(--red)', marginTop: '10px' }}>⚠️ {checkoutError}</p>
                )}
              </div>
            )}

            {/* Chat de seguimiento con el Chairman — después del veredicto */}
            {isDone && verdict && (
              <section style={{ marginBottom: '16px', padding: '18px 20px', border: '1px solid var(--blue-bd)', borderRadius: 'var(--r-md)', background: 'linear-gradient(135deg, var(--blue-dim), rgba(35,190,174,.08))' }} aria-labelledby="chairman-feature-title">
                <p style={{ fontSize: '10px', color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '5px' }}>{t('chairman.featureKicker')}</p>
                <h3 id="chairman-feature-title" style={{ fontSize: '17px', color: 'var(--t1)', marginBottom: '6px' }}>{t('chairman.featureTitle')}</h3>
                <p style={{ fontSize: '13px', color: 'var(--t2)', lineHeight: 1.55 }}>{t('chairman.featureDesc')}</p>
              </section>
            )}

            {isDone && verdict && (
              <ChairmanChat
                messages={chatMessages}
                sending={chatSending}
                error={chatError}
                freeMessagesUsed={freeMessagesUsed}
                hasKey={!!apiKey}
                premiumAccess={premiumAccess || !!apiKey || privateAccess}
                onSend={handleSendChat}
                situation={situation}
              />
            )}

            {isDone && (
              <div style={{ textAlign: 'center', marginTop: '48px' }}>
                <button onClick={handleReset} style={{ padding: '13px 32px', borderRadius: 'var(--r-md)', border: '1px solid var(--blue-bd)', background: 'var(--blue-dim)', color: 'var(--blue)', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                  🏛️ {t('action.newSession')}
                </button>
                <p style={{ marginTop: '14px', fontSize: '11px', color: 'var(--t3)', lineHeight: 1.5 }}>{t('footer.bottomPrivacy')}</p>
              </div>
            )}
          </div>
        )}

        <DirectorsRoster directors={DIRECTORS} onClickDirector={setSelectedDirector} />

        <footer className="site-footer" aria-label="Información del sitio">
          <div className="site-footer__topline"><div><p className="site-footer__product">{t('footer.product')}</p><p className="site-footer__tagline">{t('footer.tagline')}</p></div><nav className="site-footer__links" aria-label={t('footer.linksLabel')}><a href="https://jsantos.pro/" target="_blank" rel="noreferrer">Jota Santos</a><a href="https://iapacks.com/" target="_blank" rel="noreferrer">IA Packs</a></nav></div>
          <details className="site-footer__legal"><summary>{t('footer.disclaimerSummary')}</summary><div className="site-footer__legal-copy"><p><strong>{t('footer.disclaimerLabel')}</strong> {t('footer.disclaimer')}</p><p><strong>{t('footer.useLabel')}</strong> {t('footer.use')}</p><p><strong>{t('footer.rightsLabel')}</strong> {t('footer.rights')}</p></div></details>
        </footer>
      </main>

      {/* Reabrir el informe ya generado — top-level e independiente de isDone/verdict/phase
          para que también funcione tras un reload (p.ej. al volver de Stripe con un informe
          de pago recién restaurado desde sessionStorage), no solo dentro de una sesión de
          debate activa. */}
      {report && !showReport && (
        <button
          onClick={() => setShowReport(true)}
          style={{
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 90,
            padding: '10px 18px', borderRadius: '24px',
            background: 'var(--blue-dim)', border: '1px solid var(--blue-bd)',
            color: 'var(--blue)', fontSize: '12px', fontWeight: 600,
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          }}
        >
          📄 {report.locked ? 'Ver ampliación gratuita' : 'Ver informe'}
        </button>
      )}

      {/* Modals */}
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
      {privateAccess && showSettings && <SettingsModal currentProvider={apiProvider} currentKey={apiKey} onSave={handleSaveKey} onClose={() => setShowSettings(false)} />}
      {selectedDirector && (
        <DirectorModal
          director={selectedDirector}
          sessionVote={getDirectorVote(selectedDirector.id)}
          onClose={() => setSelectedDirector(null)}
        />
      )}
    </div>
  )
}

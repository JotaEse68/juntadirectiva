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

export default function App() {
  const [situation, setSituation]   = useState('')
  const [meetingType, setMeetingType] = useState('decision')
  const [selectedIds, setSelectedIds] = useState(() => selectDirectorsForMeeting('decision', DIRECTORS).map(d => d.id))
  const [apiKey, setApiKey]         = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [apiProvider, setApiProvider] = useState(() => localStorage.getItem(STORAGE_PROVIDER_KEY) || 'claude')
  const [showSettings, setShowSettings] = useState(false)
  const [selectedDirector, setSelectedDirector] = useState(null)
  const [privateAccess, setPrivateAccess] = useState(false)
  const [showPrivateAccess, setShowPrivateAccess] = useState(() => window.location.pathname === '/acceso-privado')

  const { conveneBoard, reset, pause, resume, directorStates, verdict, verdictLoading, phase, activeDirectors, globalError, isPaused } = useBoard()
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
        if (!data.paid) { setCheckoutError('El pago no se completó.'); return }

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
            setCheckoutError('El pago se confirmó pero no se pudo activar. Contacta soporte.')
          }
        } else {
          localStorage.setItem(PREMIUM_ACCESS_KEY, 'true')
          setPremiumAccess(true)
          addReportCredits(data.product === 'bundle' ? 3 : 1)
          // Si esta compra viene del CTA de "informe completo" dentro de un debate ya
          // terminado, retoma ese contexto y gasta el crédito recién añadido de inmediato
          // sobre el análisis para el que se compró, en vez de dejar al usuario en la
          // pantalla inicial con un crédito sin usar.
          try {
            const raw = sessionStorage.getItem(PENDING_REPORT_KEY)
            if (raw) {
              const parsed = JSON.parse(raw)
              if (parsed.situation != null) setSituation(parsed.situation)
              addReportCredits(-1)
              setShowReport(true)
              generateReport({ ...parsed, apiKey: null, provider: 'claude', tier: 'paid' })
            }
          } catch {}
          sessionStorage.removeItem(PENDING_REPORT_KEY)
        }
      } catch {
        setCheckoutError('No se pudo verificar el pago.')
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
    generateReport({ situation, meetingType, activeDirectors, directorStates, verdict, apiKey: apiKey || null, provider: apiProvider })
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
      if (!res.ok) throw new Error(data.error || 'Error creando el pago')
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
          setGateError(data.error || 'Sin análisis gratis hoy.')
          return
        }
      } catch {
        setGateChecking(false)
      }
    }

    const directors = orderForDebate(selectedIds, DIRECTORS)
    const effectiveSituation = writtenSituation || `Analiza el proyecto descrito en los documentos y fuentes de apoyo.\n\n${contextBrief}`
    await conveneBoard({ directors, situation: effectiveSituation, meetingType, contextBlock: buildContextBlock(), apiKey: apiKey || null, provider: apiProvider, mode: boardMode })
  }, [situation, meetingType, selectedIds, apiKey, apiProvider, boardMode, isIdle, conveneBoard, buildContextBlock, buildSituationBrief])

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
    setGateError(null)
  }
  const handleSaveKey = (provider, key) => {
    localStorage.setItem(STORAGE_KEY, key)
    localStorage.setItem(STORAGE_PROVIDER_KEY, key ? provider : 'claude')
    setApiKey(key)
    setApiProvider(key ? provider : 'claude')
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
              {phase === 'convening' ? 'Convocando...' : phase === 'debating' ? (isPaused ? `Pausado · ${doneCount}/${totalCount}` : `Junta trabajando · ${doneCount}/${totalCount}`) : phase === 'contrasting' ? 'Contrastando hallazgos...' : 'Emitiendo veredicto...'}
            </span>
          )}
          {phase === 'debating' && (
            <button
              onClick={isPaused ? resume : pause}
              title={isPaused ? 'Reanudar el debate' : 'Pausar el debate — no se pierde lo ya generado'}
              style={{ padding: '6px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--bd)', color: 'var(--t3)', fontSize: '13px' }}
            >
              {isPaused ? '▶️' : '⏸️'}
            </button>
          )}
          <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '20px', border: '1px solid var(--bd)', color: 'var(--t3)', background: 'transparent' }}>
            🌐 2 análisis/día
          </span>
        </div>
      </nav>

      <main style={{ flex: 1, maxWidth: '860px', margin: '0 auto', padding: '52px 24px 64px', width: '100%' }}>

        {/* ── PANTALLA INICIAL ── */}
        {isIdle && (
          <div className="home-flow">
            {/* Hero */}
            <div className="fade-up home-hero" style={{ textAlign: 'center', marginBottom: '36px' }}>
              <div style={{ marginBottom: '30px', textAlign: 'left' }}>
                <DownloadBanner ready={false} />
              </div>
              <p style={{ fontSize: '11px', color: 'var(--blue)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: '16px', fontWeight: 500 }}>
                Tu junta directiva · 12 expertos
              </p>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(34px, 5vw, 58px)', fontWeight: 400, lineHeight: 1.1, marginBottom: '18px', color: 'var(--t1)' }}>
                Antes de decidir,<br /><em style={{ color: 'var(--blue)' }}>convoca la junta.</em>
              </h1>
              <p style={{ fontSize: '16px', color: 'var(--t2)', maxWidth: '480px', margin: '0 auto', lineHeight: 1.7 }}>
                Las grandes empresas no deciden a ciegas: se rodean de una junta que cuestiona, contrasta y exige claridad. Ahora tú también. Convoca a 12 especialistas para convertir una decisión difícil en una dirección clara.
              </p>
            </div>

            {/* El elenco — pills seleccionables: quién participa en esta sesión */}
            <div className="fade-up board-customization" style={{ marginBottom: '48px', animationDelay: '.08s' }}>
              <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '14px', textAlign: 'center', fontWeight: 500 }}>
                Tu junta directiva · {DIRECTORS.length} especialistas · {selectedIds.length} participantes recomendados
              </p>
              <p style={{ fontSize: '12px', color: 'var(--t2)', textAlign: 'center', margin: '-5px auto 16px', maxWidth: '520px' }}>
                Todos están aquí. La selección activa se adapta al reto; pulsa sobre cualquiera para incluirlo o quitarlo.
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
                      title={isOn ? `Quitar a ${d.name} de esta sesión` : `Incluir a ${d.name} en esta sesión`}
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
                {boardMode === 'fast' ? 'La Junta rápida conecta perspectivas en paralelo y luego las contrasta.' : 'La Junta profunda deja que cada director responda a los argumentos anteriores.'}
              </p>
            </div>

            {/* Formulario */}
            <div className="fade-up composer-card" style={{ animationDelay: '.14s', background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r-xl)', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="meeting-type">
                <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 500 }}>Tipo de reunión</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                  {MEETING_TYPES.map(mt => (
                    <button key={mt.id} onClick={() => handleMeetingTypeChange(mt.id)}
                      style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', textAlign: 'left', border: `1px solid ${meetingType === mt.id ? 'var(--blue-bd)' : 'var(--bd)'}`, background: meetingType === mt.id ? 'var(--blue-dim)' : 'var(--bg3)', transition: 'all .2s' }}>
                      <div style={{ fontSize: '16px', marginBottom: '4px' }}>{mt.icon}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: meetingType === mt.id ? 'var(--blue)' : 'var(--t1)', marginBottom: '2px' }}>{mt.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>{mt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="situation-field">
                <p style={{ fontSize: '11px', color: 'var(--blue)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 700 }}>¿Qué decisión necesitas tomar?</p>
                <textarea
                  id="board-situation"
                  value={situation}
                  onChange={e => setSituation(e.target.value.slice(0, MAX_CHARS))}
                  placeholder="Describe la situación con contexto, o adjunta un documento de apoyo debajo. Cuánto más específico seas, más útil será el análisis."
                  maxLength={MAX_CHARS}
                  aria-describedby="board-situation-hint board-situation-count"
                  rows={5}
                  style={{ width: '100%', padding: '16px', background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 'var(--r-md)', color: 'var(--t1)', fontSize: '15px', lineHeight: 1.7, resize: 'vertical', outline: 'none', transition: 'border-color .2s', minHeight: '130px' }}
                  onFocus={e => e.target.style.borderColor = 'var(--blue-bd)'}
                  onBlur={e => e.target.style.borderColor = 'var(--bd)'}
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleConvene() }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <span id="board-situation-hint" style={{ fontSize: '11px', color: 'var(--t3)' }}>⌘+Enter para convocar</span>
                  <span id="board-situation-count" style={{ fontSize: '11px', color: 'var(--t3)' }}>{situation.length}/{MAX_CHARS}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '12px' }}>
                  {[
                    '¿Contratar o externalizar esta función?',
                    '¿Lanzar esta oferta ahora?',
                    '¿Invertir en este proyecto?',
                    '¿Cómo salimos de esta crisis?',
                  ].map(example => (
                    <button key={example} type="button" onClick={() => setSituation(example)} style={{ padding: '6px 10px', border: '1px solid var(--bd)', borderRadius: '20px', color: 'var(--t2)', background: 'var(--bg3)', fontSize: '11px', textAlign: 'left' }}>
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              <fieldset style={{ border: 0, padding: 0 }}>
                <legend style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 500 }}>Ritmo de deliberación</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                  <button type="button" onClick={() => setBoardMode('fast')} aria-pressed={boardMode === 'fast'} style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', border: `1px solid ${boardMode === 'fast' ? 'var(--blue-bd)' : 'var(--bd)'}`, background: boardMode === 'fast' ? 'var(--blue-dim)' : 'var(--bg3)', color: 'var(--t1)', textAlign: 'left' }}><strong style={{ fontSize: '13px', color: 'var(--blue)' }}>Junta rápida</strong><span style={{ display: 'block', marginTop: '3px', fontSize: '11px', color: 'var(--t2)' }}>Perspectivas paralelas + contraste.</span></button>
                  <button type="button" onClick={() => (premiumAccess || apiKey || privateAccess) && setBoardMode('deep')} aria-pressed={boardMode === 'deep'} style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', border: `1px solid ${boardMode === 'deep' ? 'var(--blue-bd)' : 'var(--bd)'}`, background: boardMode === 'deep' ? 'var(--blue-dim)' : 'var(--bg3)', color: 'var(--t1)', textAlign: 'left', opacity: premiumAccess || apiKey || privateAccess ? 1 : .62 }}><strong style={{ fontSize: '13px', color: 'var(--blue)' }}>Junta profunda {!(premiumAccess || apiKey || privateAccess) && '· Premium'}</strong><span style={{ display: 'block', marginTop: '3px', fontSize: '11px', color: 'var(--t2)' }}>Cada director escucha y rebate a los anteriores.</span></button>
                </div>
                {!(premiumAccess || apiKey || privateAccess) && <p style={{ marginTop: '7px', fontSize: '11px', color: 'var(--t3)' }}>La Junta profunda se activa con tu API propia o al desbloquear el informe premium.</p>}
              </fieldset>

              {/* Panel de contexto enriquecido */}
              <div className="context-field">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                  <p style={{ fontSize:'11px', color:'var(--t3)', letterSpacing:'.08em', textTransform:'uppercase', fontWeight:500 }}>
                    Contexto adicional
                    <span style={{ marginLeft:'6px', fontSize:'10px', padding:'2px 7px', borderRadius:'4px', background:'var(--blue-dim)', color:'var(--blue)', border:'1px solid var(--blue-bd)' }}>
                      Opcional
                    </span>
                  </p>
                  {hasContext && (
                    <span style={{ fontSize:'11px', color:'var(--blue)' }}>
                      {ctxItems.filter(i=>i.status==='done').length} fuente{ctxItems.filter(i=>i.status==='done').length!==1?'s':''} lista{ctxItems.filter(i=>i.status==='done').length!==1?'s':''}
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

              <button
                onClick={handleConvene}
                disabled={(!situation.trim() && !hasContext) || ctxProcessing || gateChecking || selectedIds.length === 0}
                style={{ padding: '17px', borderRadius: 'var(--r-md)', border: 'none', background: ((situation.trim() || hasContext) && selectedIds.length > 0) ? 'var(--blue)' : 'var(--bg3)', color: ((situation.trim() || hasContext) && selectedIds.length > 0) ? 'var(--bg0)' : 'var(--t3)', fontSize: '15px', fontWeight: 700, cursor: ((situation.trim() || hasContext) && selectedIds.length > 0) ? 'pointer' : 'not-allowed', transition: 'all .2s', letterSpacing: '.02em' }}
              >
                {selectedIds.length === 0 ? '⚠️ Elige al menos un director' : gateChecking ? 'Comprobando disponibilidad...' : '🏛️ Convocar la junta'}
              </button>

              {gateError && (
                <DailyLimitBanner error={gateError} onBuyExtra={handleBuyExtra} buying={buyingExtra} />
              )}

              <p style={{ fontSize: '12px', color: 'var(--t3)', textAlign: 'center' }}>🌐 Modo gratuito · 2 análisis/día</p>
            </div>

            <section className="board-overview fade-up" aria-labelledby="overview-title" style={{ animationDelay: '.18s' }}>
              <div>
                <p className="eyebrow">Lo que ocurre después</p>
                <h2 id="overview-title">Una decisión no termina en el veredicto.</h2>
              </div>
              <ol className="board-overview__steps">
                <li><span>01</span><div><strong>La junta la cuestiona</strong><p>Especialistas revelan puntos ciegos y caminos alternativos.</p></div></li>
                <li><span>02</span><div><strong>El Chairman le da dirección</strong><p>Una decisión clara, sus condiciones y próximos pasos.</p></div></li>
                <li><span>03</span><div><strong>Tú puedes cambiar su rumbo</strong><p>Rebate, añade evidencia y convierte cada ajuste en un PDF ejecutivo.</p></div></li>
              </ol>
            </section>

          </div>
        )}

        {/* ── DEBATE / RESULTADOS ── */}
        {(isRunning || isDone) && (
          <div>
            {/* Header sesión */}
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '11px', color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 500 }}>
                  {phase === 'convening' ? 'Convocando junta...' : phase === 'debating' ? `La junta está conectando perspectivas · ${doneCount}/${totalCount}` : phase === 'contrasting' ? 'Contrastando hallazgos antes del veredicto...' : phase === 'verdict' ? 'El Chairman está integrando la decisión...' : 'Sesión completada'}
                </p>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: 400, color: 'var(--t1)', lineHeight: 1.3, maxWidth: '580px', fontStyle: 'italic' }}>
                  "{situation.slice(0, 110)}{situation.length > 110 ? '…' : ''}"
                </h2>
              </div>
              {isDone && (
                <button onClick={handleReset} style={{ padding: '9px 18px', borderRadius: 'var(--r-sm)', border: '1px solid var(--bd)', color: 'var(--t2)', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Nueva sesión
                </button>
              )}
            </div>

            {/* Error */}
            {globalError && (
              <div style={{ padding: '14px 18px', background: 'var(--red-dim)', border: '1px solid var(--red-bd)', borderRadius: 'var(--r-md)', color: 'var(--red)', fontSize: '13px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <span>⚠️ {globalError}</span>
              </div>
            )}

            {/* Conversación de la junta */}
            <div style={{ marginBottom: '32px' }}>
              <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '18px', fontWeight: 500 }}>
                La conversación · clic en un director para ver su perfil
              </p>
              <DebateChat directors={activeDirectors} directorStates={directorStates} onClickDirector={setSelectedDirector} />
            </div>

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
                <p style={{ fontSize: '10px', color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '5px' }}>La decisión continúa</p>
                <h3 id="chairman-feature-title" style={{ fontSize: '17px', color: 'var(--t1)', marginBottom: '6px' }}>El veredicto es el inicio de la sesión de trabajo.</h3>
                <p style={{ fontSize: '13px', color: 'var(--t2)', lineHeight: 1.55 }}>Rebate supuestos, compara alternativas, añade nueva evidencia y convierte cada propuesta refinada en un PDF.</p>
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
                  🏛️ Nueva sesión de junta
                </button>
              </div>
            )}
          </div>
        )}

        <DirectorsRoster directors={DIRECTORS} onClickDirector={setSelectedDirector} />

        <footer className="site-footer" aria-label="Información del sitio">
          <div className="site-footer__topline"><div><p className="site-footer__product">Junta Directiva AI · Una experiencia de IA Packs Plugin Suite™</p><p className="site-footer__tagline">© 2026 Quintessence Consulting Group LLC · Creado por Jota Santos</p></div><nav className="site-footer__links" aria-label="Enlaces del creador"><a href="https://jsantos.pro/" target="_blank" rel="noreferrer">Jota Santos</a><a href="https://iapacks.com/" target="_blank" rel="noreferrer">IA Packs</a></nav></div>
          <details className="site-footer__legal"><summary>Aviso legal y uso responsable</summary><div className="site-footer__legal-copy"><p><strong>Descargo de responsabilidad:</strong> Junta Directiva AI apoya decisiones con IA generativa; no ofrece asesoramiento legal, financiero, médico, fiscal ni profesional y no garantiza resultados.</p><p><strong>Uso responsable:</strong> Verifica el contenido generado antes de actuar y no aportes datos confidenciales, personales o de terceros sin derecho a hacerlo.</p><p><strong>Derechos:</strong> La marca, lógica de producto, documentación y arquitectura están protegidas. Se prohíbe su extracción, reventa o distribución no autorizada.</p></div></details>
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

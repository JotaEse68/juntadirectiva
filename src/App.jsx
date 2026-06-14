import React, { useState, useCallback } from 'react'
import DirectorCard from './components/DirectorCard.jsx'
import DirectorModal from './components/DirectorModal.jsx'
import VerdictPanel from './components/VerdictPanel.jsx'
import DownloadBanner from './components/DownloadBanner.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import { useBoard } from './hooks/useBoard.js'
import { DIRECTORS, MEETING_TYPES } from './lib/directors.js'

const STORAGE_KEY = 'junta_api_key'
const MAX_CHARS = 800

export default function App() {
  const [situation, setSituation]   = useState('')
  const [meetingType, setMeetingType] = useState('decision')
  const [apiKey, setApiKey]         = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [showSettings, setShowSettings] = useState(false)
  const [selectedDirector, setSelectedDirector] = useState(null)

  const { conveneBoard, reset, directorStates, verdict, verdictLoading, phase, activeDirectors, globalError } = useBoard()

  const isIdle     = phase === 'idle'
  const isRunning  = !isIdle && phase !== 'done'
  const isDone     = phase === 'done'

  const doneCount  = Object.values(directorStates).filter(s => s.status === 'done').length
  const totalCount = activeDirectors.length

  const handleConvene = useCallback(async () => {
    if (!situation.trim() || !isIdle) return
    await conveneBoard({ situation: situation.trim(), meetingType, apiKey: apiKey || null })
  }, [situation, meetingType, apiKey, isIdle, conveneBoard])

  const handleReset = () => { reset(); setSituation('') }
  const handleSaveKey = (key) => { localStorage.setItem(STORAGE_KEY, key); setApiKey(key) }

  // Extrae el voto de un director del texto generado
  const getDirectorVote = (dirId) => {
    const state = directorStates[dirId]
    if (!state?.text) return null
    const lines = state.text.split('\n').filter(l => l.trim())
    const keywords = ['voto:', 'posición:', 'evaluación:', 'veredicto:']
    for (const line of lines.slice(-5)) {
      if (keywords.some(k => line.toLowerCase().includes(k))) return line.trim()
    }
    return null
  }

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
              {phase === 'convening' ? 'Convocando...' : phase === 'debating' ? `Debate · ${doneCount}/${totalCount}` : 'Emitiendo veredicto...'}
            </span>
          )}
          <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '20px', border: `1px solid ${apiKey ? 'var(--blue-bd)' : 'var(--bd)'}`, color: apiKey ? 'var(--blue)' : 'var(--t3)', background: apiKey ? 'var(--blue-dim)' : 'transparent' }}>
            {apiKey ? '🔑 key propia' : '🌐 3/hora'}
          </span>
          <button onClick={() => setShowSettings(true)} style={{ padding: '6px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--bd)', color: 'var(--t3)', fontSize: '13px' }}>⚙️</button>
        </div>
      </nav>

      <main style={{ flex: 1, maxWidth: '860px', margin: '0 auto', padding: '52px 24px 64px', width: '100%' }}>

        {/* ── PANTALLA INICIAL ── */}
        {isIdle && (
          <>
            {/* Hero */}
            <div className="fade-up" style={{ textAlign: 'center', marginBottom: '52px' }}>
              <p style={{ fontSize: '11px', color: 'var(--blue)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: '16px', fontWeight: 500 }}>
                Tu junta directiva · 12 expertos
              </p>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(34px, 5vw, 58px)', fontWeight: 400, lineHeight: 1.1, marginBottom: '18px', color: 'var(--t1)' }}>
                Antes de decidir,<br /><em style={{ color: 'var(--blue)' }}>convoca la junta.</em>
              </h1>
              <p style={{ fontSize: '16px', color: 'var(--t2)', maxWidth: '480px', margin: '0 auto', lineHeight: 1.7 }}>
                12 directores especializados debaten tu situación en paralelo y emiten un veredicto ejecutivo con próximos pasos.
              </p>
            </div>

            {/* El elenco — pills clicables */}
            <div className="fade-up" style={{ marginBottom: '48px', animationDelay: '.08s' }}>
              <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '14px', textAlign: 'center', fontWeight: 500 }}>
                La junta — clic para conocer a cada director
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {DIRECTORS.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDirector(d)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '7px',
                      padding: '7px 14px', borderRadius: '24px',
                      border: `1px solid ${d.id === 'jottarina' ? 'var(--red-bd)' : 'var(--bd)'}`,
                      background: d.id === 'jottarina' ? 'var(--red-dim)' : 'rgba(255,255,255,0.03)',
                      color: d.id === 'jottarina' ? 'var(--red)' : 'var(--t2)',
                      cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                      transition: 'all .15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = d.id === 'jottarina' ? 'var(--red)' : 'var(--blue-bd)'
                      e.currentTarget.style.color = d.id === 'jottarina' ? 'var(--red)' : 'var(--blue)'
                      e.currentTarget.style.background = d.id === 'jottarina' ? 'var(--red-dim)' : 'var(--blue-dim)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = d.id === 'jottarina' ? 'var(--red-bd)' : 'var(--bd)'
                      e.currentTarget.style.color = d.id === 'jottarina' ? 'var(--red)' : 'var(--t2)'
                      e.currentTarget.style.background = d.id === 'jottarina' ? 'var(--red-dim)' : 'rgba(255,255,255,0.03)'
                    }}
                  >
                    <span>{d.emoji}</span>
                    <span>{d.name}</span>
                    <span style={{ fontWeight: 400, opacity: .6, fontSize: '11px' }}>· {d.title.split(' ').slice(-1)[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Formulario */}
            <div className="fade-up" style={{ animationDelay: '.14s', background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r-xl)', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 500 }}>Tipo de reunión</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {MEETING_TYPES.map(mt => (
                    <button key={mt.id} onClick={() => setMeetingType(mt.id)}
                      style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', textAlign: 'left', border: `1px solid ${meetingType === mt.id ? 'var(--blue-bd)' : 'var(--bd)'}`, background: meetingType === mt.id ? 'var(--blue-dim)' : 'var(--bg3)', transition: 'all .2s' }}>
                      <div style={{ fontSize: '16px', marginBottom: '4px' }}>{mt.icon}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: meetingType === mt.id ? 'var(--blue)' : 'var(--t1)', marginBottom: '2px' }}>{mt.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>{mt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 500 }}>Situación a debatir</p>
                <textarea
                  value={situation}
                  onChange={e => setSituation(e.target.value.slice(0, MAX_CHARS))}
                  placeholder="Describe la situación con contexto. Cuánto más específico seas, más útil será el análisis. Incluye datos relevantes: mercado, recursos, restricciones, plazos..."
                  rows={5}
                  style={{ width: '100%', padding: '16px', background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 'var(--r-md)', color: 'var(--t1)', fontSize: '15px', lineHeight: 1.7, resize: 'vertical', outline: 'none', transition: 'border-color .2s', minHeight: '130px' }}
                  onFocus={e => e.target.style.borderColor = 'var(--blue-bd)'}
                  onBlur={e => e.target.style.borderColor = 'var(--bd)'}
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleConvene() }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--t3)' }}>⌘+Enter para convocar</span>
                  <span style={{ fontSize: '11px', color: 'var(--t3)' }}>{situation.length}/{MAX_CHARS}</span>
                </div>
              </div>

              <button
                onClick={handleConvene}
                disabled={!situation.trim()}
                style={{ padding: '17px', borderRadius: 'var(--r-md)', border: 'none', background: situation.trim() ? 'var(--blue)' : 'var(--bg3)', color: situation.trim() ? 'var(--bg0)' : 'var(--t3)', fontSize: '15px', fontWeight: 700, cursor: situation.trim() ? 'pointer' : 'not-allowed', transition: 'all .2s', letterSpacing: '.02em' }}
              >
                🏛️ Convocar la junta
              </button>

              <p style={{ fontSize: '12px', color: 'var(--t3)', textAlign: 'center' }}>
                {apiKey ? '🔑 Tu API key · reuniones ilimitadas' : '🌐 Modo gratuito · 3 reuniones/hora'} ·{' '}
                <button onClick={() => setShowSettings(true)} style={{ color: 'var(--blue)', fontSize: '12px', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>cambiar</button>
              </p>
            </div>
          </>
        )}

        {/* ── DEBATE / RESULTADOS ── */}
        {(isRunning || isDone) && (
          <div>
            {/* Header sesión */}
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '11px', color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 500 }}>
                  {phase === 'convening' ? 'Convocando junta...' : phase === 'debating' ? `Debate en curso · ${doneCount}/${totalCount}` : phase === 'verdict' ? 'Emitiendo veredicto...' : 'Sesión completada'}
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
                {!apiKey && <button onClick={() => setShowSettings(true)} style={{ color: 'var(--blue)', fontSize: '12px', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>Añadir API key →</button>}
              </div>
            )}

            {/* Banner descarga — aparece cuando hay veredicto */}
            {isDone && verdict && (
              <div style={{ marginBottom: '28px' }}>
                <DownloadBanner
                  sessionData={{ directorCount: activeDirectors.length }}
                  onPurchase={(product) => {
                    // TODO: integrar Stripe
                    alert(`Próximamente: pago ${product === 'bundle' ? 'bundle 9,99€' : 'unitario 4,99€'} con Stripe`)
                  }}
                />
              </div>
            )}

            {/* Veredicto */}
            {(verdict || verdictLoading) && (
              <div style={{ marginBottom: '36px' }}>
                <VerdictPanel text={verdict} loading={verdictLoading} />
              </div>
            )}

            {/* Grid directores */}
            <div>
              <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '14px', fontWeight: 500 }}>
                Análisis individual · clic para expandir o ver perfil
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '10px' }}>
                {activeDirectors.map((director, i) => (
                  <DirectorCard
                    key={director.id}
                    director={director}
                    state={directorStates[director.id]}
                    index={i}
                    onClickDirector={setSelectedDirector}
                  />
                ))}
              </div>
            </div>

            {isDone && (
              <div style={{ textAlign: 'center', marginTop: '48px' }}>
                <button onClick={handleReset} style={{ padding: '13px 32px', borderRadius: 'var(--r-md)', border: '1px solid var(--blue-bd)', background: 'var(--blue-dim)', color: 'var(--blue)', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                  🏛️ Nueva sesión de junta
                </button>
              </div>
            )}
          </div>
        )}

        <footer style={{ marginTop: '72px', paddingTop: '24px', borderTop: '1px solid var(--bd)', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', color: 'var(--t3)' }}>Junta Directiva AI · 12 expertos · Powered by Claude · 2026</p>
        </footer>
      </main>

      {/* Modals */}
      {showSettings && <SettingsModal currentKey={apiKey} onSave={handleSaveKey} onClose={() => setShowSettings(false)} />}
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

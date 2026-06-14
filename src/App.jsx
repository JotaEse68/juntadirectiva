import React, { useState, useCallback } from 'react'
import DirectorCard from './components/DirectorCard.jsx'
import VerdictPanel from './components/VerdictPanel.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import { useBoard } from './hooks/useBoard.js'
import { DIRECTORS, MEETING_TYPES } from './lib/directors.js'

const STORAGE_KEY = 'junta_api_key'
const MAX_CHARS = 800

export default function App() {
  const [situation, setSituation] = useState('')
  const [meetingType, setMeetingType] = useState('decision')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [showSettings, setShowSettings] = useState(false)

  const {
    conveneBoard, reset,
    directorStates, verdict, verdictLoading,
    phase, activeDirectors, globalError,
  } = useBoard()

  const handleConvene = useCallback(async () => {
    if (!situation.trim() || phase !== 'idle') return
    await conveneBoard({ situation: situation.trim(), meetingType, apiKey: apiKey || null })
  }, [situation, meetingType, apiKey, phase, conveneBoard])

  const handleReset = () => { reset(); setSituation('') }

  const handleSaveKey = (key) => {
    localStorage.setItem(STORAGE_KEY, key)
    setApiKey(key)
  }

  const isRunning = phase !== 'idle' && phase !== 'done'
  const isDone = phase === 'done'
  const showForm = phase === 'idle'

  // Contar directores completados
  const doneCount = Object.values(directorStates).filter(s => s.status === 'done').length
  const totalCount = activeDirectors.length

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* NAV */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(13,17,23,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 28px', height: '58px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '28px', height: '28px', background: 'var(--gold-dim)', border: '1px solid var(--gold-glow)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🏛️</div>
          <div>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>Junta Directiva</span>
            <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '8px' }}>AI Board of Directors</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isRunning && (
            <span style={{ fontSize: '12px', color: 'var(--gold)', padding: '4px 10px', borderRadius: '20px', background: 'var(--gold-dim)', border: '1px solid var(--gold-glow)' }}>
              {phase === 'convening' ? 'Convocando junta...' : phase === 'debating' ? `Debatiendo · ${doneCount}/${totalCount}` : 'Emitiendo veredicto...'}
            </span>
          )}
          <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '20px', border: `1px solid ${apiKey ? 'rgba(201,168,76,0.3)' : 'var(--border)'}`, color: apiKey ? 'var(--gold)' : 'var(--text3)', background: apiKey ? 'var(--gold-dim)' : 'transparent' }}>
            {apiKey ? '🔑 key propia' : '🌐 3/hora gratis'}
          </span>
          <button onClick={() => setShowSettings(true)} style={{ padding: '6px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: '12px' }}>⚙️</button>
        </div>
      </nav>

      <main style={{ flex: 1, maxWidth: '900px', margin: '0 auto', padding: '48px 24px', width: '100%' }}>

        {/* HERO — solo cuando está idle */}
        {showForm && (
          <div className="fade-up" style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={{ fontSize: '11px', color: 'var(--gold)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '16px', fontWeight: 500 }}>
              Tu junta directiva · 12 expertos
            </p>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, marginBottom: '16px', color: 'var(--text)' }}>
              Antes de decidir,<br /><em style={{ color: 'var(--gold)' }}>convoca la junta.</em>
            </h1>
            <p style={{ fontSize: '16px', color: 'var(--text2)', maxWidth: '500px', margin: '0 auto', lineHeight: 1.7 }}>
              12 directores especializados debaten tu situación y emiten un veredicto ejecutivo. Análisis real, perspectivas diversas, decisión informada.
            </p>
          </div>
        )}

        {/* El elenco de directores — mostrar solo en idle */}
        {showForm && (
          <div className="fade-up" style={{ marginBottom: '48px', animationDelay: '0.1s' }}>
            <p style={{ fontSize: '11px', color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '14px', textAlign: 'center' }}>
              La junta
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
              {DIRECTORS.map(d => (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px', borderRadius: '20px',
                  border: `1px solid ${d.colorBorder}`,
                  background: d.colorDim,
                }}>
                  <span style={{ fontSize: '14px' }}>{d.emoji}</span>
                  <span style={{ fontSize: '12px', color: d.color, fontWeight: 500 }}>{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FORMULARIO */}
        {showForm && (
          <div className="fade-up" style={{ animationDelay: '0.15s', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Tipo de reunión */}
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 500 }}>
                Tipo de reunión
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {MEETING_TYPES.map(mt => (
                  <button
                    key={mt.id}
                    onClick={() => setMeetingType(mt.id)}
                    style={{
                      padding: '12px 14px', borderRadius: 'var(--r-md)', textAlign: 'left',
                      border: `1px solid ${meetingType === mt.id ? 'rgba(201,168,76,0.5)' : 'var(--border)'}`,
                      background: meetingType === mt.id ? 'var(--gold-dim)' : 'var(--bg3)',
                      color: meetingType === mt.id ? 'var(--gold)' : 'var(--text2)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <span style={{ fontSize: '16px' }}>{mt.icon}</span>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>{mt.label}</span>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', paddingLeft: '24px' }}>{mt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Situación */}
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 500 }}>
                Situación a debatir
              </p>
              <textarea
                value={situation}
                onChange={e => setSituation(e.target.value.slice(0, MAX_CHARS))}
                placeholder="Describe la situación con contexto suficiente. Cuánto más específico seas, más útil será el análisis de la junta. Incluye datos relevantes: mercado, recursos, restricciones..."
                rows={5}
                style={{
                  width: '100%', padding: '16px', background: 'var(--bg3)',
                  border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                  color: 'var(--text)', fontSize: '15px', lineHeight: 1.7,
                  resize: 'vertical', outline: 'none', transition: 'border-color 0.2s',
                  minHeight: '130px',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(201,168,76,0.4)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleConvene() }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <p style={{ fontSize: '11px', color: 'var(--text3)' }}>⌘+Enter para convocar</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)' }}>{situation.length}/{MAX_CHARS}</p>
              </div>
            </div>

            <button
              onClick={handleConvene}
              disabled={!situation.trim()}
              style={{
                padding: '18px', borderRadius: 'var(--r-md)', border: 'none',
                background: situation.trim() ? 'var(--gold)' : 'var(--bg3)',
                color: situation.trim() ? '#0d1117' : 'var(--text3)',
                fontSize: '15px', fontWeight: 700, letterSpacing: '0.03em',
                cursor: situation.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              🏛️ Convocar la junta
            </button>

            <p style={{ fontSize: '12px', color: 'var(--text3)', textAlign: 'center' }}>
              {apiKey ? '🔑 Usando tu API key · reuniones ilimitadas' : '🌐 Modo gratuito · 3 reuniones por hora'} ·{' '}
              <button onClick={() => setShowSettings(true)} style={{ color: 'var(--gold)', fontSize: '12px', textDecoration: 'underline' }}>cambiar</button>
            </p>
          </div>
        )}

        {/* DEBATE EN PROGRESO / RESULTADOS */}
        {(isRunning || isDone) && (
          <div>
            {/* Header del debate */}
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
                  {phase === 'convening' ? 'Convocando junta...' : phase === 'debating' ? 'Debate en curso' : phase === 'verdict' ? 'Emitiendo veredicto' : 'Sesión completada'}
                </p>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: 400, color: 'var(--text)', lineHeight: 1.3, maxWidth: '600px' }}>
                  "{situation.slice(0, 100)}{situation.length > 100 ? '…' : ''}"
                </h2>
              </div>
              {isDone && (
                <button onClick={handleReset} style={{ padding: '8px 16px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Nueva sesión
                </button>
              )}
            </div>

            {/* Error global */}
            {globalError && (
              <div style={{ padding: '14px 18px', background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 'var(--r-md)', color: '#ff6b6b', fontSize: '13px', marginBottom: '24px' }}>
                ⚠️ {globalError}
                {!apiKey && (
                  <button onClick={() => setShowSettings(true)} style={{ marginLeft: '8px', color: 'var(--gold)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}>
                    Añadir API key →
                  </button>
                )}
              </div>
            )}

            {/* Veredicto primero si está disponible */}
            {(verdict || verdictLoading) && (
              <div style={{ marginBottom: '40px' }}>
                <VerdictPanel text={verdict} loading={verdictLoading} />
              </div>
            )}

            {/* Grid de directores */}
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px', fontWeight: 500 }}>
                Análisis individual · {doneCount}/{totalCount} directores
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '12px' }}>
                {activeDirectors.map((director, i) => (
                  <DirectorCard
                    key={director.id}
                    director={director}
                    state={directorStates[director.id]}
                    index={i}
                  />
                ))}
              </div>
            </div>

            {isDone && (
              <div style={{ textAlign: 'center', marginTop: '48px' }}>
                <button onClick={handleReset} style={{ padding: '14px 32px', borderRadius: 'var(--r-md)', border: '1px solid var(--gold-glow)', background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                  🏛️ Nueva sesión de junta
                </button>
              </div>
            )}
          </div>
        )}

        <footer style={{ marginTop: '64px', paddingTop: '24px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', color: 'var(--text3)' }}>
            Junta Directiva AI · 12 expertos · Powered by Claude · 2026
          </p>
        </footer>
      </main>

      {showSettings && <SettingsModal currentKey={apiKey} onSave={handleSaveKey} onClose={() => setShowSettings(false)} />}
    </div>
  )
}

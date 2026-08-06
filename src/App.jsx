import React, { useState, useCallback, useMemo } from 'react'
import DebateChat from './components/DebateChat.jsx'
import DirectorModal from './components/DirectorModal.jsx'
import DirectorsRoster from './components/DirectorsRoster.jsx'
import VerdictPanel from './components/VerdictPanel.jsx'
import DownloadBanner from './components/DownloadBanner.jsx'
import ReportModal from './components/ReportModal.jsx'
import ChairmanChat from './components/ChairmanChat.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import { useBoard } from './hooks/useBoard.js'
import { useContextBuilder } from './hooks/useContext.js'
import { useReport } from './hooks/useReport.js'
import { useChairmanChat } from './hooks/useChairmanChat.js'
import ContextPanel from './components/ContextPanel.jsx'
import { DIRECTORS, MEETING_TYPES, selectDirectorsForMeeting, orderForDebate } from './lib/directors.js'
import { PROVIDERS } from './lib/providers.js'
import { computeConsensus } from './lib/consensus.js'

const STORAGE_KEY = 'junta_api_key'
const STORAGE_PROVIDER_KEY = 'junta_api_provider'
const MAX_CHARS = 800

export default function App() {
  const [situation, setSituation]   = useState('')
  const [meetingType, setMeetingType] = useState('decision')
  const [selectedIds, setSelectedIds] = useState(() => selectDirectorsForMeeting('decision', DIRECTORS).map(d => d.id))
  const [apiKey, setApiKey]         = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [apiProvider, setApiProvider] = useState(() => localStorage.getItem(STORAGE_PROVIDER_KEY) || 'claude')
  const [showSettings, setShowSettings] = useState(false)
  const [selectedDirector, setSelectedDirector] = useState(null)

  const { conveneBoard, reset, pause, resume, directorStates, verdict, verdictLoading, phase, activeDirectors, globalError, isPaused } = useBoard()
  const { items: ctxItems, addNote, processFile, processURL, removeItem: removeCtxItem,
          buildContextBlock, hasContext, isProcessing: ctxProcessing } = useContextBuilder()
  const { report, loading: reportLoading, error: reportError, generateReport, reset: resetReport } = useReport()
  const [showReport, setShowReport] = useState(false)
  const { messages: chatMessages, sending: chatSending, error: chatError, freeMessagesUsed, sendMessage: sendChatMessage, reset: resetChat } = useChairmanChat()

  const consensus = useMemo(() => computeConsensus(directorStates), [directorStates])

  const handleGenerateReport = () => {
    setShowReport(true)
    generateReport({ situation, meetingType, activeDirectors, directorStates, verdict, apiKey: apiKey || null, provider: apiProvider })
  }

  const handleSendChat = (text) => {
    sendChatMessage(text, { situation, activeDirectors, directorStates, verdict }, { apiKey: apiKey || null, provider: apiProvider })
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
    if (!situation.trim() || !isIdle || selectedIds.length === 0) return
    const directors = orderForDebate(selectedIds, DIRECTORS)
    await conveneBoard({ directors, situation: situation.trim(), meetingType, contextBlock: buildContextBlock(), apiKey: apiKey || null, provider: apiProvider })
  }, [situation, meetingType, selectedIds, apiKey, apiProvider, isIdle, conveneBoard])

  const handleReset = () => { reset(); resetReport(); resetChat(); setShowReport(false); setSituation('') }
  const handleSaveKey = (provider, key) => {
    localStorage.setItem(STORAGE_KEY, key)
    localStorage.setItem(STORAGE_PROVIDER_KEY, key ? provider : 'claude')
    setApiKey(key)
    setApiProvider(key ? provider : 'claude')
  }

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
              {phase === 'convening' ? 'Convocando...' : phase === 'debating' ? (isPaused ? `Pausado · ${doneCount}/${totalCount}` : `Debate · ${doneCount}/${totalCount}`) : 'Emitiendo veredicto...'}
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
          <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '20px', border: `1px solid ${apiKey ? 'var(--blue-bd)' : 'var(--bd)'}`, color: apiKey ? 'var(--blue)' : 'var(--t3)', background: apiKey ? 'var(--blue-dim)' : 'transparent' }}>
            {apiKey ? `${PROVIDERS[apiProvider]?.emoji || '🔑'} ${PROVIDERS[apiProvider]?.label || 'key propia'}` : '🌐 3/hora'}
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
                12 directores especializados debaten tu situación entre sí — se escuchan, se rebaten — y emiten un veredicto ejecutivo con próximos pasos.
              </p>
            </div>

            {/* El elenco — pills seleccionables: quién participa en esta sesión */}
            <div className="fade-up" style={{ marginBottom: '48px', animationDelay: '.08s' }}>
              <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '14px', textAlign: 'center', fontWeight: 500 }}>
                Elige quién participa · {selectedIds.length} de {DIRECTORS.length} directores
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
                      <span style={{ fontWeight: 400, opacity: .6, fontSize: '11px' }}>· {d.title.split(' ').slice(-1)[0]}</span>
                      {!isOn && <span style={{ fontSize: '11px' }}>✕</span>}
                    </button>
                  )
                })}
              </div>
              {selectedIds.length > 8 && (
                <p style={{ fontSize: '11px', color: 'var(--t3)', textAlign: 'center', marginTop: '10px' }}>
                  El debate es secuencial (cada director escucha a los anteriores) — con {selectedIds.length} directores puede tardar varios minutos.
                </p>
              )}
            </div>

            {/* Formulario */}
            <div className="fade-up" style={{ animationDelay: '.14s', background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r-xl)', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
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

              {/* Panel de contexto enriquecido */}
              <div>
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
                disabled={!situation.trim() || ctxProcessing || selectedIds.length === 0}
                style={{ padding: '17px', borderRadius: 'var(--r-md)', border: 'none', background: (situation.trim() && selectedIds.length > 0) ? 'var(--blue)' : 'var(--bg3)', color: (situation.trim() && selectedIds.length > 0) ? 'var(--bg0)' : 'var(--t3)', fontSize: '15px', fontWeight: 700, cursor: (situation.trim() && selectedIds.length > 0) ? 'pointer' : 'not-allowed', transition: 'all .2s', letterSpacing: '.02em' }}
              >
                {selectedIds.length === 0 ? '⚠️ Elige al menos un director' : '🏛️ Convocar la junta'}
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
                  sessionData={{ directorCount: activeDirectors.length }}
                  loading={reportLoading}
                  onGenerate={handleGenerateReport}
                />
              </div>
            )}

            {/* Chat de seguimiento con el Chairman — después del veredicto */}
            {isDone && verdict && (
              <ChairmanChat
                messages={chatMessages}
                sending={chatSending}
                error={chatError}
                freeMessagesUsed={freeMessagesUsed}
                hasKey={!!apiKey}
                onSend={handleSendChat}
                onOpenSettings={() => setShowSettings(true)}
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

        <footer style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--bd)', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', color: 'var(--t3)' }}>Junta Directiva AI · 12 expertos · Powered by Claude, OpenAI o Gemini · 2026</p>
        </footer>
      </main>

      {/* Modals */}
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
      {showSettings && <SettingsModal currentProvider={apiProvider} currentKey={apiKey} onSave={handleSaveKey} onClose={() => setShowSettings(false)} />}
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

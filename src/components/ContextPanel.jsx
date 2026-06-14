import React, { useState, useRef } from 'react'

const STATUS_LABEL = {
  extracting:  'Leyendo archivo...',
  summarizing: 'Resumiendo con IA...',
  fetching:    'Accediendo a URL...',
  done:        'Listo',
  error:       'Error',
}

function ContextItem({ item, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const isLoading = ['extracting','summarizing','fetching'].includes(item.status)
  const isError   = item.status === 'error'
  const isDone    = item.status === 'done'

  const typeIcon = item.type === 'file' ? '📄'
    : item.type === 'url' ? '🔗'
    : '📝'

  return (
    <div style={{
      background: isError ? 'var(--red-dim)' : isDone ? 'var(--blue-dim)' : 'var(--bg3)',
      border: `1px solid ${isError ? 'var(--red-bd)' : isDone ? 'var(--blue-bd)' : 'var(--bd)'}`,
      borderRadius: 'var(--r-md)',
      padding: '10px 14px',
      transition: 'all .3s',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
        <span style={{ fontSize:'15px' }}>{typeIcon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:'12px', fontWeight:500, color: isError ? 'var(--red)' : isDone ? 'var(--blue)' : 'var(--t2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {item.name.length > 50 ? item.name.slice(0,50)+'…' : item.name}
          </p>
          <p style={{ fontSize:'11px', color:'var(--t3)', marginTop:'1px' }}>
            {isLoading ? (
              <span style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                <span style={{ display:'inline-flex', gap:'3px' }}>
                  <span className="dot"></span><span className="dot"></span><span className="dot"></span>
                </span>
                {STATUS_LABEL[item.status]}
              </span>
            ) : isError ? item.error
              : `Briefing listo · ${item.summary?.length || 0} chars`
            }
          </p>
        </div>
        <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
          {isDone && (
            <button onClick={() => setExpanded(!expanded)}
              style={{ fontSize:'11px', color:'var(--blue)', padding:'3px 7px', border:'1px solid var(--blue-bd)', borderRadius:'4px', background:'transparent', cursor:'pointer' }}>
              {expanded ? 'Ocultar' : 'Ver'}
            </button>
          )}
          <button onClick={() => onRemove(item.id)}
            style={{ fontSize:'13px', color:'var(--t3)', padding:'2px 6px', background:'transparent', border:'none', cursor:'pointer' }}>
            ×
          </button>
        </div>
      </div>
      {expanded && isDone && (
        <div style={{ marginTop:'10px', paddingTop:'10px', borderTop:'1px solid var(--blue-bd)' }}>
          <p style={{ fontSize:'12px', color:'var(--t2)', lineHeight:1.65, whiteSpace:'pre-wrap' }}>{item.summary}</p>
        </div>
      )}
    </div>
  )
}

export default function ContextPanel({ onProcessFile, onProcessURL, onAddNote, items, onRemove, isProcessing }) {
  const [urlInput, setUrlInput]   = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [noteOpen, setNoteOpen]   = useState(false)
  const [urlOpen, setUrlOpen]     = useState(false)
  const fileRef = useRef()

  const handleFiles = (e) => {
    Array.from(e.target.files || []).forEach(f => onProcessFile(f))
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    Array.from(e.dataTransfer.files).forEach(f => onProcessFile(f))
  }

  const handleURL = () => {
    if (!urlInput.trim()) return
    onProcessURL(urlInput.trim())
    setUrlInput('')
    setUrlOpen(false)
  }

  const handleNote = () => {
    if (!noteInput.trim()) return
    onAddNote(noteInput.trim())
    setNoteInput('')
    setNoteOpen(false)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

      {/* Botones de acción */}
      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
        {/* Subir archivo */}
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" multiple onChange={handleFiles} style={{ display:'none' }} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isProcessing}
          style={{
            display:'flex', alignItems:'center', gap:'6px',
            padding:'8px 14px', borderRadius:'var(--r-sm)',
            border:'1px solid var(--bd)', background:'var(--bg3)',
            color:'var(--t2)', fontSize:'13px', cursor:'pointer',
            transition:'all .2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor='var(--blue-bd)'; e.currentTarget.style.color='var(--blue)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='var(--bd)'; e.currentTarget.style.color='var(--t2)' }}
        >
          <span>📄</span> PDF / Word
        </button>

        {/* URL */}
        <button
          onClick={() => { setUrlOpen(!urlOpen); setNoteOpen(false) }}
          style={{
            display:'flex', alignItems:'center', gap:'6px',
            padding:'8px 14px', borderRadius:'var(--r-sm)',
            border:`1px solid ${urlOpen ? 'var(--blue-bd)' : 'var(--bd)'}`,
            background: urlOpen ? 'var(--blue-dim)' : 'var(--bg3)',
            color: urlOpen ? 'var(--blue)' : 'var(--t2)', fontSize:'13px', cursor:'pointer',
            transition:'all .2s',
          }}
        >
          <span>🔗</span> URL
        </button>

        {/* Nota */}
        <button
          onClick={() => { setNoteOpen(!noteOpen); setUrlOpen(false) }}
          style={{
            display:'flex', alignItems:'center', gap:'6px',
            padding:'8px 14px', borderRadius:'var(--r-sm)',
            border:`1px solid ${noteOpen ? 'var(--blue-bd)' : 'var(--bd)'}`,
            background: noteOpen ? 'var(--blue-dim)' : 'var(--bg3)',
            color: noteOpen ? 'var(--blue)' : 'var(--t2)', fontSize:'13px', cursor:'pointer',
            transition:'all .2s',
          }}
        >
          <span>📝</span> Nota
        </button>
      </div>

      {/* Drop zone — solo visible si no hay items */}
      {items.length === 0 && !urlOpen && !noteOpen && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          style={{
            border:'1px dashed var(--bd)', borderRadius:'var(--r-md)',
            padding:'24px', textAlign:'center', cursor:'pointer',
            transition:'border-color .2s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor='var(--blue-bd)'}
          onMouseLeave={e => e.currentTarget.style.borderColor='var(--bd)'}
        >
          <p style={{ fontSize:'13px', color:'var(--t3)', lineHeight:1.6 }}>
            Arrastra archivos aquí o usa los botones<br />
            <span style={{ fontSize:'11px' }}>PDF · Word · URLs · Notas de texto</span>
          </p>
        </div>
      )}

      {/* Input URL */}
      {urlOpen && (
        <div style={{ display:'flex', gap:'8px' }} className="fade-in">
          <input
            type="url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://..."
            onKeyDown={e => e.key === 'Enter' && handleURL()}
            autoFocus
            style={{ flex:1, padding:'10px 14px', background:'var(--bg3)', border:'1px solid var(--blue-bd)', borderRadius:'var(--r-sm)', color:'var(--t1)', fontSize:'13px', outline:'none' }}
          />
          <button onClick={handleURL} disabled={!urlInput.trim()}
            style={{ padding:'10px 16px', borderRadius:'var(--r-sm)', background: urlInput.trim() ? 'var(--blue)' : 'var(--bg3)', color: urlInput.trim() ? 'var(--bg0)' : 'var(--t3)', border:'none', fontSize:'13px', fontWeight:600, cursor: urlInput.trim() ? 'pointer' : 'not-allowed' }}>
            Añadir
          </button>
        </div>
      )}

      {/* Input Nota */}
      {noteOpen && (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }} className="fade-in">
          <textarea
            value={noteInput}
            onChange={e => setNoteInput(e.target.value.slice(0, 2000))}
            placeholder="Escribe contexto adicional: antecedentes, restricciones, datos relevantes que la junta debería conocer..."
            rows={4}
            autoFocus
            style={{ width:'100%', padding:'12px 14px', background:'var(--bg3)', border:'1px solid var(--blue-bd)', borderRadius:'var(--r-sm)', color:'var(--t1)', fontSize:'13px', lineHeight:1.6, resize:'vertical', outline:'none', minHeight:'90px' }}
          />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'11px', color:'var(--t3)' }}>{noteInput.length}/2000</span>
            <button onClick={handleNote} disabled={!noteInput.trim()}
              style={{ padding:'8px 16px', borderRadius:'var(--r-sm)', background: noteInput.trim() ? 'var(--blue)' : 'var(--bg3)', color: noteInput.trim() ? 'var(--bg0)' : 'var(--t3)', border:'none', fontSize:'13px', fontWeight:600, cursor: noteInput.trim() ? 'pointer' : 'not-allowed' }}>
              Añadir nota
            </button>
          </div>
        </div>
      )}

      {/* Lista de items */}
      {items.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {items.map(item => (
            <ContextItem key={item.id} item={item} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  )
}

import React, { useState } from 'react'
import { FREE_CHAT_LIMIT } from '../hooks/useChairmanChat.js'

export default function ChairmanChat({ messages, sending, error, freeMessagesUsed, hasKey, onSend, onOpenSettings }) {
  const [input, setInput] = useState('')

  const limitReached = !hasKey && freeMessagesUsed >= FREE_CHAT_LIMIT
  const canSend = input.trim() && !sending && !limitReached

  const handleSend = () => {
    if (!canSend) return
    onSend(input)
    setInput('')
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r-xl)', overflow: 'hidden', marginBottom: '28px' }}>
      <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>💬</span>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)' }}>Pregúntale al Chairman</p>
        </div>
        {!hasKey && (
          <span style={{ fontSize: '11px', color: 'var(--t3)' }}>
            {Math.min(freeMessagesUsed, FREE_CHAT_LIMIT)}/{FREE_CHAT_LIMIT} mensajes gratis
          </span>
        )}
      </div>

      {messages.length > 0 && (
        <div style={{ padding: '18px 22px 4px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '3px 14px 14px 14px',
                background: m.role === 'user' ? 'var(--blue-dim)' : 'var(--bg3)',
                border: `1px solid ${m.role === 'user' ? 'var(--blue-bd)' : 'var(--bd)'}`,
              }}>
                {m.role === 'assistant' && (
                  <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--blue)', marginBottom: '4px' }}>🏛️ Roberto Alcántara</p>
                )}
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>
                  {m.content || (sending && i === messages.length - 1 ? '···' : '')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ margin: '0 22px', padding: '10px 14px', background: 'var(--red-dim)', border: '1px solid var(--red-bd)', borderRadius: 'var(--r-sm)', color: 'var(--red)', fontSize: '12px' }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ padding: '16px 22px' }}>
        {limitReached ? (
          <div style={{ padding: '12px 16px', background: 'var(--blue-dim)', border: '1px solid var(--blue-bd)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '12px', color: 'var(--t2)' }}>Llegaste al límite gratis de esta sesión.</p>
            <button onClick={onOpenSettings} style={{ fontSize: '12px', color: 'var(--blue)', fontWeight: 600, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
              Usar mi API key →
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canSend) handleSend() }}
              placeholder="Pregunta algo sobre el veredicto o el debate..."
              disabled={sending}
              style={{ flex: 1, padding: '11px 14px', background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 'var(--r-sm)', color: 'var(--t1)', fontSize: '13px', outline: 'none' }}
            />
            <button
              onClick={handleSend}
              disabled={!canSend}
              style={{ padding: '11px 18px', borderRadius: 'var(--r-sm)', border: 'none', background: canSend ? 'var(--blue)' : 'var(--bg3)', color: canSend ? 'var(--bg0)' : 'var(--t3)', fontSize: '13px', fontWeight: 700, cursor: canSend ? 'pointer' : 'not-allowed' }}
            >
              {sending ? '...' : 'Enviar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

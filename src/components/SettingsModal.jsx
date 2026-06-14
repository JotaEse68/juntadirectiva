import React, { useState } from 'react'

export default function SettingsModal({ onClose, onSave, currentKey }) {
  const [key, setKey] = useState(currentKey || '')
  const [visible, setVisible] = useState(false)
  const hasKey = !!key.trim()

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r-xl)', padding: '32px', width: '100%', maxWidth: '440px', animation: 'fadeUp .3s ease' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>⚙️ Acceso a la junta</h2>
        <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '24px', lineHeight: 1.5 }}>
          Elige cómo quieres conectarte.
        </p>

        <div style={{ padding: '16px', borderRadius: 'var(--r-md)', border: `1px solid ${!currentKey ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`, background: !currentKey ? 'rgba(201,168,76,0.06)' : 'transparent', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span>🌐</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: !currentKey ? 'var(--gold)' : 'var(--text)' }}>Modo gratuito</span>
            {!currentKey && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: 'rgba(201,168,76,0.15)', color: 'var(--gold)', fontWeight: 600 }}>ACTIVO</span>}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>3 reuniones por hora. Sin registro. El servidor aporta la API key.</p>
        </div>

        <div style={{ padding: '16px', borderRadius: 'var(--r-md)', border: `1px solid ${currentKey ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`, background: currentKey ? 'rgba(201,168,76,0.05)' : 'transparent', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span>🔑</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: currentKey ? 'var(--gold)' : 'var(--text)' }}>Tu API key · ilimitado</span>
            {currentKey && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: 'rgba(201,168,76,0.15)', color: 'var(--gold)', fontWeight: 600 }}>ACTIVO</span>}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5, marginBottom: '12px' }}>Reuniones ilimitadas. Llama directo a Anthropic. La key solo vive en tu navegador.</p>
          <div style={{ position: 'relative' }}>
            <input
              type={visible ? 'text' : 'password'}
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              style={{ width: '100%', padding: '10px 40px 10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: 'monospace' }}
              onFocus={e => e.target.style.borderColor = 'rgba(201,168,76,0.5)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <button onClick={() => setVisible(!visible)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: '14px', padding: '4px' }}>
              {visible ? '🙈' : '👁️'}
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none' }}>console.anthropic.com</a>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: '13px' }}>Cancelar</button>
          {currentKey && <button onClick={() => { onSave(''); onClose() }} style={{ padding: '11px 14px', borderRadius: 'var(--r-sm)', border: '1px solid rgba(255,107,107,0.3)', color: '#ff6b6b', fontSize: '13px' }}>Quitar key</button>}
          <button onClick={() => { onSave(key.trim()); onClose() }} style={{ flex: 2, padding: '11px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--gold)', color: '#0d1117', fontSize: '13px', fontWeight: 700 }}>
            {hasKey ? '🔑 Usar mi key' : '🌐 Modo gratuito'}
          </button>
        </div>
      </div>
    </div>
  )
}

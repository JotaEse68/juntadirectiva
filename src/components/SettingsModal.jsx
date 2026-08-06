import React, { useState } from 'react'
import { PROVIDER_LIST, PROVIDERS } from '../lib/providers.js'

export default function SettingsModal({ onClose, onSave, currentProvider, currentKey }) {
  const [provider, setProvider] = useState(currentProvider || 'claude')
  const [keys, setKeys] = useState({ claude: '', openai: '', gemini: '', [currentProvider || 'claude']: currentKey || '' })
  const [visible, setVisible] = useState(false)

  const key = keys[provider] || ''
  const hasKey = !!key.trim()
  const isFreeMode = !currentKey
  const p = PROVIDERS[provider]

  const setKey = (value) => setKeys(prev => ({ ...prev, [provider]: value }))

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(6,13,31,0.85)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,padding:'20px',animation:'fadeIn .2s ease' }}
      onClick={e => e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'var(--bg1)',border:'1px solid var(--blue-bd)',borderRadius:'var(--r-xl)',padding:'32px',width:'100%',maxWidth:'440px',animation:'fadeUp .3s ease' }}>
        <h2 style={{ fontSize:'18px',fontWeight:700,marginBottom:'6px',color:'var(--t1)' }}>⚙️ Acceso</h2>
        <p style={{ fontSize:'13px',color:'var(--t2)',marginBottom:'24px',lineHeight:1.5 }}>Elige cómo conectarte a la junta.</p>

        <div style={{ padding:'16px',borderRadius:'var(--r-md)',border:`1px solid ${isFreeMode?'var(--blue-bd)':'var(--bd)'}`,background:isFreeMode?'var(--blue-dim)':'transparent',marginBottom:'10px' }}>
          <div style={{ display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px' }}>
            <span>🌐</span>
            <span style={{ fontSize:'14px',fontWeight:600,color:isFreeMode?'var(--blue)':'var(--t1)' }}>Modo gratuito</span>
            {isFreeMode&&<span style={{ fontSize:'10px',padding:'2px 7px',borderRadius:'4px',background:'var(--blue-dim)',color:'var(--blue)',fontWeight:700,border:'1px solid var(--blue-bd)' }}>ACTIVO</span>}
          </div>
          <p style={{ fontSize:'12px',color:'var(--t3)',lineHeight:1.5 }}>3 reuniones por hora. Sin registro. El servidor aporta la API key (Claude).</p>
        </div>

        <div style={{ padding:'16px',borderRadius:'var(--r-md)',border:`1px solid ${!isFreeMode?'var(--blue-bd)':'var(--bd)'}`,background:!isFreeMode?'var(--blue-dim)':'transparent',marginBottom:'24px' }}>
          <div style={{ display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px' }}>
            <span>🔑</span>
            <span style={{ fontSize:'14px',fontWeight:600,color:!isFreeMode?'var(--blue)':'var(--t1)' }}>Tu API key · ilimitado</span>
            {!isFreeMode&&<span style={{ fontSize:'10px',padding:'2px 7px',borderRadius:'4px',background:'var(--blue-dim)',color:'var(--blue)',fontWeight:700,border:'1px solid var(--blue-bd)' }}>ACTIVO</span>}
          </div>

          {/* Selector de proveedor */}
          <div style={{ display:'flex',gap:'6px',marginBottom:'12px' }}>
            {PROVIDER_LIST.map(pv => (
              <button key={pv.id} onClick={() => setProvider(pv.id)}
                style={{
                  flex:1, padding:'8px 6px', borderRadius:'var(--r-sm)', fontSize:'12px', fontWeight:600,
                  border:`1px solid ${provider===pv.id?'var(--blue-bd)':'var(--bd)'}`,
                  background:provider===pv.id?'var(--blue-dim)':'var(--bg3)',
                  color:provider===pv.id?'var(--blue)':'var(--t2)',
                  cursor:'pointer', transition:'all .15s',
                }}>
                {pv.emoji} {pv.label}
              </button>
            ))}
          </div>

          <p style={{ fontSize:'12px',color:'var(--t3)',lineHeight:1.5,marginBottom:'12px' }}>{p.desc}</p>

          <div style={{ position:'relative' }}>
            <input type={visible?'text':'password'} value={key} onChange={e=>setKey(e.target.value)} placeholder={p.placeholder}
              style={{ width:'100%',padding:'10px 40px 10px 12px',background:'var(--bg0)',border:'1px solid var(--bd)',borderRadius:'var(--r-sm)',color:'var(--t1)',fontSize:'13px',outline:'none',fontFamily:'monospace',transition:'border-color .2s' }}
              onFocus={e=>e.target.style.borderColor='var(--blue-bd)'} onBlur={e=>e.target.style.borderColor='var(--bd)'} />
            <button onClick={()=>setVisible(!visible)} style={{ position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',color:'var(--t3)',fontSize:'14px',padding:'4px' }}>
              {visible?'🙈':'👁️'}
            </button>
          </div>
          <p style={{ fontSize:'11px',color:'var(--t3)',marginTop:'6px' }}>
            Consigue tu key en{' '}
            <a href={p.keyUrl} target="_blank" rel="noreferrer" style={{ color:'var(--blue)',textDecoration:'none' }}>{p.keyUrlLabel}</a>
          </p>
        </div>

        <div style={{ display:'flex',gap:'8px' }}>
          <button onClick={onClose} style={{ flex:1,padding:'11px',borderRadius:'var(--r-sm)',border:'1px solid var(--bd)',color:'var(--t2)',fontSize:'13px' }}>Cancelar</button>
          {!isFreeMode&&<button onClick={()=>{onSave('claude','');onClose()}} style={{ padding:'11px 14px',borderRadius:'var(--r-sm)',border:'1px solid var(--red-bd)',color:'var(--red)',fontSize:'13px' }}>Quitar</button>}
          <button onClick={()=>{onSave(provider, key.trim());onClose()}} style={{ flex:2,padding:'11px',borderRadius:'var(--r-sm)',border:'none',background:'var(--blue)',color:'var(--bg0)',fontSize:'13px',fontWeight:700 }}>
            {hasKey?`${p.emoji} Usar mi key de ${p.label}`:'🌐 Modo gratuito'}
          </button>
        </div>
      </div>
    </div>
  )
}

import React, { useState } from 'react'

export default function SettingsModal({ onClose, onSave, currentKey }) {
  const [key, setKey] = useState(currentKey || '')
  const [visible, setVisible] = useState(false)
  const hasKey = !!key.trim()

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(6,13,31,0.85)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,padding:'20px',animation:'fadeIn .2s ease' }}
      onClick={e => e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'var(--bg1)',border:'1px solid var(--blue-bd)',borderRadius:'var(--r-xl)',padding:'32px',width:'100%',maxWidth:'440px',animation:'fadeUp .3s ease' }}>
        <h2 style={{ fontSize:'18px',fontWeight:700,marginBottom:'6px',color:'var(--t1)' }}>⚙️ Acceso</h2>
        <p style={{ fontSize:'13px',color:'var(--t2)',marginBottom:'24px',lineHeight:1.5 }}>Elige cómo conectarte a la junta.</p>

        <div style={{ padding:'16px',borderRadius:'var(--r-md)',border:`1px solid ${!currentKey?'var(--blue-bd)':'var(--bd)'}`,background:!currentKey?'var(--blue-dim)':'transparent',marginBottom:'10px' }}>
          <div style={{ display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px' }}>
            <span>🌐</span>
            <span style={{ fontSize:'14px',fontWeight:600,color:!currentKey?'var(--blue)':'var(--t1)' }}>Modo gratuito</span>
            {!currentKey&&<span style={{ fontSize:'10px',padding:'2px 7px',borderRadius:'4px',background:'var(--blue-dim)',color:'var(--blue)',fontWeight:700,border:'1px solid var(--blue-bd)' }}>ACTIVO</span>}
          </div>
          <p style={{ fontSize:'12px',color:'var(--t3)',lineHeight:1.5 }}>3 reuniones por hora. Sin registro. El servidor aporta la API key.</p>
        </div>

        <div style={{ padding:'16px',borderRadius:'var(--r-md)',border:`1px solid ${currentKey?'var(--blue-bd)':'var(--bd)'}`,background:currentKey?'var(--blue-dim)':'transparent',marginBottom:'24px' }}>
          <div style={{ display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px' }}>
            <span>🔑</span>
            <span style={{ fontSize:'14px',fontWeight:600,color:currentKey?'var(--blue)':'var(--t1)' }}>Tu API key · ilimitado</span>
            {currentKey&&<span style={{ fontSize:'10px',padding:'2px 7px',borderRadius:'4px',background:'var(--blue-dim)',color:'var(--blue)',fontWeight:700,border:'1px solid var(--blue-bd)' }}>ACTIVO</span>}
          </div>
          <p style={{ fontSize:'12px',color:'var(--t3)',lineHeight:1.5,marginBottom:'12px' }}>Reuniones ilimitadas. Llama directo a Anthropic. La key solo vive en tu navegador.</p>
          <div style={{ position:'relative' }}>
            <input type={visible?'text':'password'} value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-ant-api03-..."
              style={{ width:'100%',padding:'10px 40px 10px 12px',background:'var(--bg0)',border:'1px solid var(--bd)',borderRadius:'var(--r-sm)',color:'var(--t1)',fontSize:'13px',outline:'none',fontFamily:'monospace',transition:'border-color .2s' }}
              onFocus={e=>e.target.style.borderColor='var(--blue-bd)'} onBlur={e=>e.target.style.borderColor='var(--bd)'} />
            <button onClick={()=>setVisible(!visible)} style={{ position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',color:'var(--t3)',fontSize:'14px',padding:'4px' }}>
              {visible?'🙈':'👁️'}
            </button>
          </div>
          <p style={{ fontSize:'11px',color:'var(--t3)',marginTop:'6px' }}>
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color:'var(--blue)',textDecoration:'none' }}>console.anthropic.com</a>
          </p>
        </div>

        <div style={{ display:'flex',gap:'8px' }}>
          <button onClick={onClose} style={{ flex:1,padding:'11px',borderRadius:'var(--r-sm)',border:'1px solid var(--bd)',color:'var(--t2)',fontSize:'13px' }}>Cancelar</button>
          {currentKey&&<button onClick={()=>{onSave('');onClose()}} style={{ padding:'11px 14px',borderRadius:'var(--r-sm)',border:'1px solid var(--red-bd)',color:'var(--red)',fontSize:'13px' }}>Quitar</button>}
          <button onClick={()=>{onSave(key.trim());onClose()}} style={{ flex:2,padding:'11px',borderRadius:'var(--r-sm)',border:'none',background:'var(--blue)',color:'var(--bg0)',fontSize:'13px',fontWeight:700 }}>
            {hasKey?'🔑 Usar mi key':'🌐 Modo gratuito'}
          </button>
        </div>
      </div>
    </div>
  )
}

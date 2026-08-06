import React from 'react'

export default function DirectorsRoster({ directors, onClickDirector }) {
  return (
    <section style={{ marginTop: '72px', paddingTop: '40px', borderTop: '1px solid var(--bd)' }}>
      <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '4px', textAlign: 'center', fontWeight: 500 }}>
        Directorio completo
      </p>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: 400, color: 'var(--t1)', textAlign: 'center', marginBottom: '32px' }}>
        Conoce a tu junta
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
        {directors.map(d => {
          const isJottarina = d.id === 'jottarina'
          const accent = isJottarina ? 'var(--red)' : 'var(--blue)'
          const accentDim = isJottarina ? 'var(--red-dim)' : 'var(--blue-dim)'
          const accentBd = isJottarina ? 'var(--red-bd)' : 'var(--blue-bd)'
          return (
            <button
              key={d.id}
              onClick={() => onClickDirector(d)}
              style={{
                textAlign: 'left', padding: '16px', borderRadius: 'var(--r-lg)',
                background: 'var(--bg2)', border: '1px solid var(--bd)',
                display: 'flex', gap: '12px', cursor: 'pointer', transition: 'all .2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = accentBd; e.currentTarget.style.background = accentDim }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.background = 'var(--bg2)' }}
            >
              <div style={{
                width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--bd)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px',
              }}>
                {d.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', marginBottom: '1px' }}>{d.name}</p>
                <p style={{ fontSize: '11px', color: accent, marginBottom: '6px' }}>{d.title}</p>
                <p style={{ fontSize: '12px', color: 'var(--t3)', lineHeight: 1.55 }}>{d.contribution}</p>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

import React from 'react'
import { classifyVote } from '../lib/consensus.js'

const VOTE_BADGE = {
  favor:  { icon: '✓', label: 'A favor' },
  contra: { icon: '✗', label: 'En contra' },
  mixto:  { icon: '~', label: 'Con matices' },
}

function Bubble({ director, state, onClick }) {
  const { status, text, error } = state
  const isStreaming = status === 'streaming'
  const isDone = status === 'done'
  const isError = status === 'error'
  const { color, colorDim, colorBorder } = director

  const vote = isDone ? classifyVote(director.id, text) : null
  const badge = vote ? VOTE_BADGE[vote] : null

  return (
    <div className="slide-in" style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'flex-start' }}>
      <button
        onClick={onClick}
        title={`Ver perfil de ${director.name}`}
        style={{
          width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
          background: colorDim, border: `1px solid ${colorBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
        }}
      >
        {director.emoji}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
          <button onClick={onClick} style={{ fontSize: '13px', fontWeight: 700, color }}>{director.name}</button>
          <span style={{ fontSize: '11px', color: 'var(--t3)' }}>{director.title}</span>
          {isStreaming && <span style={{ fontSize: '11px', color, opacity: .8 }}>escribiendo…</span>}
        </div>

        <div style={{
          padding: '12px 16px', borderRadius: '3px 14px 14px 14px',
          background: isError ? 'var(--red-dim)' : colorDim,
          border: `1px solid ${isError ? 'var(--red-bd)' : colorBorder}`,
          maxWidth: '620px',
        }}>
          {isError ? (
            <p style={{ fontSize: '13px', color: 'var(--red)' }}>No pudo responder: {error}</p>
          ) : (
            <>
              {text.split('\n').filter(l => l.trim()).map((p, i) => (
                <p key={i} style={{ fontSize: '13.5px', lineHeight: 1.65, color: 'var(--t1)', marginBottom: '8px' }}>{p}</p>
              ))}
              {isStreaming && (
                <span style={{ display: 'inline-flex', gap: '3px' }}>
                  <span className="dot" style={{ background: color }}></span>
                  <span className="dot" style={{ background: color }}></span>
                  <span className="dot" style={{ background: color }}></span>
                </span>
              )}
            </>
          )}
        </div>

        {badge && (
          <p style={{ fontSize: '11px', color, marginTop: '6px', fontWeight: 600 }}>{badge.icon} {badge.label}</p>
        )}
      </div>
    </div>
  )
}

export default function DebateChat({ directors, directorStates, onClickDirector }) {
  const started = directors.filter(d => ['streaming', 'done', 'error'].includes(directorStates[d.id]?.status))
  const pending = directors.filter(d => (directorStates[d.id]?.status || 'pending') === 'pending')

  return (
    <div>
      {started.map(d => (
        <Bubble key={d.id} director={d} state={directorStates[d.id]} onClick={() => onClickDirector(d)} />
      ))}

      {pending.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '8px 0' }}>
          <span style={{ fontSize: '11px', color: 'var(--t3)' }}>En cola:</span>
          {pending.map(d => (
            <span
              key={d.id}
              title={d.name}
              style={{
                width: '26px', height: '26px', borderRadius: '50%', opacity: .5,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--bd)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px',
              }}
            >
              {d.emoji}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

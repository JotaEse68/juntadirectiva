import React from 'react'
import { classifyVote } from '../lib/consensus.js'
import { useI18n } from '../lib/i18n.js'

function Bubble({ director, state, onClick, t }) {
  const { status, text, error } = state
  const isStreaming = status === 'streaming'
  const isDone = status === 'done'
  const isError = status === 'error'
  const { color, colorDim, colorBorder } = director

  // 'contra' es la salida interna del clasificador para "convicción condicionada a X" — una
  // recomendación constructiva con condiciones, no una oposición (ver src/lib/consensus.js).
  const VOTE_BADGE = {
    favor:  { icon: '✓', label: t('vote.favor') },
    contra: { icon: '⚡', label: t('vote.contra') },
    mixto:  { icon: '~', label: t('vote.mixto') },
  }
  const vote = isDone ? classifyVote(director.id, text) : null
  const badge = vote ? VOTE_BADGE[vote] : null

  return (
    <div className="slide-in" style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'flex-start' }}>
      <button
        onClick={onClick}
        title={t('debate.viewProfile').replace('{name}', director.name)}
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
          <span style={{ fontSize: '11px', color: 'var(--t3)' }}>{t('debate.specialty')} · {director.tags[0]}</span>
          {isStreaming && <span style={{ fontSize: '11px', color, opacity: .8 }}>{t('debate.writing')}</span>}
        </div>

        <div style={{
          padding: '12px 16px', borderRadius: '3px 14px 14px 14px',
          background: isError ? 'var(--red-dim)' : colorDim,
          border: `1px solid ${isError ? 'var(--red-bd)' : colorBorder}`,
          maxWidth: '620px',
        }}>
          {isError ? (
            <p style={{ fontSize: '13px', color: 'var(--red)' }}>{t('debate.couldNotRespond')} {error}</p>
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

export default function DebateChat({ directors, directorStates, phase = 'debating', onClickDirector }) {
  const { t } = useI18n()
  const started = directors.filter(d => ['streaming', 'done', 'error'].includes(directorStates[d.id]?.status))
  const pending = directors.filter(d => (directorStates[d.id]?.status || 'pending') === 'pending')
  const done = directors.length - pending.length - directors.filter(d => directorStates[d.id]?.status === 'streaming').length
  const estimate = phase === 'contrasting' ? '~15 s' : phase === 'verdict' ? '~20 s' : `~${Math.max(10, Math.ceil(Math.max(pending.length, 1) / 3) * 18)} s`

  return (
    <div>
      {phase !== 'done' && <div role="status" aria-live="polite" style={{ marginBottom: '16px', padding: '11px 14px', borderLeft: '2px solid var(--blue)', background: 'var(--blue-dim)', color: 'var(--t2)', fontSize: '12px' }}>
        {phase === 'contrasting' ? t('debate.contrasting') : phase === 'verdict' ? t('debate.synthesizing') : t('debate.parallelWork').replace('{done}', Math.max(done, 0)).replace('{total}', directors.length) } <span style={{ color: 'var(--blue)' }}>· {t('debate.estimated')} {estimate}</span>
      </div>}
      {started.map(d => (
        <Bubble key={d.id} director={d} state={directorStates[d.id]} onClick={() => onClickDirector(d)} t={t} />
      ))}

      {pending.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '8px 0' }}>
          <span style={{ fontSize: '11px', color: 'var(--t3)' }}>{t('debate.queued')}</span>
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

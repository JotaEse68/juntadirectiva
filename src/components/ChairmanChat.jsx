import React, { useRef, useState } from 'react'
import { FREE_CHAT_LIMIT } from '../hooks/useChairmanChat.js'
import { prepareChatAttachment } from '../lib/chatAttachments.js'
import { downloadChairmanReplyPdf } from '../lib/reportPdf.js'
import { useI18n } from '../lib/i18n.js'

export default function ChairmanChat({ messages, sending, error, freeMessagesUsed, hasKey, premiumAccess, onSend, situation }) {
  const { t, lang } = useI18n()
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [attachmentError, setAttachmentError] = useState(null)
  const fileRef = useRef(null)

  const limitReached = !hasKey && !premiumAccess && freeMessagesUsed >= FREE_CHAT_LIMIT
  const canSend = (input.trim() || attachment) && !sending && !limitReached

  const handleSend = () => {
    if (!canSend) return
    onSend(input || t('chairman.defaultAttachmentPrompt'), attachment ? [attachment] : [])
    setInput('')
    setAttachment(null)
  }

  const handleAttachment = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try { setAttachment(await prepareChatAttachment(file)); setAttachmentError(null) }
    catch (err) { setAttachmentError(err.message) }
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r-xl)', overflow: 'hidden', marginBottom: '28px' }}>
      <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>💬</span>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)' }}>{t('chairman.askTitle')}</p>
        </div>
          {!hasKey && !premiumAccess && (
          <span style={{ fontSize: '11px', color: 'var(--t3)' }}>
            {t('chairman.freeMessages').replace('{used}', Math.min(freeMessagesUsed, FREE_CHAT_LIMIT)).replace('{total}', FREE_CHAT_LIMIT)}
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
                {m.attachments?.length > 0 && <p style={{ marginTop: '6px', fontSize: '10px', color: 'var(--blue)' }}>📎 {m.attachments.join(', ')}</p>}
                {m.role === 'assistant' && m.content && premiumAccess && <button onClick={() => downloadChairmanReplyPdf({ situation, reply: m.content, lang })} style={{ marginTop: '9px', padding: '6px 9px', borderRadius: '6px', border: '1px solid var(--blue-bd)', background: 'var(--blue-dim)', color: 'var(--blue)', fontSize: '11px', fontWeight: 700 }}>{t('chairman.saveAsPdf')}</button>}
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

      {attachmentError && <div style={{ margin: '0 22px', color: 'var(--red)', fontSize: '12px' }}>⚠️ {attachmentError}</div>}

      <div style={{ padding: '16px 22px' }}>
        {limitReached ? (
          <div style={{ padding: '12px 16px', background: 'var(--blue-dim)', border: '1px solid var(--blue-bd)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '12px', color: 'var(--t2)' }}>{t('chairman.limitReached')}</p>
            <span style={{ fontSize: '12px', color: 'var(--t3)' }}>{t('chairman.limitReachedHint')}</span>
          </div>
        ) : (
          <div>
            {premiumAccess && attachment && <div style={{ marginBottom: '8px', display: 'inline-flex', gap: '7px', alignItems: 'center', padding: '6px 9px', border: '1px solid var(--blue-bd)', borderRadius: '7px', background: 'var(--blue-dim)', color: 'var(--blue)', fontSize: '11px' }}>📎 {attachment.name}<button type="button" onClick={() => setAttachment(null)} aria-label={t('chairman.removeAttachment')} style={{ color: 'var(--blue)', fontSize: '15px' }}>×</button></div>}
            <div style={{ display: 'flex', gap: '8px' }}>
            {premiumAccess && <><input ref={fileRef} type="file" accept="image/*,.pdf,.md,.txt" onChange={handleAttachment} hidden /><button type="button" onClick={() => fileRef.current?.click()} disabled={sending} title={t('chairman.attachHint')} style={{ padding: '11px', border: '1px solid var(--bd)', borderRadius: 'var(--r-sm)', color: 'var(--t2)' }}>📎</button></>}
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canSend) handleSend() }}
              placeholder={t('chairman.inputPlaceholder')}
              disabled={sending}
              style={{ flex: 1, padding: '11px 14px', background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 'var(--r-sm)', color: 'var(--t1)', fontSize: '13px', outline: 'none' }}
            />
            <button
              onClick={handleSend}
              disabled={!canSend}
              style={{ padding: '11px 18px', borderRadius: 'var(--r-sm)', border: 'none', background: canSend ? 'var(--blue)' : 'var(--bg3)', color: canSend ? 'var(--bg0)' : 'var(--t3)', fontSize: '13px', fontWeight: 700, cursor: canSend ? 'pointer' : 'not-allowed' }}
            >
              {sending ? '...' : t('chairman.send')}
            </button>
            </div>
            {!premiumAccess && <p style={{ marginTop: '8px', fontSize: '10px', color: 'var(--t3)' }}>{t('chairman.premiumNote')}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

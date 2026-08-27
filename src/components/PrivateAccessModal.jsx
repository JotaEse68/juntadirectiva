import React, { useState } from 'react'
import { useI18n } from '../lib/i18n.js'

export default function PrivateAccessModal({ onGranted }) {
  const { t } = useI18n()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const unlock = async (event) => {
    event.preventDefault()
    if (!code.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/private-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok || !data.authorized) throw new Error(data.error || t('privateAccess.couldNotValidate'))
      onGranted()
    } catch (err) {
      setError(err.message || t('privateAccess.wrongCode'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: 'var(--bg0)' }}>
      <form onSubmit={unlock} style={{ width: '100%', maxWidth: '380px', background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r-xl)', padding: '28px' }}>
        <p style={{ color: 'var(--blue)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>{t('privateAccess.kicker')}</p>
        <h1 style={{ color: 'var(--t1)', fontSize: '21px', marginBottom: '8px' }}>{t('privateAccess.title')}</h1>
        <p style={{ color: 'var(--t2)', fontSize: '13px', marginBottom: '20px' }}>{t('privateAccess.subtitle')}</p>
        <label htmlFor="private-access-code" style={{ display: 'block', color: 'var(--t2)', fontSize: '12px', marginBottom: '7px' }}>{t('privateAccess.codeLabel')}</label>
        <input id="private-access-code" type="password" value={code} onChange={event => setCode(event.target.value)} autoFocus autoComplete="current-password" style={{ width: '100%', padding: '12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--bd)', background: 'var(--bg3)', color: 'var(--t1)' }} />
        {error && <p role="alert" style={{ color: 'var(--red)', fontSize: '12px', marginTop: '10px' }}>⚠️ {error}</p>}
        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '18px', padding: '12px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--blue)', color: 'var(--bg0)', fontSize: '13px', fontWeight: 700 }}>
          {loading ? t('privateAccess.checking') : t('privateAccess.enter')}
        </button>
      </form>
    </div>
  )
}

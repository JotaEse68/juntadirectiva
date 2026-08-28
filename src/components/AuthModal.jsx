import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n.js'

export default function AuthModal({ onClose, onSend, configured = true }) {
  const { lang } = useI18n()
  const es = lang !== 'en'
  const [email, setEmail] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const captchaRef = useRef(null)
  const widgetRef = useRef(null)
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

  useEffect(() => {
    if (!turnstileSiteKey || sent) return undefined
    let cancelled = false
    const render = () => {
      if (cancelled || !captchaRef.current || !window.turnstile || widgetRef.current != null) return
      widgetRef.current = window.turnstile.render(captchaRef.current, {
        sitekey: turnstileSiteKey,
        theme: 'dark',
        callback: token => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => setError(es ? 'No pudimos cargar la comprobación de seguridad.' : 'We could not load the security check.'),
      })
    }
    const existing = document.querySelector('script[data-junta-turnstile]')
    if (existing) {
      if (window.turnstile) render()
      else existing.addEventListener('load', render, { once: true })
    } else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.juntaTurnstile = 'true'
      script.addEventListener('load', render, { once: true })
      document.head.appendChild(script)
    }
    return () => {
      cancelled = true
      if (widgetRef.current != null && window.turnstile) window.turnstile.remove(widgetRef.current)
      widgetRef.current = null
    }
  }, [turnstileSiteKey, sent, es])

  const submit = async event => {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      await onSend(email.trim(), marketingConsent, captchaToken)
      setSent(true)
    } catch (err) {
      setError(err.message || (es ? 'No pudimos enviar el enlace.' : 'We could not send the link.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="auth-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" type="button" onClick={onClose} aria-label={es ? 'Cerrar' : 'Close'}>×</button>
        <div className="auth-mark" aria-hidden="true">🏛️</div>
        <p className="auth-kicker">Junta Directiva AI</p>
        <h2 id="auth-title">{sent ? (es ? 'Mira tu correo' : 'Check your email') : (es ? 'Tu junta está preparada' : 'Your board is ready')}</h2>

        {sent ? (
          <div className="auth-message" role="status">
            <p>{es ? `Te hemos enviado un enlace a ${email}. Ábrelo y volverás directamente a tu junta.` : `We sent a link to ${email}. Open it and you will return directly to your board.`}</p>
            <p className="auth-joke">{es ? 'Sin contraseñas, sin interrogatorios y sin una reunión para preparar la reunión.' : 'No passwords, no interrogation, and no meeting to prepare the meeting.'}</p>
          </div>
        ) : (
          <form action="/" method="post" onSubmit={submit} className="auth-form">
            <p className="auth-intro">{es ? 'Introduce tu correo y tendrás dos reuniones gratis. Sin contraseña.' : 'Enter your email and get two free board meetings. No password.'}</p>
            <div className="auth-field">
              <label htmlFor="auth-email">{es ? 'Correo electrónico' : 'Email address'}</label>
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="username"
                enterKeyHint="done"
                value={email}
                onChange={event => { setEmail(event.target.value); setError('') }}
                placeholder="tu@email.com"
                required
                autoFocus
                aria-describedby="auth-help auth-error"
              />
              <span id="auth-help" className="auth-help">{es ? 'Recibirás un enlace de acceso de un solo uso.' : 'You will receive a one-time sign-in link.'}</span>
            </div>
            <label className="auth-consent">
              <input type="checkbox" name="marketing_consent" checked={marketingConsent} onChange={event => setMarketingConsent(event.target.checked)} />
              <span>{es ? 'Quiero recibir nuevas herramientas, consejos y alguna genialidad ocasional de Jota.' : 'Send me new tools, useful tips and the occasional bright idea from Jota.'}</span>
            </label>
            {turnstileSiteKey && <div className="auth-captcha" ref={captchaRef} aria-label={es ? 'Comprobación de seguridad' : 'Security check'} />}
            {!configured && <p id="auth-error" className="auth-error" role="alert">{es ? 'Supabase todavía no está conectado a esta aplicación.' : 'Supabase is not connected to this application yet.'}</p>}
            {error && <p id="auth-error" className="auth-error" role="alert" aria-live="polite">{error}</p>}
            <button className="auth-submit" type="submit" disabled={sending || !configured || Boolean(turnstileSiteKey && !captchaToken)}>
              {sending ? (es ? 'Enviando…' : 'Sending…') : (es ? 'Enviarme el acceso y convocar la junta' : 'Email my access link and convene the board')}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

import React from 'react'
import { useI18n } from '../lib/i18n.js'

export default function AccountModal({ user, account, loading, onClose, onSignOut, onOpenReport, onDownloadReport }) {
  const { lang } = useI18n()
  const es = lang !== 'en'
  const reports = account?.reports || []
  const profile = account?.profile || {}

  return (
    <div className="auth-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="auth-card account-card" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button className="auth-close" type="button" onClick={onClose} aria-label={es ? 'Cerrar' : 'Close'}>×</button>
        <p className="auth-kicker">Junta Directiva AI</p>
        <h2 id="account-title">{es ? 'Tu cuenta' : 'Your account'}</h2>
        <p className="account-email">{user?.email}</p>

        <div className="account-balances" aria-live="polite">
          <div><strong>{loading ? '…' : profile.report_credits ?? 0}</strong><span>{es ? 'informes disponibles' : 'reports available'}</span></div>
          <div><strong>{loading ? '…' : profile.extra_analysis_credits ?? 0}</strong><span>{es ? 'análisis extra' : 'extra analyses'}</span></div>
        </div>

        <div className="account-history">
          <h3>{es ? 'Informes guardados' : 'Saved reports'}</h3>
          {reports.length === 0 ? (
            <p className="account-empty">{es ? 'Todavía no hay informes. Aquí aparecerán cuando generes el primero.' : 'No reports yet. They will appear here after you generate one.'}</p>
          ) : reports.map(saved => (
            <div className="account-report-row" key={saved.id}>
              <button type="button" className="account-report" onClick={() => onOpenReport(saved)}>
                <span>{saved.situation.slice(0, 95)}{saved.situation.length > 95 ? '…' : ''}</span>
                <small>{new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(saved.created_at))}</small>
              </button>
              <button type="button" className="account-report-download" onClick={() => onDownloadReport?.(saved)} aria-label={es ? 'Descargar informe' : 'Download report'}>↓ PDF</button>
            </div>
          ))}
        </div>

        <button type="button" className="account-signout" onClick={onSignOut}>{es ? 'Cerrar sesión' : 'Sign out'}</button>
      </section>
    </div>
  )
}

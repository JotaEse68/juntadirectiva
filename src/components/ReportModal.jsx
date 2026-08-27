import React from 'react'
import { downloadExecutiveReportPdf } from '../lib/reportPdf.js'
import { useI18n } from '../lib/i18n.js'

// El informe puede llegar con encabezados en español o en inglés (ver buildReportSystem
// en useReport.js, que elige el set según el idioma de la UI) — ambos deben reconocerse aquí.
const KNOWN_HEADERS = [
  'PRIMERA VICTORIA 48 HORAS',
  'PLAN DE 3 SEMANAS',
  'ACCIONES IMPRESCINDIBLES',
  'ACCIONES NECESARIAS',
  'ACCIONES PARA MÁS ADELANTE',
  'TÚ O UN FREELANCER',
  'SEÑALES QUE MIRAR',
  'RIESGOS Y CÓMO EVITARLOS',
  'SI OCURRE ESTO HAZ AQUELLO',
  'TU LISTA DE CONFIRMACIÓN',
  'FIRST WIN IN 48 HOURS',
  '3 WEEK PLAN',
  'ESSENTIAL ACTIONS',
  'IMPORTANT ACTIONS',
  'ACTIONS FOR LATER',
  'YOU OR A FREELANCER',
  'SIGNALS TO WATCH',
  'RISKS AND HOW TO AVOID THEM',
  'IF THIS HAPPENS DO THAT',
  'YOUR CONFIRMATION CHECKLIST',
]

const SECTION_ICONS = {
  'PRIMERA VICTORIA 48 HORAS': '⚡',
  'PLAN DE 3 SEMANAS': '🗓️',
  'ACCIONES IMPRESCINDIBLES': '🎯',
  'ACCIONES NECESARIAS': '✅',
  'ACCIONES PARA MÁS ADELANTE': '🌱',
  'TÚ O UN FREELANCER': '🙋',
  'SEÑALES QUE MIRAR': '📊',
  'RIESGOS Y CÓMO EVITARLOS': '⚠️',
  'SI OCURRE ESTO HAZ AQUELLO': '🔀',
  'TU LISTA DE CONFIRMACIÓN': '✔️',
  'FIRST WIN IN 48 HOURS': '⚡',
  '3 WEEK PLAN': '🗓️',
  'ESSENTIAL ACTIONS': '🎯',
  'IMPORTANT ACTIONS': '✅',
  'ACTIONS FOR LATER': '🌱',
  'YOU OR A FREELANCER': '🙋',
  'SIGNALS TO WATCH': '📊',
  'RISKS AND HOW TO AVOID THEM': '⚠️',
  'IF THIS HAPPENS DO THAT': '🔀',
  'YOUR CONFIRMATION CHECKLIST': '✔️',
}

function iconForTitle(title) {
  const upper = title.toUpperCase()
  const key = KNOWN_HEADERS.find(h => upper === h || upper.startsWith(h))
  return key ? SECTION_ICONS[key] : '📌'
}

// Una línea "---" del modelo se trata como separador visual (<hr>), no como texto literal —
// también marca dónde termina la parte "checklist" de TU LISTA DE CONFIRMACIÓN y empieza la
// despedida en prosa (ver CIERRE en REPORT_SYSTEM_PAID, useReport.js), para no ponerle
// casilla de checklist a un párrafo de despedida.
function parseSections(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const sections = []
  let current = null
  for (const line of lines) {
    if (/^-{3,}$/.test(line)) {
      current?.lines.push({ divider: true })
      continue
    }
    const clean = line.replace(/^#+\s*/, '').replace(/\*\*/g, '')
    const isHeader = KNOWN_HEADERS.some(h => clean.toUpperCase() === h || clean.toUpperCase().startsWith(h))
    if (isHeader) {
      current = { title: clean, lines: [] }
      sections.push(current)
    } else if (current) {
      current.lines.push({ text: clean })
    } else {
      current = { title: '', lines: [{ text: clean }] }
      sections.push(current)
    }
  }
  return sections
}

// Limpia negrita/cursiva markdown (**doble** y *simple*, este último se cuela sobre todo en
// las opiniones exprés de los directores, que nunca pasan por parseSections) y convierte
// [texto](url) y URLs sueltas en enlaces clicables reales. Se usa tanto en las secciones del
// informe como en las opiniones exprés.
function renderRichText(rawText) {
  const text = rawText.replace(/\*\*/g, '').replace(/\*/g, '')
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/g
  const parts = []
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const [href, label] = m[1] ? [m[2], m[1]] : [m[3], m[3]]
    parts.push(
      <a key={m.index} href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'underline' }}>
        {label}
      </a>
    )
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export default function ReportModal({ situation, verdict, report, loading, error, onClose, onUpgrade, upgrading }) {
  const { t, lang } = useI18n()
  const handleDownload = () => {
    downloadExecutiveReportPdf({ situation, verdict, report, lang })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,13,31,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: '20px', animation: 'fadeIn .2s ease' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--blue-bd)', borderRadius: 'var(--r-xl)', width: '100%', maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', animation: 'fadeUp .3s ease' }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '10px', color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '2px', fontWeight: 500 }}>Junta Directiva AI</p>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--t1)' }}>
              {report?.locked ? t('report.titleLocked') : t('report.title')}
            </p>
          </div>
          <button onClick={onClose} style={{ fontSize: '18px', color: 'var(--t3)', padding: '4px 8px' }}>×</button>
        </div>

        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: '13px', color: 'var(--blue)', marginBottom: '12px' }}>
                {t('report.loadingText')}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '5px' }}>
                <span className="dot"></span><span className="dot"></span><span className="dot"></span>
              </div>
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: '14px 18px', background: 'var(--red-dim)', border: '1px solid var(--red-bd)', borderRadius: 'var(--r-md)', color: 'var(--red)', fontSize: '13px' }}>
              ⚠️ {error}
            </div>
          )}

          {report && !loading && (
            <>
              {parseSections(report.text).map((section, i) => {
                const isChecklist = section.title.toUpperCase().startsWith('TU LISTA DE CONFIRMACIÓN') || section.title.toUpperCase().startsWith('YOUR CONFIRMATION CHECKLIST')
                let pastDivider = false
                return (
                  <div key={i} style={{ marginBottom: '26px' }}>
                    {section.title && (
                      <p style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--blue)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span style={{ fontSize: '14px' }}>{iconForTitle(section.title)}</span>
                        {section.title}
                      </p>
                    )}
                    {section.lines.map((l, j) => {
                      if (l.divider) {
                        pastDivider = true
                        return <hr key={j} style={{ border: 'none', borderTop: '1px solid var(--bd)', margin: '16px 0' }} />
                      }
                      const showCheckbox = isChecklist && !pastDivider
                      // El modelo a veces ya escribe su propia sintaxis "- [ ] " de checklist —
                      // se quita para no duplicar la casilla junto con la que dibuja esta vista.
                      const lineText = showCheckbox ? l.text.replace(/^-?\s*\[[ xX]?\]\s*/, '').replace(/^-\s+/, '') : l.text
                      return (
                        <p key={j} style={{ fontSize: '13.5px', lineHeight: 1.75, color: 'var(--t1)', marginBottom: '10px', display: showCheckbox ? 'flex' : 'block', gap: showCheckbox ? '9px' : 0 }}>
                          {showCheckbox && <span style={{ flexShrink: 0, color: 'var(--blue)' }}>☐</span>}
                          <span>{renderRichText(lineText)}</span>
                        </p>
                      )
                    })}
                  </div>
                )
              })}

              {report.locked && (
                <div style={{ marginBottom: '22px', padding: '18px', borderRadius: 'var(--r-md)', border: '1px dashed var(--blue-bd)', background: 'var(--blue-dim)' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '8px' }}>
                    🔒 Plan de mejora paso a paso
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--t2)', lineHeight: 1.6, marginBottom: '12px' }}>
                    {t('report.lockedDesc')}
                  </p>
                  <button
                    onClick={onUpgrade}
                    disabled={upgrading}
                    style={{ padding: '10px 18px', borderRadius: 'var(--r-sm)', border: 'none', background: upgrading ? 'var(--bg3)' : 'var(--blue)', color: upgrading ? 'var(--t2)' : 'var(--bg0)', fontSize: '13px', fontWeight: 700, cursor: upgrading ? 'not-allowed' : 'pointer' }}
                  >
                    {upgrading ? t('dailyLimit.processing') : t('report.upgradeCta')}
                  </button>
                </div>
              )}

              {report.quickTakes?.length > 0 && (
                <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--bd)' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '14px' }}>
                    {t('report.quickTakesHeader')}
                  </p>
                  {report.quickTakes.map(({ director, text }) => (
                    <div key={director.id} style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, background: director.colorDim, border: `1px solid ${director.colorBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                        {director.emoji}
                      </div>
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: 700, color: director.color, marginBottom: '2px' }}>{director.name} <span style={{ fontWeight: 400, color: 'var(--t3)' }}>· {director.title}</span></p>
                        <p style={{ fontSize: '13px', color: 'var(--t2)', lineHeight: 1.6 }}>{renderRichText(text)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {report && !loading && (
          <div style={{ padding: '16px 28px', borderTop: '1px solid var(--bd)', display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 'var(--r-sm)', border: '1px solid var(--bd)', color: 'var(--t2)', fontSize: '13px' }}>{t('report.close')}</button>
            {!report.locked && (
              <button onClick={handleDownload} style={{ flex: 2, padding: '11px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--blue)', color: 'var(--bg0)', fontSize: '13px', fontWeight: 700 }}>
                {t('report.downloadPdf')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

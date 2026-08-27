import React from 'react'
import { useI18n } from '../lib/i18n.js'

export default function DownloadBanner({ ready = true, loading, credits, onGenerate, onBuy, buying }) {
  const { t } = useI18n()
  const hasCredits = credits > 0

  return (
    <div style={{
      borderTop: '1px solid var(--bd)',
      borderBottom: '1px solid var(--bd)',
      padding: '24px 2px',
      display: 'flex',
      textAlign: 'left',
      alignItems: 'center',
      gap: '28px',
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: '1 1 250px', minWidth: '220px' }}>
        <p style={{ fontSize: '10px', color: 'var(--blue)', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '7px' }}>
          {ready ? t('download.readyKicker') : t('download.notReadyKicker')}
        </p>
        <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', lineHeight: 1.2, color: 'var(--t1)', marginBottom: '8px' }}>
          {ready ? t('download.readyTitle') : t('download.notReadyTitle')}
        </p>
        <p style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.6, maxWidth: '390px' }}>
          {ready ? t('download.readyBody') : t('download.notReadyBody')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(125px, 1fr))', gap: '12px', flex: '1 1 270px' }}>
        <div style={{ paddingLeft: '12px', borderLeft: '2px solid var(--bd)' }}>
          <p style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '.08em', fontWeight: 700, marginBottom: '4px' }}>{t('download.step1Label')}</p>
          <p style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: 1.45 }}>{t('download.step1Body')}</p>
          <p style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '5px' }}>{t('download.step1Included')}</p>
        </div>
        <div style={{ paddingLeft: '12px', borderLeft: '2px solid var(--blue)' }}>
          <p style={{ fontSize: '10px', color: 'var(--blue)', letterSpacing: '.08em', fontWeight: 700, marginBottom: '4px' }}>{t('download.step2Label')}</p>
          <p style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: 1.45 }}>{t('download.step2Body')}</p>
          <p style={{ fontSize: '11px', color: 'var(--blue)', marginTop: '5px' }}>{ready ? t('download.step2Ready') : t('download.step2NotReady')}</p>
        </div>
      </div>

      {ready && !hasCredits && (
        <div style={{ width: '100%', padding: '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--bg3)', border: '1px solid var(--bd)' }}>
          <p style={{ fontSize: '10px', color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '9px' }}>{t('download.previewKicker')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', color: 'var(--t2)', fontSize: '12px' }}>
            <span>{t('download.previewItem1')}</span>
            <span>{t('download.previewItem2')}</span>
            <span>{t('download.previewItem3')}</span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '9px' }}>{t('download.previewFooter')}</p>
        </div>
      )}

      {hasCredits && (
        <p style={{ width: '100%', fontSize: '11px', color: 'var(--blue)', marginTop: '-12px' }}>
          {t('download.creditsAvailable').replace('{n}', credits).replace('{plural}', credits !== 1 ? 's' : '').replace('{plural2}', credits !== 1 ? 'es' : '')}
        </p>
      )}

      {ready && (hasCredits ? (
        <button
          onClick={onGenerate}
          disabled={loading}
          style={{
            padding: '11px 22px',
            borderRadius: 'var(--r-md)',
            background: loading ? 'var(--bg3)' : 'var(--blue)',
            color: loading ? 'var(--t2)' : 'var(--bg0)',
            fontSize: '13px', fontWeight: 700,
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all .2s',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {loading ? t('download.generating') : t('download.generateCta')}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={() => onBuy('bundle')}
            disabled={buying}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--r-md)',
              background: buying ? 'var(--bg3)' : 'var(--blue)',
              color: buying ? 'var(--t2)' : 'var(--bg0)',
              fontSize: '13px', fontWeight: 700,
              border: 'none', cursor: buying ? 'not-allowed' : 'pointer',
              transition: 'all .2s',
              display: 'flex', alignItems: 'center', gap: '8px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{t('download.bundleLabel')}</span>
            <span style={{ fontWeight: 400, opacity: .8 }}>{t('download.bundlePrice')}</span>
          </button>

          <button
            onClick={() => onBuy('single')}
            disabled={buying}
            style={{
              padding: '9px 20px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--blue-bd)',
              background: 'transparent',
              color: 'var(--blue)',
              fontSize: '12px', fontWeight: 500,
              cursor: buying ? 'not-allowed' : 'pointer',
              transition: 'all .2s',
              display: 'flex', alignItems: 'center', gap: '8px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{t('download.singleLabel')}</span>
            <span style={{ opacity: .7 }}>{t('download.singlePrice')}</span>
          </button>

          <p style={{ fontSize: '10px', color: 'var(--t3)', textAlign: 'right' }}>
            {t('download.oneTimeNote')}
          </p>
        </div>
      ))}
    </div>
  )
}

import { useCallback, useState } from 'react'
import { authorizedFetch } from '../lib/supabaseClient.js'

// Centraliza los dos productos y el estado del salto a Stripe. App.jsx solo coordina
// la pantalla; esta pieza se ocupa de preparar la sesión y conservar el contexto mínimo.
export function useCheckout({ user, t, onAuthRequired, reportContext, situationContext }) {
  const [buyingReport, setBuyingReport] = useState(false)
  const [buyingExtra, setBuyingExtra] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)

  const startCheckout = useCallback(async (product, setBuying, pending) => {
    if (!user) { onAuthRequired?.(); return }
    setCheckoutError(null)
    setBuying(true)
    try {
      const response = await authorizedFetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t('checkout.createFailed'))
      try { sessionStorage.setItem(pending.key, JSON.stringify(pending.value)) } catch {}
      window.location.href = data.url
    } catch (error) {
      setCheckoutError(error.message)
      setBuying(false)
    }
  }, [user, onAuthRequired, t])

  const buyReport = useCallback(() => startCheckout('single', setBuyingReport, {
    key: 'junta_pending_report_context', value: reportContext,
  }), [startCheckout, reportContext])

  const buyExtra = useCallback(() => startCheckout('extra', setBuyingExtra, {
    key: 'junta_pending_situation', value: situationContext,
  }), [startCheckout, situationContext])

  return { buyingReport, buyingExtra, checkoutError, setCheckoutError, buyReport, buyExtra }
}

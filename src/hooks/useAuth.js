import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabaseClient.js'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return undefined
    }
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session || null)
        setLoading(false)
      }
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const sendMagicLink = useCallback(async (email, marketingConsent, captchaToken = '') => {
    if (!supabase) throw new Error('El acceso por correo todavía no está configurado.')
    const response = await fetch('/api/auth-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, marketingConsent, captchaToken }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'No pudimos enviar el enlace.')
    if (marketingConsent) localStorage.setItem('junta_pending_marketing_consent', '1')
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
  }, [])

  return {
    configured: supabaseConfigured,
    loading,
    session,
    user: session?.user || null,
    sendMagicLink,
    signOut,
  }
}

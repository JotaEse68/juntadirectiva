import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.js'
import { authorizedFetch } from '../lib/supabaseClient.js'

export function useAccount() {
  const auth = useAuth()
  const [account, setAccount] = useState(null)
  const [accountLoading, setAccountLoading] = useState(false)

  const refreshAccount = useCallback(async () => {
    if (!auth.user) { setAccount(null); return null }
    setAccountLoading(true)
    try {
      const response = await authorizedFetch('/api/account')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar la cuenta')
      setAccount(data)
      return data
    } catch (error) {
      console.error('account refresh error:', error)
      return null
    } finally {
      setAccountLoading(false)
    }
  }, [auth.user])

  useEffect(() => {
    if (!auth.user) { setAccount(null); return }
    refreshAccount()
    if (localStorage.getItem('junta_pending_marketing_consent') === '1') {
      authorizedFetch('/api/account', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'marketing-consent', consent: true }),
      }).finally(() => localStorage.removeItem('junta_pending_marketing_consent'))
    }
  }, [auth.user, refreshAccount])

  const signOut = useCallback(async () => {
    await auth.signOut()
    setAccount(null)
  }, [auth])

  return { ...auth, account, accountLoading, refreshAccount, signOut }
}


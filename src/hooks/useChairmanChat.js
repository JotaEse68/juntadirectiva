import { useState, useCallback } from 'react'
import { streamCompletion } from '../lib/aiClient.js'
import { useI18n } from '../lib/i18n.js'

export const FREE_CHAT_LIMIT = 10

function buildChairmanSystem({ situation, activeDirectors, directorStates, verdict }) {
  const debateSummary = activeDirectors
    .map(d => `${d.name} (${d.title}): ${directorStates[d.id]?.text || ''}`)
    .join('\n\n')

  return `Eres Roberto Alcántara, Chairman de la Junta Directiva AI. Acabas de sintetizar el debate de la junta sobre la situación del usuario y ya diste tu veredicto. Ahora el usuario te hace preguntas de seguimiento directamente a ti.

SITUACIÓN ORIGINAL:
${situation}

DEBATE COMPLETO DE LA JUNTA:
${debateSummary}

TU VEREDICTO YA ENTREGADO:
${verdict}

Responde las preguntas de seguimiento con el mismo tono directo y ejecutivo del veredicto. Puedes citar a directores específicos del debate cuando sea relevante. Sé conciso: 2-4 párrafos como máximo, salvo que el usuario pida explícitamente más detalle.
Mantén la misma disciplina que el resto de la junta: nunca inventes cifras del negocio del usuario (facturación, costes, equipo) que no te haya dado — pídelas si las necesitas. Si puedes nombrar una herramienta, automatización o IA que le facilite el camino, hazlo como opción concreta y ejecutable por él solo. Nada de jerga corporativa.`
}

export function useChairmanChat() {
  const { lang, t } = useI18n()
  const [messages, setMessages] = useState([]) // { role: 'user'|'assistant', content }
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const sendMessage = useCallback(async (text, attachments = [], sessionContext, { apiKey, provider }) => {
    const question = text.trim()
    if (!question) return

    setSending(true)
    setError(null)
    setMessages(prev => [...prev, { role: 'user', content: question, attachments: attachments.map(a => a.name) }, { role: 'assistant', content: '' }])

    try {
      const system = buildChairmanSystem(sessionContext)
      const history = messages.map(m => `${m.role === 'user' ? 'Usuario' : 'Roberto'}: ${m.content}`).join('\n\n')
      const attachmentContext = attachments.filter(a => a.kind === 'text').map(a => `\n\nADJUNTO: ${a.name}\n${a.text}`).join('')
      const languageLine = lang === 'en' ? '\n\nAnswer in English — natural, warm and direct, not a literal translation.' : ''
      const userMsg = history
        ? `${history}\n\nUsuario: ${question}\n\nResponde como Roberto.`
        : `Usuario: ${question}\n\nResponde como Roberto.`

      const reply = await streamCompletion({
        provider, apiKey, system, userMsg: userMsg + attachmentContext + languageLine, maxTokens: 700, attachments,
        onChunk: (partial) => {
          setMessages(prev => {
            const next = prev.slice()
            next[next.length - 1] = { role: 'assistant', content: partial }
            return next
          })
        },
      })
      setMessages(prev => {
        const next = prev.slice()
        next[next.length - 1] = { role: 'assistant', content: reply }
        return next
      })
    } catch (err) {
      setError(err.message || t('chairman.sendFailed'))
      setMessages(prev => prev.slice(0, -2)) // quita el par user+placeholder fallido
    } finally {
      setSending(false)
    }
  }, [messages, lang, t])

  const reset = useCallback(() => { setMessages([]); setError(null) }, [])

  const freeMessagesUsed = messages.filter(m => m.role === 'user').length

  return { messages, sending, error, freeMessagesUsed, sendMessage, reset }
}

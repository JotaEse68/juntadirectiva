import { useState, useCallback } from 'react'
import { useI18n } from '../lib/i18n.js'

// Extrae texto de PDF usando pdf.js desde CDN
async function extractPDF(file) {
  const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let fullText = ''

  for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    fullText += pageText + '\n'
  }
  return fullText.slice(0, 8000)
}

// Extrae texto de Word (.docx) usando mammoth desde CDN
async function extractDOCX(file) {
  const mammoth = (await import('https://cdn.jsdelivr.net/npm/mammoth@1.7.0/mammoth.browser.esm.js')).default
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value.slice(0, 8000)
}

// Extrae texto de Markdown — ya es texto plano, se lee directo
async function extractMD(file) {
  const text = await file.text()
  return text.slice(0, 8000)
}

// Un modelo puede devolver una negativa aunque se le haya enviado texto válido.
// No la tratamos como un resumen listo para debatir: el usuario necesita un error
// claro para volver a intentar el archivo, no una junta analizando una ausencia.
function isUsefulSummary(summary) {
  const normalized = (summary || '').trim().toLowerCase()
  if (normalized.length < 80) return false
  return ![
    'no hay proyecto que analizar',
    'no incluye ningún contenido',
    'no tengo ningún material',
    'no tengo suficiente información para analizar',
    'no content to analyze',
  ].some(message => normalized.includes(message))
}

export function useContextBuilder() {
  const { t, lang } = useI18n()
  const [items, setItems]     = useState([]) // { id, type, name, status, summary, error }
  const [processing, setProcessing] = useState(false)

  const addItem = useCallback((partial) => {
    const id = Date.now() + Math.random()
    const item = { id, status: 'pending', summary: '', error: null, ...partial }
    setItems(prev => [...prev, item])
    return id
  }, [])

  const updateItem = useCallback((id, patch) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }, [])

  const removeItem = useCallback((id) => {
    setItems(prev => prev.filter(it => it.id !== id))
  }, [])

  // Envía al servidor para resumir
  const summarizeViaServer = async (type, payload, apiKey, provider) => {
    const body = { type, clientApiKey: apiKey || undefined, provider: provider || 'claude', lang, ...payload }
    const res = await fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
    return data.summary
  }

  // Procesa un archivo (PDF, Word o Markdown)
  const processFile = useCallback(async (file, apiKey, provider) => {
    const ext = file.name.split('.').pop().toLowerCase()
    const id = addItem({ type: 'file', name: file.name, status: 'extracting' })

    if (!['pdf', 'doc', 'docx', 'md'].includes(ext)) {
      updateItem(id, { status: 'error', error: t('context.onlyPdfWordMd') })
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      updateItem(id, { status: 'error', error: t('context.fileTooLarge') })
      return
    }

    try {
      // 1. Extraer texto en el cliente
      let extracted = ''
      if (ext === 'pdf') {
        extracted = await extractPDF(file)
      } else if (ext === 'md') {
        extracted = await extractMD(file)
      } else {
        extracted = await extractDOCX(file)
      }

      if (!extracted.trim()) {
        updateItem(id, { status: 'error', error: t('context.couldNotExtractText') })
        return
      }

      updateItem(id, { status: 'summarizing' })

      // 2. Resumir via servidor
      const summary = await summarizeViaServer('extracted', { content: extracted }, apiKey, provider)
      if (!isUsefulSummary(summary)) {
        throw new Error(t('context.couldNotSummarizeDoc'))
      }
      updateItem(id, { status: 'done', summary })

    } catch (err) {
      updateItem(id, { status: 'error', error: err.message || t('context.processingFileError') })
    }
  }, [addItem, updateItem, t])

  // Procesa una URL
  const processURL = useCallback(async (url, apiKey, provider) => {
    if (!url.trim()) return
    // Antes de este fix, una URL inválida devolvía { error } sin crear ningún item — el
    // panel (ContextPanel.jsx) no comprueba el valor de retorno, así que el usuario veía el
    // panel cerrarse sin ningún aviso, como si hubiera funcionado. Ahora sigue el mismo
    // patrón que el resto del archivo: siempre crea el item primero y lo marca en error.
    const id = addItem({ type: 'url', name: url, status: 'fetching' })
    try { new URL(url) } catch {
      updateItem(id, { status: 'error', error: t('context.invalidUrl') })
      return
    }

    try {
      const summary = await summarizeViaServer('url', { url }, apiKey, provider)
      if (!isUsefulSummary(summary)) throw new Error(t('context.couldNotSummarizePage'))
      updateItem(id, { status: 'done', summary })
    } catch (err) {
      updateItem(id, { status: 'error', error: err.message || t('context.couldNotAccessUrl') })
    }
  }, [addItem, updateItem, t])

  // Añade una nota de texto libre
  const addNote = useCallback(async (text, apiKey, provider) => {
    if (!text.trim()) return
    const id = addItem({ type: 'note', name: t('context.noteName'), status: 'summarizing' })
    try {
      // Notas cortas: pasar directas sin resumir
      if (text.length < 600) {
        updateItem(id, { status: 'done', summary: text.trim() })
      } else {
        const summary = await summarizeViaServer('note', { content: text }, apiKey, provider)
        if (!isUsefulSummary(summary)) throw new Error(t('context.couldNotSummarizeNote'))
        updateItem(id, { status: 'done', summary })
      }
    } catch (err) {
      updateItem(id, { status: 'error', error: err.message })
    }
  }, [addItem, updateItem, t])

  // Construye el bloque de contexto para los directores
  const buildContextBlock = useCallback(() => {
    const done = items.filter(it => it.status === 'done' && it.summary)
    if (done.length === 0) return ''

    // Ojo: la etiqueta NO debe empezar con la URL cruda ("URL: https://...") — algunos
    // modelos lo leen como una instrucción para navegar el enlace en vivo y se niegan,
    // aunque el resumen ya extraído esté justo debajo. Se deja claro que ya está resuelto.
    const sections = done.map(it => {
      const label = it.type === 'file' ? `Documento ya leído: ${it.name}`
        : it.type === 'url' ? `Página web ya visitada y resumida (fuente: ${it.name})`
        : 'Nota adicional del usuario'
      return `[${label} — usa este resumen tal cual, no hace falta acceder a la fuente original]\n${it.summary}`
    }).join('\n\n')

    return `CONTEXTO ADICIONAL PARA EL ANÁLISIS:\n${sections}`
  }, [items])

  const hasContext = items.some(it => it.status === 'done')
  const isProcessing = items.some(it => ['extracting', 'summarizing', 'fetching'].includes(it.status))

  // Cuando no hay texto escrito, este briefing se convierte en la situación de
  // partida. Así un PDF por sí solo basta para convocar la junta.
  const buildSituationBrief = useCallback(() => {
    const done = items.filter(it => it.status === 'done' && it.summary)
    return done.map(it => `${it.type === 'file' ? `Documento de apoyo: ${it.name}` : it.type === 'url' ? `Fuente web: ${it.name}` : 'Nota de apoyo'}\n${it.summary}`).join('\n\n')
  }, [items])

  return {
    items, addNote, processFile, processURL, removeItem,
    buildContextBlock, buildSituationBrief, hasContext, isProcessing,
  }
}

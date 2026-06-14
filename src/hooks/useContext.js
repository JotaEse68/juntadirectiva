import { useState, useCallback } from 'react'

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

export function useContextBuilder() {
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
  const summarizeViaServer = async (type, payload, apiKey) => {
    const body = { type, clientApiKey: apiKey || undefined, ...payload }
    const res = await fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
    return data.summary
  }

  // Procesa un archivo (PDF o Word)
  const processFile = useCallback(async (file, apiKey) => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'doc', 'docx'].includes(ext)) {
      return { error: 'Solo se admiten PDF y Word (.doc, .docx)' }
    }
    if (file.size > 20 * 1024 * 1024) {
      return { error: 'Archivo demasiado grande (máx 20MB)' }
    }

    const id = addItem({ type: 'file', name: file.name, status: 'extracting' })

    try {
      // 1. Extraer texto en el cliente
      let extracted = ''
      if (ext === 'pdf') {
        extracted = await extractPDF(file)
      } else {
        extracted = await extractDOCX(file)
      }

      if (!extracted.trim()) {
        updateItem(id, { status: 'error', error: 'No se pudo extraer texto del archivo' })
        return
      }

      updateItem(id, { status: 'summarizing' })

      // 2. Resumir via servidor
      const summary = await summarizeViaServer('extracted', { content: extracted }, apiKey)
      updateItem(id, { status: 'done', summary })

    } catch (err) {
      updateItem(id, { status: 'error', error: err.message || 'Error procesando archivo' })
    }
  }, [addItem, updateItem])

  // Procesa una URL
  const processURL = useCallback(async (url, apiKey) => {
    if (!url.trim()) return
    try { new URL(url) } catch {
      return { error: 'URL inválida' }
    }

    const id = addItem({ type: 'url', name: url, status: 'fetching' })

    try {
      const summary = await summarizeViaServer('url', { url }, apiKey)
      updateItem(id, { status: 'done', summary })
    } catch (err) {
      updateItem(id, { status: 'error', error: err.message || 'No se pudo acceder a la URL' })
    }
  }, [addItem, updateItem])

  // Añade una nota de texto libre
  const addNote = useCallback(async (text, apiKey) => {
    if (!text.trim()) return
    const id = addItem({ type: 'note', name: 'Nota', status: 'summarizing' })
    try {
      // Notas cortas: pasar directas sin resumir
      if (text.length < 600) {
        updateItem(id, { status: 'done', summary: text.trim() })
      } else {
        const summary = await summarizeViaServer('note', { content: text }, apiKey)
        updateItem(id, { status: 'done', summary })
      }
    } catch (err) {
      updateItem(id, { status: 'error', error: err.message })
    }
  }, [addItem, updateItem])

  // Construye el bloque de contexto para los directores
  const buildContextBlock = useCallback(() => {
    const done = items.filter(it => it.status === 'done' && it.summary)
    if (done.length === 0) return ''

    const sections = done.map(it => {
      const label = it.type === 'file' ? `Documento: ${it.name}`
        : it.type === 'url' ? `URL: ${it.name}`
        : 'Nota adicional'
      return `[${label}]\n${it.summary}`
    }).join('\n\n')

    return `CONTEXTO ADICIONAL PARA EL ANÁLISIS:\n${sections}`
  }, [items])

  const hasContext = items.some(it => it.status === 'done')
  const isProcessing = items.some(it => ['extracting', 'summarizing', 'fetching'].includes(it.status))

  return {
    items, addNote, processFile, processURL, removeItem,
    buildContextBlock, hasContext, isProcessing,
  }
}

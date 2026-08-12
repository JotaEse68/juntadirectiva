import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker
const MAX_BYTES = 8 * 1024 * 1024
const MAX_TEXT = 8000

function base64(buffer) {
  let binary = ''; const bytes = new Uint8Array(buffer)
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function readPdf(file) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  let text = ''
  for (let page = 1; page <= Math.min(pdf.numPages, 20); page++) {
    const content = await (await pdf.getPage(page)).getTextContent()
    text += content.items.map(item => item.str).join(' ') + '\n'
  }
  if (!text.trim()) throw new Error('No se pudo extraer texto del PDF')
  return text.slice(0, MAX_TEXT)
}

export async function prepareChatAttachment(file) {
  if (!file) return null
  if (file.size > MAX_BYTES) throw new Error('El adjunto supera el máximo de 8 MB')
  const lower = file.name.toLowerCase()
  if (file.type.startsWith('image/')) return { kind: 'image', name: file.name, mimeType: file.type, data: base64(await file.arrayBuffer()) }
  if (lower.endsWith('.pdf')) return { kind: 'text', name: file.name, mimeType: 'application/pdf', text: await readPdf(file) }
  if (lower.endsWith('.md') || lower.endsWith('.txt')) return { kind: 'text', name: file.name, mimeType: file.type || 'text/plain', text: (await file.text()).slice(0, MAX_TEXT) }
  throw new Error('Adjunta una imagen, PDF, Markdown o texto')
}

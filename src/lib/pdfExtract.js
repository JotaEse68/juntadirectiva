// Extrae texto de un PDF con el paquete pdfjs-dist ya incluido en package.json — antes había
// dos implementaciones distintas: esta (bundle npm) para adjuntos del chat del Chairman, y
// otra en useContext.js que cargaba pdfjs desde una CDN externa (jsdelivr) fijada a una
// versión antigua distinta de la que ya trae el proyecto. Una sola fuente evita que las dos
// versiones diverjan y quita una dependencia de red externa para subir un PDF de contexto.
export async function extractPdfText(file, { maxPages = 20, maxChars = 8000 } = {}) {
  const [pdfjsLib, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  let text = ''
  for (let page = 1; page <= Math.min(pdf.numPages, maxPages); page++) {
    const content = await (await pdf.getPage(page)).getTextContent()
    text += content.items.map(item => item.str).join(' ') + '\n'
  }
  return text.slice(0, maxChars)
}

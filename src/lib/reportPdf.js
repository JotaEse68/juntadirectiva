const NAVY = [6, 13, 31]
const BLUE = [56, 182, 255]
const TEAL = [35, 190, 174]
const INK = [30, 42, 68]
const MUTED = [93, 110, 142]

// El PDF es texto plano via jsPDF (sin soporte de enlaces clicables ni negrita inline aqui),
// asi que el markdown que trae el informe se limpia a algo legible en vez de mostrarse literal:
// "[Google Sheets](https://...)" -> "Google Sheets (https://...)" y "**palabra**" -> "palabra".
// Las lineas "---" (separadores visuales en la vista del modal) no aportan nada en PDF, se quitan.
function safe(value = '') {
  return String(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    .replace(/\*\*/g, '')
    .replace(/(^|\s)-{2,}(\s|$)/g, ' ')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitSections(text = '') {
  return String(text).split(/\n(?=[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ /0-9]{4,}$)/m).filter(Boolean)
}

export async function downloadExecutiveReportPdf({ situation, verdict, report }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const margin = 18
  const width = 210 - margin * 2
  let y = 20

  const footer = () => {
    const page = doc.getNumberOfPages()
    doc.setDrawColor(...BLUE); doc.setLineWidth(.35); doc.line(margin, 287, 210 - margin, 287)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
    doc.text('Junta Directiva AI · Documento ejecutivo confidencial', margin, 292)
    doc.text(String(page), 210 - margin, 292, { align: 'right' })
  }
  const next = () => { footer(); doc.addPage(); y = 20 }
  const paragraph = (text, { size = 10.5, color = INK, gap = 6, bold = false } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color)
    const lines = doc.splitTextToSize(safe(text), width)
    const height = lines.length * (size * .42)
    if (y + height > 276) next()
    doc.text(lines, margin, y); y += height + gap
  }
  const title = (text) => {
    if (y > 246) next()
    doc.setDrawColor(...BLUE); doc.setLineWidth(1.3); doc.line(margin, y - 1, margin + 10, y - 1)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...BLUE)
    doc.text(safe(text), margin, y + 5); y += 13
  }

  doc.setFillColor(...NAVY); doc.rect(0, 0, 210, 297, 'F')
  doc.setFillColor(...BLUE); doc.circle(188, 26, 35, 'F')
  doc.setFillColor(...TEAL); doc.circle(168, 275, 46, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255)
  doc.text('JD', margin, 28)
  doc.setFontSize(8); doc.setTextColor(194, 226, 255); doc.text('JUNTA DIRECTIVA AI', margin, 35)
  doc.setFontSize(29); doc.setTextColor(255, 255, 255); doc.text('Informe ejecutivo', margin, 78)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(214, 226, 246)
  const coverLines = doc.splitTextToSize('Un veredicto que se convierte en una dirección operativa.', 118)
  doc.text(coverLines, margin, 91)
  doc.setFontSize(8); doc.setTextColor(194, 226, 255); doc.text('PREPARADO POR TU JUNTA · 2026', margin, 253)
  footer(); doc.addPage(); y = 22

  title('LA DECISIÓN')
  paragraph(situation, { size: 11, color: INK, gap: 12 })
  title('VEREDICTO DEL CHAIRMAN')
  paragraph(verdict || 'El veredicto no está disponible.', { size: 10.7, gap: 12 })
  title('PLAN DE ACCIÓN')
  splitSections(report?.text || '').forEach(section => {
    const lines = section.trim().split('\n')
    const heading = lines[0]
    if (/^[A-ZÁÉÍÓÚÑ /0-9]{5,}$/.test(heading.trim())) title(heading)
    paragraph(lines.slice(/^[A-ZÁÉÍÓÚÑ /0-9]{5,}$/.test(heading.trim()) ? 1 : 0).join(' '), { size: 10.1, gap: 10 })
  })
  if (report?.quickTakes?.length) {
    title('PERSPECTIVAS ADICIONALES')
    report.quickTakes.forEach(({ director, text }) => paragraph(`${director.name} · ${director.title}: ${text}`, { size: 9.6, color: MUTED, gap: 8 }))
  }
  footer()
  doc.save('junta-directiva-informe-ejecutivo.pdf')
}

export async function downloadChairmanReplyPdf({ situation, reply }) {
  await downloadExecutiveReportPdf({ situation, verdict: 'Propuesta refinada durante la sesión de trabajo con el Chairman.', report: { text: `ACCIONES PRIORITARIAS\n${reply}`, quickTakes: [] } })
}

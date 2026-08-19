import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function textoDePdf(archivo: File): Promise<string> {
  const doc = await pdfjs.getDocument({ data: await archivo.arrayBuffer() }).promise
  const paginas: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const contenido = await (await doc.getPage(n)).getTextContent()
    // pdf.js entrega fragmentos sueltos; hasEOL marca el salto de línea real.
    let linea = ''
    const lineas: string[] = []
    for (const item of contenido.items) {
      if (!('str' in item)) continue
      linea += item.str
      if (item.hasEOL) {
        lineas.push(linea)
        linea = ''
      }
    }
    if (linea) lineas.push(linea)
    paginas.push(lineas.join('\n'))
  }
  return paginas.join('\n\n')
}

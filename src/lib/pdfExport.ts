import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from 'pdf-lib';
import type { PageViewport } from 'pdfjs-dist';
import type { AnnotationItem, PdfDocumentState, TextAnnotation } from '../types';
import { dataUrlToBytes, hexToRgb } from './utils';

const STANDARD_FONTS = {
  Helvetica: StandardFonts.Helvetica,
  TimesRoman: StandardFonts.TimesRoman,
  Courier: StandardFonts.Courier,
} as const;

function safeText(text: string): string {
  return text.replace(/[^\u0000-\u00ff]/g, '?');
}

export async function exportSignedPdf(
  document: PdfDocumentState,
  items: AnnotationItem[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(document.bytes.slice());
  pdf.setProducer('Signfold');
  pdf.setCreator('Signfold — client-side PDF signing');
  const fontCache = new Map<TextAnnotation['fontFamily'], PDFFont>();
  const imageCache = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();

  const getFont = async (family: TextAnnotation['fontFamily']): Promise<PDFFont> => {
    const cached = fontCache.get(family);
    if (cached) return cached;
    const font = await pdf.embedFont(STANDARD_FONTS[family]);
    fontCache.set(family, font);
    return font;
  };

  const pages = pdf.getPages();
  const viewportCache = new Map<number, PageViewport>();

  const getViewport = async (pageNumber: number) => {
    const cached = viewportCache.get(pageNumber);
    if (cached) return cached;
    const page = await document.pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    viewportCache.set(pageNumber, viewport);
    return viewport;
  };

  for (const item of items) {
    const page = pages[item.page - 1];
    if (!page) continue;
    const viewport = await getViewport(item.page);
    if (!viewport) continue;

    if (item.kind === 'text') {
      const font = await getFont(item.fontFamily);
      const color = hexToRgb(item.color);
      const lineHeight = item.fontSize * 1.25;
      const baselineOffset = item.fontSize * 0.9;
      const origin = viewport.convertToPdfPoint(item.x, item.y);
      const oneUnitRight = viewport.convertToPdfPoint(item.x + 1, item.y);
      const angle =
        (Math.atan2(oneUnitRight[1] - origin[1], oneUnitRight[0] - origin[0]) * 180) / Math.PI;
      const lines = item.text.split('\n');

      lines.forEach((line, index) => {
        if (!line) return;
        const baselineDisplayY = item.y + baselineOffset + index * lineHeight;
        const [pdfX, pdfY] = viewport.convertToPdfPoint(item.x, baselineDisplayY);
        try {
          page.drawText(line, {
            x: pdfX,
            y: pdfY,
            size: item.fontSize,
            font,
            color: rgb(color.r, color.g, color.b),
            rotate: degrees(angle),
          });
        } catch {
          page.drawText(safeText(line), {
            x: pdfX,
            y: pdfY,
            size: item.fontSize,
            font,
            color: rgb(color.r, color.g, color.b),
            rotate: degrees(angle),
          });
        }
      });
      continue;
    }

    let image = imageCache.get(item.dataUrl);
    if (!image) {
      const bytes = dataUrlToBytes(item.dataUrl);
      image = item.dataUrl.startsWith('data:image/jpeg')
        ? await pdf.embedJpg(bytes)
        : await pdf.embedPng(bytes);
      imageCache.set(item.dataUrl, image);
    }

    const topLeft = viewport.convertToPdfPoint(item.x, item.y);
    const topRight = viewport.convertToPdfPoint(item.x + item.width, item.y);
    const bottomLeft = viewport.convertToPdfPoint(item.x, item.y + item.height);
    const angle =
      (Math.atan2(topRight[1] - topLeft[1], topRight[0] - topLeft[0]) * 180) / Math.PI;
    const width = Math.hypot(topRight[0] - topLeft[0], topRight[1] - topLeft[1]);
    const height = Math.hypot(bottomLeft[0] - topLeft[0], bottomLeft[1] - topLeft[1]);

    page.drawImage(image, {
      x: bottomLeft[0],
      y: bottomLeft[1],
      width,
      height,
      rotate: degrees(angle),
    });
  }

  return pdf.save();
}

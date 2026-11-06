import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PageSize, PdfDocumentState } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export { pdfjsLib };

export async function loadPdf(
  name: string,
  bytes: Uint8Array,
  driveFileId?: string,
): Promise<PdfDocumentState> {
  const task = pdfjsLib.getDocument({ data: bytes.slice() });
  const pdf = await task.promise;
  const pageSizes: PageSize[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    pageSizes.push({
      width: viewport.width,
      height: viewport.height,
      rotation: viewport.rotation,
    });
  }

  return { name, bytes, pdf, pageSizes, driveFileId };
}

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { createWorker } from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const compactTracking = (value = '') => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

const extractTrackingFromText = (text = '') => {
  const upper = String(text || '').toUpperCase();
  const compact = compactTracking(upper);

  const upsMatch = compact.match(/1Z[0-9A-Z]{16}/);
  if (upsMatch) {
    return {
      trackingNumber: upsMatch[0],
      carrierCode: 'UPS',
      carrierName: 'UPS'
    };
  }

  const explicitLine = upper.match(/TRACKING\s*#?\s*:?\s*([A-Z0-9 -]{8,40})/);
  if (explicitLine) {
    const candidate = compactTracking(explicitLine[1]);
    if (candidate.length >= 8 && candidate.length <= 30) {
      return {
        trackingNumber: candidate,
        carrierCode: null,
        carrierName: null
      };
    }
  }

  return null;
};

const renderPdfFirstPage = async (file) => {
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.2 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
};

const renderImageFile = async (file) => {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  context.drawImage(bitmap, 0, 0);
  return canvas;
};

const renderFileToCanvas = async (file) => {
  const mime = String(file?.type || '').toLowerCase();
  if (mime.includes('pdf') || file.name?.toLowerCase().endsWith('.pdf')) {
    return renderPdfFirstPage(file);
  }
  return renderImageFile(file);
};

export const extractTrackingFromLabelFile = async (file) => {
  if (!file) return null;
  let worker = null;
  try {
    const canvas = await renderFileToCanvas(file);
    worker = await createWorker('eng', 1, {
      logger: () => {}
    });
    const result = await worker.recognize(canvas);
    return extractTrackingFromText(result?.data?.text || '');
  } catch (error) {
    console.warn('FBM label OCR failed:', error);
    return null;
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (terminateError) {
        console.warn('FBM label OCR worker termination failed:', terminateError);
      }
    }
  }
};

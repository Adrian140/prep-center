import 'core-js/actual/map/get-or-insert-computed';
import 'core-js/actual/weak-map/get-or-insert-computed';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { createWorker } from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const compactTracking = (value = '') => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const COLISSIMO_REGEX = /8J\d{11}/;
const UPS_REGEX = /1Z[0-9A-Z]{16}/;
const CHRONOPOST_REGEX = /[A-Z]{2}\d{9}[A-Z]{2}/;

const carrierExtractors = [
  {
    carrierCode: 'COLISSIMO',
    carrierName: 'Colissimo',
    fromText(upper, compact) {
      const numColisLine = upper.match(/NUM\s*COLIS\s*:?\s*([A-Z0-9 ]{8,30})/);
      if (numColisLine) {
        const candidate = compactTracking(numColisLine[1]).match(COLISSIMO_REGEX)?.[0];
        if (candidate) return candidate;
      }
      return compact.match(COLISSIMO_REGEX)?.[0] || null;
    }
  },
  {
    carrierCode: 'CHRONOPOST',
    carrierName: 'Chronopost',
    fromText(upper, compact) {
      const carrierTrackingLine = upper.match(/CARRIER\s*TRACKING\s*:?\s*([A-Z0-9 ]{8,30})/);
      if (carrierTrackingLine) {
        const candidate = compactTracking(carrierTrackingLine[1]).match(CHRONOPOST_REGEX)?.[0];
        if (candidate) return candidate;
      }
      const chronoLine = upper.match(/CHRONOPOST[\s\S]{0,120}?([A-Z]{2}\s*\d(?:[\d ]{7,12})[A-Z]{2})/);
      if (chronoLine) {
        const candidate = compactTracking(chronoLine[1]).match(CHRONOPOST_REGEX)?.[0];
        if (candidate) return candidate;
      }
      return compact.match(CHRONOPOST_REGEX)?.[0] || null;
    }
  },
  {
    carrierCode: 'UPS',
    carrierName: 'UPS',
    fromText(_upper, compact) {
      return compact.match(UPS_REGEX)?.[0] || null;
    }
  }
];

const detectCarrierTracking = (upper, compact) => {
  for (const extractor of carrierExtractors) {
    const trackingNumber = extractor.fromText(upper, compact);
    if (trackingNumber) {
      return {
        trackingNumber,
        carrierCode: extractor.carrierCode,
        carrierName: extractor.carrierName
      };
    }
  }
  return null;
};

const detectTrackingFromBarcode = async (canvas) => {
  if (typeof window === 'undefined' || typeof window.BarcodeDetector === 'undefined') {
    return null;
  }

  try {
    const detector = new window.BarcodeDetector({
      formats: ['code_128', 'code_39', 'codabar', 'ean_13', 'ean_8', 'pdf417', 'qr_code', 'upc_a', 'upc_e']
    });
    const barcodes = await detector.detect(canvas);
    for (const barcode of barcodes || []) {
      const candidate = compactTracking(barcode?.rawValue || '');
      if (!candidate) continue;
      const extracted = detectCarrierTracking(candidate, candidate);
      if (extracted?.trackingNumber) {
        return {
          ...extracted,
          message: `Tracking extracted from barcode: ${extracted.trackingNumber}`,
          textPreview: candidate
        };
      }
      if (candidate.length >= 8 && candidate.length <= 30) {
        return {
          trackingNumber: candidate,
          carrierCode: null,
          carrierName: null,
          message: `Tracking extracted from barcode: ${candidate}`,
          textPreview: candidate
        };
      }
    }
  } catch (error) {
    console.warn('FBM barcode detection failed:', error);
  }

  return null;
};

const extractTrackingFromText = (text = '') => {
  const upper = String(text || '').toUpperCase();
  const compact = compactTracking(upper);
  const carrierMatch = detectCarrierTracking(upper, compact);
  if (carrierMatch?.trackingNumber) {
    return carrierMatch;
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
  if (!file) {
    return { trackingNumber: null, carrierCode: null, carrierName: null, message: 'No file provided.' };
  }
  let worker = null;
  try {
    const canvas = await renderFileToCanvas(file);
    const barcodeResult = await detectTrackingFromBarcode(canvas);
    if (barcodeResult?.trackingNumber) {
      return barcodeResult;
    }
    worker = await createWorker('eng', 1, {
      logger: () => {}
    });
    const result = await worker.recognize(canvas);
    const text = result?.data?.text || '';
    if (!String(text).trim()) {
      return {
        trackingNumber: null,
        carrierCode: null,
        carrierName: null,
        message: 'OCR completed but returned no readable text.',
        textPreview: ''
      };
    }
    const extracted = extractTrackingFromText(text);
    if (extracted?.trackingNumber) {
      return {
        ...extracted,
        message: `Tracking extracted: ${extracted.trackingNumber}`,
        textPreview: text.slice(0, 240)
      };
    }
    return {
      trackingNumber: null,
      carrierCode: null,
      carrierName: null,
      message: 'OCR extracted text, but no supported tracking pattern was recognized.',
      textPreview: text.slice(0, 240)
    };
  } catch (error) {
    console.warn('FBM label OCR failed:', error);
    return {
      trackingNumber: null,
      carrierCode: null,
      carrierName: null,
      message: error?.message || 'OCR failed during label processing.',
      textPreview: ''
    };
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

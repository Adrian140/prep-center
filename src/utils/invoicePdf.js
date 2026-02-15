const formatMoney = (value) => {
  const number = Number(value || 0);
  return number.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB');
};

const normalizeText = (value) => {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
};

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error('Image loading is only available in browser context.'));
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load image: ${src}`));
    image.src = src;
  });

const createLogoVariant = async (
  src,
  { rotateDeg = 0, opacity = 1, tint = null, tintStrength = 0 } = {}
) => {
  if (!isBrowser()) return null;
  const image = await loadImageElement(src);
  const rad = (rotateDeg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));

  const outW = Math.max(1, Math.round(image.width * cos + image.height * sin));
  const outH = Math.max(1, Math.round(image.width * sin + image.height * cos));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(rad);
  ctx.globalAlpha = opacity;
  ctx.drawImage(image, -image.width / 2, -image.height / 2, image.width, image.height);
  ctx.restore();

  if (Array.isArray(tint) && tint.length === 3 && tintStrength > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, tintStrength));
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgb(${tint[0]}, ${tint[1]}, ${tint[2]})`;
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }

  return canvas.toDataURL('image/png');
};

const textLines = (doc, lines, x, yStart, step = 4.6) => {
  (lines || []).forEach((line, i) => {
    doc.text(normalizeText(line), x, yStart + i * step);
  });
  return (lines || []).length * step;
};

export const buildInvoicePdfBlob = async ({
  invoiceNumber,
  invoiceDate,
  dueDate,
  issuer,
  customer,
  customerEmail,
  customerPhone,
  items = [],
  totals,
  legalNote
}) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  let topLogoData = null;
  let watermarkLogoData = null;
  try {
    topLogoData = await createLogoVariant('/branding/fulfillment-prep-logo.png', {
      opacity: 1
    });
    watermarkLogoData = await createLogoVariant('/branding/fulfillment-prep-logo.png', {
      rotateDeg: 90,
      opacity: 0.12,
      tint: [45, 147, 255],
      tintStrength: 0.45
    });
  } catch {
    topLogoData = null;
    watermarkLogoData = null;
  }

  // soft blue transparent-like base tint to match requested style
  doc.setFillColor(244, 249, 255);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  if (watermarkLogoData) {
    doc.addImage(watermarkLogoData, 'PNG', pageWidth - 86, 22, 72, 230, undefined, 'FAST');
  }

  const left = 12;
  const right = pageWidth - 12;
  const contentWidth = right - left;
  const customerX = left + contentWidth / 2 + 3;
  const issuerX = left + 3;
  let y = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('INVOICE', left, y);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice No: ${normalizeText(invoiceNumber) || '-'}`, right, y - 2, { align: 'right' });
  doc.text(`Issue Date: ${formatDate(invoiceDate)}`, right, y + 3, { align: 'right' });
  if (dueDate) {
    doc.text(`Due Date: ${formatDate(dueDate)}`, right, y + 8, { align: 'right' });
  }

  y += 12;
  doc.setDrawColor(220);
  doc.setFillColor(248, 249, 250);
  doc.rect(left, y, contentWidth, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Issuer Details', issuerX, y + 5.3);
  doc.text('Bill To', customerX, y + 5.3);

  y += 11;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  if (topLogoData) {
    doc.addImage(topLogoData, 'PNG', issuerX, y - 1, 42, 13, undefined, 'FAST');
    y += 14;
  }

  const issuerLines = [
    issuer?.company_name,
    issuer?.address_line1,
    `${issuer?.postal_code || ''} ${issuer?.city || ''}`.trim(),
    issuer?.country,
    issuer?.vat_number ? `VAT: ${issuer.vat_number}` : null,
    issuer?.registration_number ? `Registration: ${issuer.registration_number}` : null,
    issuer?.email ? `Email: ${issuer.email}` : null,
    issuer?.phone ? `Phone: ${issuer.phone}` : null,
    issuer?.website ? `Website: ${issuer.website}` : null,
    issuer?.iban ? `IBAN: ${issuer.iban}` : null,
    issuer?.bic ? `BIC/SWIFT: ${issuer.bic}` : null
  ].filter(Boolean);

  const customerLines = [
    customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(' '),
    customer?.address,
    `${customer?.postal_code || ''} ${customer?.city || ''}`.trim(),
    customer?.country,
    customer?.vat_number ? `VAT: ${customer.vat_number}` : null,
    customerEmail ? `Email: ${customerEmail}` : null,
    customerPhone ? `Phone: ${customerPhone}` : null
  ].filter(Boolean);

  const issuerHeight = textLines(doc, issuerLines, issuerX, y);
  const customerHeight = textLines(doc, customerLines, customerX, y);

  y += Math.max(issuerHeight, customerHeight) + 6;

  const tableHeaderY = y;
  doc.setFillColor(243, 244, 246);
  doc.rect(left, tableHeaderY, contentWidth, 8, 'F');
  doc.setDrawColor(220);
  doc.rect(left, tableHeaderY, contentWidth, 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Description', left + 2, tableHeaderY + 5.2);
  doc.text('Qty', left + 118, tableHeaderY + 5.2, { align: 'right' });
  doc.text('Unit Price', left + 148, tableHeaderY + 5.2, { align: 'right' });
  doc.text('Net Amount', right - 2, tableHeaderY + 5.2, { align: 'right' });

  y = tableHeaderY + 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);

  const drawTableHeader = () => {
    const rowY = y - 8;
    doc.setFillColor(243, 244, 246);
    doc.rect(left, rowY, contentWidth, 8, 'F');
    doc.setDrawColor(220);
    doc.rect(left, rowY, contentWidth, 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Description', left + 2, rowY + 5.2);
    doc.text('Qty', left + 118, rowY + 5.2, { align: 'right' });
    doc.text('Unit Price', left + 148, rowY + 5.2, { align: 'right' });
    doc.text('Net Amount', right - 2, rowY + 5.2, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
  };

  items.forEach((item) => {
    if (y > 270) {
      doc.addPage();
      y = 18;
      drawTableHeader();
      y += 2;
    }

    const description = normalizeText(item.service || '-');
    const qty = Number(item.units || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const lineTotal = Number(item.total || qty * unitPrice || 0);

    const descriptionLines = doc.splitTextToSize(description, 102);
    const rowHeight = Math.max(6, descriptionLines.length * 4.4);

    doc.text(descriptionLines, left + 2, y);
    doc.text(String(Number.isInteger(qty) ? qty : qty.toFixed(2)), left + 118, y, { align: 'right' });
    doc.text(`${formatMoney(unitPrice)} EUR`, left + 148, y, { align: 'right' });
    doc.text(`${formatMoney(lineTotal)} EUR`, right - 2, y, { align: 'right' });

    y += rowHeight;
    doc.setDrawColor(238);
    doc.line(left, y - 2, right, y - 2);
  });

  y += 4;
  const totalsX = left + 112;
  const totalsW = contentWidth - 112;
  doc.setDrawColor(220);
  doc.rect(totalsX, y - 3, totalsW, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Net Total', totalsX + 3, y + 2);
  doc.text(`${formatMoney(totals?.net)} EUR`, right - 3, y + 2, { align: 'right' });
  doc.text(totals?.vatLabel || 'VAT', totalsX + 3, y + 8);
  doc.text(`${formatMoney(totals?.vat)} EUR`, right - 3, y + 8, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.text('Grand Total', totalsX + 3, y + 14);
  doc.text(`${formatMoney(totals?.gross)} EUR`, right - 3, y + 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  if (legalNote) {
    y += 24;
    doc.setFontSize(8.7);
    doc.text('Legal Note:', left, y);
    const noteLines = doc.splitTextToSize(normalizeText(legalNote), contentWidth);
    doc.text(noteLines, left, y + 4);
  }

  return doc.output('blob');
};

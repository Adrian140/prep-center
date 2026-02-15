const formatMoney = (value) => {
  const number = Number(value || 0);
  return number.toLocaleString('fr-FR', {
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

const drawLines = (doc, lines, x, y, step = 4.9) => {
  let cursor = y;
  for (const line of lines) {
    doc.text(normalizeText(line), x, cursor);
    cursor += step;
  }
  return cursor;
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
  legalNote,
  templateImage
}) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let topLogoData = null;
  let watermarkLogoData = null;
  let templateData = normalizeText(templateImage);
  try {
    topLogoData = await createLogoVariant('/branding/fulfillment-prep-logo.png', { opacity: 0.5 });
    watermarkLogoData = await createLogoVariant('/branding/fulfillment-prep-logo.png', {
      rotateDeg: 90,
      opacity: 0.16,
      tint: [45, 147, 255],
      tintStrength: 0.55
    });
    if (!templateData) {
      const issuerCountry = String(issuer?.country || '').toUpperCase();
      if (issuerCountry === 'FR') {
        templateData = '/branding/invoice-template-fr.png';
      }
    }
    if (templateData && templateData.startsWith('/')) {
      const loadedTemplate = await createLogoVariant(templateData, { opacity: 1 });
      if (loadedTemplate) {
        templateData = loadedTemplate;
      }
    }
  } catch {
    topLogoData = null;
    watermarkLogoData = null;
  }

  if (templateData) {
    try {
      const ext = templateData.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(templateData, ext, 0, 0, pageW, pageH, undefined, 'FAST');
      // Keep template as visual background only; clear content canvas to avoid text overlaps.
      doc.setFillColor(243, 248, 255);
      doc.rect(10, 14, pageW - 20, pageH - 24, 'F');
    } catch {
      templateData = '';
    }
  }
  if (!templateData) {
    // blue page tint close to styled reference
    doc.setFillColor(63, 151, 235);
    doc.rect(0, 0, pageW, pageH, 'F');

    if (watermarkLogoData) {
      doc.addImage(watermarkLogoData, 'PNG', pageW / 2 - 30, 74, 56, 148, undefined, 'FAST');
    }
  }

  const margin = 18;
  const left = margin;
  const right = pageW - margin;
  const top = 22;
  const mid = pageW / 2;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(8, 22, 43);
  doc.text('INVOICE', left, top);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`No: ${normalizeText(invoiceNumber) || '-'}`, left, top + 7);
  doc.text(`Date: ${formatDate(invoiceDate)}`, right, top + 1, { align: 'right' });
  doc.text(`Due: ${dueDate ? formatDate(dueDate) : '-'}`, right, top + 7, { align: 'right' });

  doc.setDrawColor(186, 212, 238);
  doc.setLineWidth(0.35);
  doc.line(left, top + 11, right, top + 11);

  // Top tiny logo above issuer block
  const infoStartY = top + 26;
  if (topLogoData) {
    doc.addImage(topLogoData, 'PNG', left + 7, infoStartY - 8, 16, 6, undefined, 'FAST');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.text('Issuer', left, infoStartY + 7);
  doc.text('Bill To', mid + 2, infoStartY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);

  const issuerLines = [
    issuer?.company_name,
    issuer?.address_line1,
    `${issuer?.postal_code || ''} ${issuer?.city || ''}`.trim(),
    issuer?.country,
    issuer?.vat_number ? `VAT: ${issuer.vat_number}` : null,
    issuer?.registration_number ? `Reg: ${issuer.registration_number}` : null,
    issuer?.email,
    issuer?.phone,
    issuer?.website,
    issuer?.iban ? `IBAN: ${issuer.iban}` : null,
    issuer?.bic ? `BIC: ${issuer.bic}` : null
  ].filter(Boolean);

  const billToLines = [
    customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(' '),
    customer?.address,
    `${customer?.postal_code || ''} ${customer?.city || ''}`.trim(),
    customer?.country,
    customer?.vat_number ? `VAT: ${customer.vat_number}` : null,
    customerEmail ? `Email: ${customerEmail}` : null,
    customerPhone ? `Phone: ${customerPhone}` : null
  ].filter(Boolean);

  const issuerBottom = drawLines(doc, issuerLines, left, infoStartY + 13, 4.6);
  const billToBottom = drawLines(doc, billToLines, mid + 2, infoStartY + 13, 4.6);

  let y = Math.max(issuerBottom, billToBottom) + 7;

  // Table header
  const tableX = left;
  const tableW = right - left;
  const colQty = tableX + tableW * 0.63;
  const colUnit = tableX + tableW * 0.72;
  const colNet = tableX + tableW * 0.86;

  doc.setFillColor(221, 229, 238);
  doc.rect(tableX, y, tableW, 8.2, 'F');
  doc.setDrawColor(188, 198, 210);
  doc.rect(tableX, y, tableW, 8.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.text('Service', tableX + 2, y + 5.4);
  doc.text('Qty', colQty + 2, y + 5.4);
  doc.text('Unit', colUnit + 2, y + 5.4);
  doc.text('Net', right - 2, y + 5.4, { align: 'right' });

  y += 8.2;

  // Items
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  items.forEach((item, idx) => {
    const rowFill = idx % 2 === 0 ? [234, 238, 244] : [226, 232, 238];
    const rowH = 8.5;
    doc.setFillColor(rowFill[0], rowFill[1], rowFill[2]);
    doc.rect(tableX, y, tableW, rowH, 'F');
    doc.setDrawColor(188, 198, 210);
    doc.rect(tableX, y, tableW, rowH);

    const service = normalizeText(item.service || '-');
    const qty = Number(item.units || 0);
    const unit = Number(item.unitPrice || 0);
    const net = Number(item.total || qty * unit || 0);

    doc.text(service, tableX + 2, y + 5.5);
    doc.text(String(Number.isInteger(qty) ? qty : qty.toFixed(2)), colQty + 2, y + 5.5);
    doc.text(`${formatMoney(unit)} €`, colUnit + 2, y + 5.5);
    doc.text(`${formatMoney(net)} €`, right - 2, y + 5.5, { align: 'right' });

    y += rowH;
  });

  // Totals (plain, right aligned under table)
  y += 4;
  const totalsLabelX = right - 58;
  const totalsValueX = right - 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.2);
  doc.text('Net total:', totalsLabelX, y);
  doc.text(`${formatMoney(totals?.net)} €`, totalsValueX, y, { align: 'right' });

  y += 6;
  doc.text(totals?.vatLabel || 'VAT:', totalsLabelX, y);
  doc.text(`${formatMoney(totals?.vat)} €`, totalsValueX, y, { align: 'right' });

  y += 6;
  doc.setFontSize(10.2);
  doc.text('Total:', totalsLabelX, y);
  doc.text(`${formatMoney(totals?.gross)} €`, totalsValueX, y, { align: 'right' });

  // Footer legal note
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const footerY = pageH - 12;
  doc.text(`Legal note: ${normalizeText(legalNote || '')}`, left, footerY);

  return doc.output('blob');
};

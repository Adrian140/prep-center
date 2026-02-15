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

  const left = 12;
  const right = doc.internal.pageSize.getWidth() - 12;
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

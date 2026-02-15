const formatMoney = (value) => {
  const number = Number(value || 0);
  return number.toLocaleString('ro-RO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ro-RO');
};

const normalizeText = (value) => {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
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
  const left = 14;
  const right = pageWidth - 14;
  let y = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('INVOICE', left, y);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`No: ${normalizeText(invoiceNumber) || '-'}`, right, y - 2, { align: 'right' });
  doc.text(`Date: ${formatDate(invoiceDate)}`, right, y + 3, { align: 'right' });
  doc.text(`Due: ${formatDate(dueDate)}`, right, y + 8, { align: 'right' });

  y += 18;

  doc.setFont('helvetica', 'bold');
  doc.text('Issuer', left, y);
  doc.text('Bill To', 110, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
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

  const customerLines = [
    customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(' '),
    customer?.address,
    `${customer?.postal_code || ''} ${customer?.city || ''}`.trim(),
    customer?.country,
    customer?.vat_number ? `VAT: ${customer.vat_number}` : null,
    customerEmail ? `Email: ${customerEmail}` : null,
    customerPhone ? `Phone: ${customerPhone}` : null
  ].filter(Boolean);

  issuerLines.forEach((line, index) => doc.text(normalizeText(line), left, y + index * 4.8));
  customerLines.forEach((line, index) => doc.text(normalizeText(line), 110, y + index * 4.8));

  y += Math.max(issuerLines.length, customerLines.length) * 4.8 + 6;

  doc.setDrawColor(220);
  doc.setFillColor(248, 249, 250);
  doc.rect(left, y, right - left, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Service', left + 2, y + 5.2);
  doc.text('Qty', 120, y + 5.2, { align: 'right' });
  doc.text('Unit', 150, y + 5.2, { align: 'right' });
  doc.text('Net', right - 2, y + 5.2, { align: 'right' });

  y += 10;
  doc.setFont('helvetica', 'normal');

  items.forEach((item) => {
    if (y > 255) {
      doc.addPage();
      y = 20;
    }

    const service = normalizeText(item.service || '-');
    const qty = Number(item.units || 0);
    const unit = Number(item.unitPrice || 0);
    const lineTotal = Number(item.total || qty * unit || 0);

    doc.text(service, left + 2, y);
    doc.text(String(Number.isInteger(qty) ? qty : qty.toFixed(2)), 120, y, { align: 'right' });
    doc.text(`${formatMoney(unit)} €`, 150, y, { align: 'right' });
    doc.text(`${formatMoney(lineTotal)} €`, right - 2, y, { align: 'right' });

    y += 6;
  });

  y += 3;
  doc.setDrawColor(230);
  doc.line(120, y, right, y);
  y += 6;

  doc.text(`Net total: ${formatMoney(totals.net)} €`, right, y, { align: 'right' });
  y += 5;
  doc.text(`${totals.vatLabel}: ${formatMoney(totals.vat)} €`, right, y, { align: 'right' });
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Total: ${formatMoney(totals.gross)} €`, right, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  if (legalNote) {
    y += 10;
    const noteLines = doc.splitTextToSize(`Legal note: ${legalNote}`, right - left);
    doc.setFontSize(8.5);
    doc.text(noteLines, left, y);
  }

  const blob = doc.output('blob');
  return blob;
};

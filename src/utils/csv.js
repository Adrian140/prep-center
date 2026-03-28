import { saveAs } from 'file-saver';

const escapeCsvCell = (value) => {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

export const rowsToCsv = (rows = []) =>
  rows
    .map((row) => (Array.isArray(row) ? row : [row]).map(escapeCsvCell).join(','))
    .join('\r\n');

export const downloadCsv = (rows, filename = 'export.csv') => {
  const blob = new Blob([`\uFEFF${rowsToCsv(rows)}`], {
    type: 'text/csv;charset=utf-8'
  });
  saveAs(blob, filename);
};

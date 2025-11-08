import React, { useState, useEffect, useRef } from 'react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { supabaseHelpers } from '../../../config/supabase';
import * as XLSX from 'xlsx';
import { supabase } from "../../../config/supabase";
import { Languages, FileDown } from "lucide-react";
import { Upload, Download, Plus, Edit, Trash2, Send, Save, X, FileSpreadsheet, Truck, Package } 
from 'lucide-react';
import Papa from 'papaparse';
import { useDashboardTranslation } from '@/translations';
import { useLanguage } from '@/contexts/LanguageContext';

const TEMPLATE_HEADERS = ['EAN/ASIN', 'Product Name', 'Quantity Received', 'SKU', 'Purchase Price'];

// ——— Helpers ———
const toNull = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

function ClientReceiving() {
  // --- i18n (ClientReceiving) ---
  const { t: baseT, tp } = useDashboardTranslation();
  const { currentLanguage } = useLanguage();
  const t = (key, params) => {
    if (params) return tp(`ClientReceiving.${key}`, params);
    return baseT(`ClientReceiving.${key}`);
  };
  const { profile } = useSupabaseAuth();
  const [shipments, setShipments] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(null); // poate fi: success, error, info
  const [showLangMenu, setShowLangMenu] = useState(false);
  const GUIDE_SECTION = "receiving";
  const GUIDE_LANGS = ["fr","en","de","it","es","ro"]; // adaptează dacă vrei și altele
  const [history, setHistory] = useState([]);
const [historyPage, setHistoryPage] = useState(1);
const HISTORY_PER_PAGE = 5;

const openReqEditor = (id) => console.log("Open request", id);

    const downloadImportGuide = async (lg) => {
    try {
      const path = `${GUIDE_SECTION}/${lg}.pdf`;
      const { data, error } = await supabase
        .storage
        .from("user_guides")
        .createSignedUrl(path, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      setShowLangMenu(false);
    } catch (e) {
      setMessage(`${t('guide_download_error_prefix')} (${lg.toUpperCase()}): ${e.message}`);
      setMessageType('error');
    }
  };
// — Buton Ajutor (PDF) cu meniu de limbi —
function HelpMenuButton({ buttonClassName = "" }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary hover:text-white transition-colors ${buttonClassName}`}
      >
        <FileDown className="w-4 h-4 mr-2" />
        {t('import_instructions_pdf')}
        <Languages className="w-4 h-4 ml-2 opacity-80" />
      </button>

      {open && (
        <div className="absolute z-10 right-0 mt-2 w-44 bg-white border rounded-lg shadow-lg">
          {GUIDE_LANGS.map((lg) => (
            <button
              key={lg}
              onClick={async () => { await downloadImportGuide(lg); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
            >
              {lg.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const [formData, setFormData] = useState({
  carrier: '',
  carrier_other: '',
  tracking_ids: [''],
  fba_shipment_ids: [''],
  notes: ''
});


  const [items, setItems] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const dropInputRef = useRef(null);
  // === editare în pagina de detalii ===
const [editMode, setEditMode] = useState(false);
const [editHeader, setEditHeader] = useState(null);  
const [editItems, setEditItems] = useState([]);  
const [savingEdits, setSavingEdits] = useState(false);
  useEffect(() => {
    loadData();
  }, [profile?.company_id]);
  const loadHistory = async () => {
  if (!profile?.company_id) return;

  try {
    const { data, error } = await supabase
      .from('prep_requests')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    setHistory(data || []);
  } catch (err) {
    console.error('Error loading history:', err.message);
  }
};


  const loadData = async () => {
  if (!profile?.company_id) return;

  setLoading(true);
  try {
    const [shipmentsRes, carriersRes] = await Promise.all([
      supabaseHelpers.getClientReceivingShipments(profile.company_id),
      supabaseHelpers.getCarriers()
    ]);

    if (shipmentsRes.error) throw shipmentsRes.error;
    if (carriersRes.error) throw carriersRes.error;

    setShipments(shipmentsRes.data || []);
    setCarriers(carriersRes.data || []);
  } catch (error) {
    setMessage(`${t('load_error_prefix')}: ${error.message}`);
    setMessageType('error');
  } finally {
    setLoading(false);
  }
};

const DATE_LOCALE_MAP = {
  fr: 'fr-FR',
  en: 'en-US',
  de: 'de-DE',
  it: 'it-IT',
  es: 'es-ES',
  ro: 'ro-RO',
  pl: 'pl-PL'
};
const DATE_LOCALE = DATE_LOCALE_MAP[currentLanguage] || 'en-US';

// 1) Păstrează constantele tale:
const TEMPLATE_BUCKET = "user_guides";
const TEMPLATE_KEY = "templates/receiving_template.xlsx";

// 2) Helper: generează local un XLSX dacă obiectul din Storage nu există
function generateAndDownloadTemplate() {
  try {
    const displayHeaders = TEMPLATE_HEADERS.map((h, i) => (i < 3 ? `${h} *` : h));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([displayHeaders]);

    // (opțional) un rând gol de exemplu
    XLSX.utils.sheet_add_aoa(ws, [["", "", "", "", ""]], { origin: -1 });

    // Lățimi de coloană (în caractere) – ajustează după preferință
    ws["!cols"] = [
      { wch: 20 }, // EAN/ASIN *
      { wch: 40 }, // Product Name *
      { wch: 18 }, // Quantity Received *
      { wch: 22 }, // SKU
      { wch: 18 }, // Purchase Price
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Receiving");

    // Descarcă fișierul
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "receiving_template.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    setMessage(`Nu am putut genera template-ul local: ${err.message}`);
    setMessageType("error");
  }
}

// 3) Înlocuiește funcția ta cu aceasta: încearcă Storage -> dacă lipsește, folosește fallback-ul local
const downloadTemplate = async () => {
  try {
    const { data, error } = await supabase
      .storage
      .from(TEMPLATE_BUCKET)
      .createSignedUrl(TEMPLATE_KEY, 60);

    if (error) throw error; // dacă obiectul nu există: { message: 'Object not found' }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  } catch (e) {
    // Fallback instant
    setMessage(`Nu pot descărca template-ul din Storage (${e.message}). Generez local acum…`);
    setMessageType("info");
    generateAndDownloadTemplate();
  }
};

  const validateEAN = (ean) => {
    return supabaseHelpers.validateEAN(ean);
  };

  const REQUIRED_HEADERS = ['EAN/ASIN', 'Product Name', 'Quantity Received'];

  function normalizeHeader(h) {
    return String(h || '')
      .replace(/[^\p{L}\p{N}\/ ]+/gu, '')
      .trim()
      .toLowerCase();
  }
const parseFile = async (file) => {

  // === XLSX ===
  if (file.name.toLowerCase().endsWith('.xlsx')) {
const ab = await file.arrayBuffer();
const mod = await import('xlsx');
const XLSX = mod.default || mod;
const wb = XLSX.read(ab, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

    if (!rows || rows.length < 2) {
      throw new Error(t('must_have_header_and_row'));
    }

    const headers = rows[0].map(h => String(h ?? '').trim());
    const norm = headers.map(normalizeHeader);

   const idx = {
  ean:   norm.findIndex(h => h.startsWith('ean') || h.includes('asin')),
  name:  norm.findIndex(h => h.includes('product') && h.includes('name')),
  qty:   norm.findIndex(h => h.includes('quantity')),
  sku:   norm.findIndex(h => h.startsWith('sku')),              // <— schimbat (era h === 'sku')
  price: norm.findIndex(h => h.includes('purchase') || h.includes('price')),
};

    if (idx.ean < 0 || idx.name < 0 || idx.qty < 0) {
      throw new Error(t('model_must_contain_cols', { cols: REQUIRED_HEADERS.join(', ') }));
    }

    const parsedItems = [];
    const errors = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const firstCellA = String(r[0] ?? '').trim();                      // col A brut
      const isRowBlank = r.every(c => String(c ?? '').trim() === '');
      if (isRowBlank || firstCellA.startsWith('#')) continue;
      const eanAsin = String(r[idx.ean] ?? '').trim();
      const productName = String(r[idx.name] ?? '').trim();
      const quantity = Number(r[idx.qty] ?? 0);
      const sku = idx.sku >= 0 ? String(r[idx.sku] ?? '').trim() : '';
      const purchasePrice = (idx.price >= 0 && r[idx.price] !== undefined && r[idx.price] !== '')
        ? Number(r[idx.price]) : null;

      const lineNo = i + 1;
      if (!eanAsin) { errors.push(t('line_missing_ean', { line: lineNo })); continue; }
      if (!productName) { errors.push(t('line_missing_name', { line: lineNo })); continue; }
      if (!Number.isFinite(quantity) || quantity < 1) { errors.push(t('line_invalid_qty', { line: lineNo })); continue; }

      const eanValidation = validateEAN(eanAsin);
      if (!eanValidation.valid) { errors.push(t('line_invalid_ean', { line: lineNo })); }

      parsedItems.push({
        send_to_fba: false,
        fba_qty: null,
        ean_asin: eanValidation.formatted,
        product_name: productName,
        quantity_received: quantity,
        sku: sku || null,
        purchase_price: purchasePrice,
        line_number: i,
        validation: eanValidation,
      });
    }

    if (errors.length) throw new Error(t('detected_errors', { errors: errors.join('\n') }));
    return parsedItems;
  }

// === CSV ===
  const text = await file.text();
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    comments: '#', 
    transformHeader: (h) => normalizeHeader(h),
  });

  if (parsed.errors && parsed.errors.length > 0) {
    throw new Error(t('csv_read_error', { msg: parsed.errors[0]?.message || 'format invalid' }));
  }

  const rows = parsed.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(t('must_have_header_and_row'));
  }

  const keys = Object.keys(rows[0] || {});
  const h = {
  ean:   keys.find(k => k.startsWith('ean') || k.includes('asin')),
  name:  keys.find(k => k.includes('product') && k.includes('name')),
  qty:   keys.find(k => k.includes('quantity')),
  sku:   keys.find(k => k.startsWith('sku')),                    // <— schimbat (era k === 'sku')
  price: keys.find(k => k.includes('purchase') || k.includes('price')),
};
  if (!h.ean || !h.name || !h.qty) {
    throw new Error(t('model_must_contain_cols', { cols: REQUIRED_HEADERS.join(', ') }));
  }

  const parsedItems = [];
  const errors = [];

  rows.forEach((r, i) => {
    const rawFirst = String(r[h.ean] ?? '').trim();
if (rawFirst.startsWith('#')) return; // ignoră rândurile de note copiate în CSV

    const lineNumber = i + 2; // 1 = header
    const eanAsin = String(r[h.ean] ?? '').trim();
    const productName = String(r[h.name] ?? '').trim();
    const quantity = Number(String(r[h.qty] ?? '0').replace(',', '.'));
    const sku = h.sku ? String(r[h.sku] ?? '').trim() : '';
    const purchasePrice = (h.price && r[h.price] !== undefined && r[h.price] !== '')
      ? Number(String(r[h.price]).replace(',', '.'))
      : null;

    if (!eanAsin) { errors.push(t('line_missing_ean', { line: lineNumber })); return; }
    if (!productName) { errors.push(t('line_missing_name', { line: lineNumber })); return; }
    if (!Number.isFinite(quantity) || quantity < 1) { errors.push(t('line_invalid_qty', { line: lineNumber })); return; }

    const eanValidation = validateEAN(eanAsin);
    if (!eanValidation.valid) { errors.push(t('line_invalid_ean', { line: lineNumber })); }

    parsedItems.push({
      send_to_fba: false,
      fba_qty: null,
      ean_asin: eanValidation.formatted,
      product_name: productName,
      quantity_received: quantity,
      sku: sku || null,
      purchase_price: purchasePrice,
      line_number: lineNumber - 1,
      validation: eanValidation,
    });
  });

  if (errors.length) throw new Error(t('detected_errors', { errors: errors.join('\n') }));
  return parsedItems;
};

const handleFileUpload = async (file) => {
  if (!file) return;

  try {
    setMessage(t('processing_file'));
    setMessageType('info');
    const parsedItems = await parseFile(file);
    setItems(parsedItems);
    setMessage(t('imported_lines_ok', { count: parsedItems.length }));
    setMessageType('success');
  } catch (error) {
    setMessage(error.message);
    setMessageType('error');
    setItems([]);
  }
};

 const handleDrop = (e) => {
  e.preventDefault();
  setDragOver(false);
  const file = e.dataTransfer.files[0];
  if (file && (file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.xlsx'))) {
    handleFileUpload(file);
  } else {
    setMessage(t('upload_csv_xlsx_only'));
    setMessageType('error');
  }
};

  const addManualItem = () => {
    const newItem = {
      ean_asin: '',
      product_name: '',
      quantity_received: 1,
      sku: '',
      purchase_price: null,
      line_number: items.length + 1,
      validation: { valid: false },
      send_to_fba: false,
      fba_qty: null,
    };
    setItems([...items, newItem]);
  };

  const updateItem = (index, field, value) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };

    // re-validate EAN
    if (field === 'ean_asin') {
      updatedItems[index].validation = validateEAN(value);
    }

    // --- logică FBA ---
    if (field === 'send_to_fba') {
      if (value && (updatedItems[index].fba_qty == null || updatedItems[index].fba_qty < 1)) {
        updatedItems[index].fba_qty = Math.max(1, Number(updatedItems[index].quantity_received) || 1);
      }
      if (!value) {
        updatedItems[index].fba_qty = null;
      }
    }

    if (field === 'quantity_received') {
      const q = Math.max(1, Number(value) || 1);
      if (updatedItems[index].send_to_fba && updatedItems[index].fba_qty != null) {
        updatedItems[index].fba_qty = Math.min(q, Math.max(1, Number(updatedItems[index].fba_qty) || 1));
      }
    }

    if (field === 'fba_qty') {
      if (updatedItems[index].send_to_fba) {
        const q = Math.max(1, Number(updatedItems[index].quantity_received) || 1);
        const v = Number(value);
        updatedItems[index].fba_qty = Number.isFinite(v) ? Math.min(q, Math.max(1, v)) : null;
      } else {
        updatedItems[index].fba_qty = null;
      }
    }
    // --- end logică FBA ---

    setItems(updatedItems);
  };

  const deleteItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

const validateForm = () => {
  if (items.length === 0) return t('at_least_one_line');

  const invalidItems = items.filter(item =>
    !item.ean_asin || !item.product_name || item.quantity_received < 1 || !item.validation.valid
  );

  if (invalidItems.length > 0) {
    return t('invalid_lines_detected', { count: invalidItems.length });
  }
  return null;
};

const saveDraft = async () => {
  const validationError = validateForm();
  if (validationError) {
    setMessage(validationError);
    setMessageType('error');
    return;
  }
  try {
      const shipmentData = {
        company_id: profile.company_id,
        user_id: profile.id,
        carrier: toNull(formData.carrier),
        carrier_other: formData.carrier === 'OTHER' ? toNull(formData.carrier_other) : null,
        tracking_ids: formData.tracking_ids?.filter(v => v && v.trim() !== '') || [],
        fba_shipment_ids: formData.fba_shipment_ids?.filter(v => v && v.trim() !== '') || [],
        notes: toNull(formData.notes),
        status: 'draft',
        created_by: profile.id
      };

    const { data: shipment, error: shipmentError } = await supabaseHelpers.createReceivingShipment(shipmentData);
    if (shipmentError) throw shipmentError;

    const itemsData = items.map(item => ({
      shipment_id: shipment.id,
      ean_asin: item.ean_asin,
      product_name: item.product_name,
      quantity_received: item.quantity_received,
      sku: item.sku,
      purchase_price: item.purchase_price,
      line_number: item.line_number,
      send_to_fba: !!item.send_to_fba,
      fba_qty: item.send_to_fba ? (item.fba_qty ?? null) : null
    }));

    const { error: itemsError } = await supabaseHelpers.createReceivingItems(itemsData);
    if (itemsError) throw itemsError;

    setMessage(t('draft_saved'));
    setMessageType('success');
    resetForm();
    loadData();
  } catch (error) {
    setMessage(`${t('generic_error_prefix')}: ${error.message}`);
    setMessageType('error');
  }
};

const sendShipment = async () => {
  const validationError = validateForm();
  if (validationError) {
    setMessage(validationError);
    setMessageType('error');
    return;
  }

  if (!confirm(t('confirm_send'))) return;

  try {
    const shipmentData = {
  company_id: profile.company_id,
  user_id: profile.id,
  carrier: toNull(formData.carrier),
  carrier_other: formData.carrier === 'OTHER' ? toNull(formData.carrier_other) : null,
  tracking_ids: formData.tracking_ids?.filter(v => v && v.trim() !== '') || [],
  fba_shipment_ids: formData.fba_shipment_ids?.filter(v => v && v.trim() !== '') || [],
  notes: toNull(formData.notes),
  status: 'submitted',
  submitted_at: new Date().toISOString(),
  created_by: profile.id
};


    const { data: shipment, error: shipmentError } = await supabaseHelpers.createReceivingShipment(shipmentData);
    if (shipmentError) throw shipmentError;

    const itemsData = items.map(item => ({
      shipment_id: shipment.id,
      ean_asin: item.ean_asin,
      product_name: item.product_name,
      quantity_received: item.quantity_received,
      sku: item.sku,
      purchase_price: item.purchase_price,
      line_number: item.line_number,
      send_to_fba: !!item.send_to_fba,
      fba_qty: item.send_to_fba ? (item.fba_qty ?? null) : null
    }));

    const { error: itemsError } = await supabaseHelpers.createReceivingItems(itemsData);
    if (itemsError) throw itemsError;

    setMessage(t('reception_sent'));
    setMessageType('success');
    resetForm();
    loadData();
  } catch (error) {
    setMessage(`${t('generic_error_prefix')}: ${error.message}`);
    setMessageType('error');
  }
};

  const resetForm = () => {
    setFormData({ carrier: '', carrier_other: '', tracking_id: '', notes: '' });
    setItems([]);
    setShowForm(false);
    setSelectedShipment(null);
  };

  const getStatusBadge = (status) => {
   const statusMap = {
        draft:     { color: 'bg-gray-100 text-gray-800', text: t('status_draft') },
        submitted: { color: 'bg-yellow-100 text-yellow-800', text: t('status_submitted') },
        received:  { color: 'bg-blue-100 text-blue-800', text: t('status_received') },
        processed: { color: 'bg-green-100 text-green-800', text: t('status_processed') },
        cancelled: { color: 'bg-red-100 text-red-800', text: t('status_cancelled') },
      };
          
    const badge = statusMap[status] || statusMap.draft;
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

async function handleSaveEdits(selectedShipmentId) {
  try {
    setSavingEdits(true);

const payloadHeader = {
  carrier: toNull(editHeader?.carrier),
  carrier_other: editHeader?.carrier === 'OTHER' ? toNull(editHeader?.carrier_other) : null,
  tracking_ids: editHeader?.tracking_ids || [],
  fba_shipment_ids: editHeader?.fba_shipment_ids || [],
  notes: toNull(editHeader?.notes),
  status: editHeader?.status || 'draft',
};

    const { error: upErr } =
     await supabaseHelpers.updateReceivingShipment(selectedShipmentId, payloadHeader);
setEditHeader({ ...editHeader, status: 'draft' });
    if (upErr) throw upErr;

    if (typeof supabaseHelpers.deleteReceivingItemsByShipment === 'function') {
      const { error: delErr } = await supabaseHelpers.deleteReceivingItemsByShipment(selectedShipmentId);
      if (delErr) throw delErr;
    }

    const itemsPayload = (editItems || []).map(it => ({
      shipment_id: selectedShipmentId,
      ean_asin: it.ean_asin,
      product_name: it.product_name,
      quantity_received: it.quantity_received,
      sku: it.sku || null,
      purchase_price: it.purchase_price ?? null,
      send_to_fba: !!it.send_to_fba,
      fba_qty: it.send_to_fba ? (it.fba_qty ?? null) : null,
    }));

    const { error: itemsErr } = await supabaseHelpers.createReceivingItems(itemsPayload);
    if (itemsErr) throw itemsErr;

    setMessage(t('changes_saved'));
    setMessageType('success');
    setEditMode(false);
    await loadData();
    setSelectedShipment(null);
  } catch (e) {
    setMessage(`${t('generic_error_prefix')}: ${e.message}`);
    setMessageType('error');
  } finally {
    setSavingEdits(false);
  }
}

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (selectedShipment) {
    const canEdit = ['draft', 'submitted'].includes(selectedShipment.status);
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <HelpMenuButton />
          <button
            onClick={() => setSelectedShipment(null)}
            className="text-primary hover:text-primary-dark"
          >
            {t('back_to_list')}
          </button>
          {canEdit && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="inline-flex items-center px-3 py-2 border rounded-lg text-primary border-primary hover:bg-primary hover:text-white"
            >
              <Edit className="w-4 h-4 mr-2" /> {t('edit')}
            </button>
          )}
          {selectedShipment.status === 'draft' && (
            <button
              onClick={async () => {
                const confirmSend = confirm(t('confirm_send') || 'Are you sure you want to send this shipment?');
                if (!confirmSend) return;
                const { error } = await supabase
                  .from('receiving_shipments')
                  .update({
                    status: 'submitted',
                    submitted_at: new Date().toISOString(),
                  })
                  .eq('id', selectedShipment.id);
                if (error) {
                  console.error(error);
                  alert('Erreur lors de l’envoi.');
                } else {
                  setSelectedShipment({
                    ...selectedShipment,
                    status: 'submitted',
                  });
                  alert('Réception envoyée avec succès.');
                }
              }}
              className="inline-flex items-center px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark ml-2"
            >
              <Send className="w-4 h-4 mr-2" /> {t('send')}
            </button>
          )}
          {canEdit && editMode && (
            <div className="flex items-center gap-2">
              <button
            onClick={() => handleSaveEdits(selectedShipment.id)}
            disabled={savingEdits}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
          >
            {savingEdits ? t('saving') : t('save')}
          </button>
              <button
                onClick={() => {
                  // revenim la valorile serverului
                  setEditMode(false);
                  setEditHeader({
                    carrier: selectedShipment.carrier || '',
                    carrier_other: selectedShipment.carrier_other || '',
                    tracking_id: selectedShipment.tracking_id || '',
                    notes: selectedShipment.notes || '',
                  });
                  setEditItems((selectedShipment.receiving_items || []).map(it => ({ ...it })));
                }}
                className="px-4 py-2 border rounded-lg"
              >
                {t('cancel')}
              </button>
            </div>
          )}

          <div className="flex items-center space-x-4">
            {getStatusBadge(selectedShipment.status)}
            <span className="text-text-secondary">
              {new Date(selectedShipment.created_at).toLocaleDateString(DATE_LOCALE)}
            </span>
          </div>
        </div>
       {message && (
          <div
            className={`px-4 py-3 rounded-lg ${
              messageType === 'success'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : messageType === 'info'
                ? 'bg-blue-50 border border-blue-200 text-blue-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {message}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">{t('shipment_details')}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-text-secondary">{t('carrier')}</label>
              {editMode ? (
                <div className="flex gap-2">
                  <select
                    value={editHeader?.carrier || ''}
                    onChange={e => setEditHeader(h => ({ ...h, carrier: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">{t('select_carrier')}</option>
                    {carriers.map(c => <option key={c.id} value={c.code}>{c.name}</option>)}
                    <option value="OTHER">{t('other')}</option>
                  </select>
                  {editHeader?.carrier === 'OTHER' && (
                    <input
                      value={editHeader?.carrier_other || ''}
                      onChange={e => setEditHeader(h => ({ ...h, carrier_other: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder={t('other_carrier_ph')}
                    />
                  )}
                </div>
              ) : (
                <p className="text-text-primary">
                  {selectedShipment.carrier}
                  {selectedShipment.carrier_other && ` (${selectedShipment.carrier_other})`}
                </p>
              )}
            </div>
            <div>
          <label className="block text-sm font-medium text-text-secondary">{t('tracking_id')}</label>
          {editMode ? (
          <>
            {(editHeader?.tracking_ids || ['']).map((num, index) => (
              
              <div key={index} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={num}
                  onChange={(e) => {
                    const updated = [...(editHeader?.tracking_ids || [])];
                    updated[index] = e.target.value;
                    setEditHeader({ ...editHeader, tracking_ids: updated });
                  }}
                  className="flex-1 px-3 py-2 border rounded-lg font-mono"
                  placeholder="Ex: 1Z999AA1234567890"
                />
                {(editHeader?.tracking_ids?.length ?? 0) > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const updated = editHeader.tracking_ids.filter((_, i) => i !== index);
                      setEditHeader({ ...editHeader, tracking_ids: updated });
                    }}
                    className="text-red-500 font-bold text-lg"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setEditHeader({
                  ...editHeader,
                  tracking_ids: [...(editHeader.tracking_ids || []), ''],
                })
              }
              className="text-primary hover:underline text-sm"
            >
              {t('add_tracking_number') || 'Add tracking number'}
            </button>
          </>
        ) : (
          <>
            {(selectedShipment.tracking_ids || [selectedShipment.tracking_id])
              .filter(Boolean)
              .map((num, idx) => (
                <p key={idx} className="text-text-primary font-mono">{num}</p>
              ))}
          </>
        )}
        </div>
        {/* === Bloc nou: FBA Shipment IDs === */}
        <div>
          <label className="block text-sm font-medium text-text-secondary">FBA Shipment ID(s)</label>
          {editMode ? (
            <>
              {(editHeader?.fba_shipment_ids || ['']).map((id, index) => (
                <div key={index} className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={id}
                    onChange={(e) => {
                      const updated = [...(editHeader?.fba_shipment_ids || [])];
                      updated[index] = e.target.value;
                      setEditHeader({ ...editHeader, fba_shipment_ids: updated });
                    }}
                    className="flex-1 px-3 py-2 border rounded-lg font-mono"
                    placeholder="Ex: FBA15L104JZW"
                  />
                  {(editHeader?.fba_shipment_ids?.length ?? 0) > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const updated = editHeader.fba_shipment_ids.filter((_, i) => i !== index);
                        setEditHeader({ ...editHeader, fba_shipment_ids: updated });
                      }}
                      className="text-red-500 font-bold text-lg"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setEditHeader({
                    ...editHeader,
                    fba_shipment_ids: [...(editHeader.fba_shipment_ids || []), ''],
                  })
                }
                className="text-primary hover:underline text-sm"
              >
                {t('add_fba_id') || 'Add FBA Shipment ID'}
              </button>
            </>
          ) : (
            <>
              {(selectedShipment.fba_shipment_ids || [])
                .filter(Boolean)
                .map((id, idx) => (
                  <p key={idx} className="text-blue-600 font-mono">{id}</p>
                ))}
            </>
          )}
        </div>

    </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">{t('th_ean_asin')}</th>
                  <th className="px-4 py-3 text-left">{t('th_name')}</th>
                  <th className="px-4 py-3 text-right">{t('th_qty')}</th>
                  <th className="px-4 py-3 text-left">{t('th_sku')}</th>
                  <th className="px-4 py-3 text-right">{t('th_price')}</th>
                  <th className="px-4 py-3 text-center">
                    <span className="inline-block px-2 py-1 rounded bg-yellow-100 text-yellow-800 font-medium">
                      <span className="...">{t('th_send_to_fba')}</span>
                    </span>
                  </th>
                  <th className="px-4 py-3 text-center">{t('th_validation')}</th>
                   {editMode && (
                    <th className="px-4 py-3 text-center">{t('actions')}</th>
                  )}
                </tr>
              </thead>   

               <tbody>
                      {(editMode ? editItems : (selectedShipment.receiving_items || [])).map((item, idx) => {
                        return (
                          <tr key={item.id || idx} className="border-t">
                            {/* EAN/ASIN */}
                            <td className="px-4 py-3 font-mono">
                              {editMode ? (
                                <input
                                  value={item.ean_asin || ''}
                                  onChange={e =>
                                    setEditItems(arr => {
                                      const c = [...arr];
                                      c[idx] = { ...c[idx], ean_asin: e.target.value };
                                      return c;
                                    })
                                  }
                                  className="w-full px-2 py-1 border rounded"
                                />
                              ) : (
                                item.ean_asin
                              )}
                            </td>
                          {/* Nom du Produit */}
                          <td className="px-4 py-3">
                            {editMode ? (
                              <input
                                value={item.product_name || ''}
                                onChange={e => setEditItems(arr => {
                                  const c = [...arr]; c[idx] = { ...c[idx], product_name: e.target.value }; return c;
                                })}
                                className="w-full px-2 py-1 border rounded"
                              />
                            ) : item.product_name}
                          </td>
                          {/* Quantité */}
                          <td className="px-4 py-3 text-right">
                            {editMode ? (
                              <input
                                type="number" min="1"
                                value={item.quantity_received || 1}
                                onChange={e => setEditItems(arr => {
                                  const v = Math.max(1, parseInt(e.target.value || '1', 10));
                                  const c = [...arr];
                                  const prev = c[idx];
                                  const newItem = { ...prev, quantity_received: v };
                                if (newItem.send_to_fba && newItem.fba_qty != null) {
                                    newItem.fba_qty = Math.min(v, Math.max(1, Number(newItem.fba_qty) || 1));
                                  }
                                  c[idx] = newItem;
                                  return c;
                                                          })}
                                className="w-24 text-right px-2 py-1 border rounded"
                              />
                            ) : item.quantity_received}
                          </td>
                          {/* SKU */}
                          <td className="px-4 py-3 font-mono">
                            {editMode ? (
                              <input
                                value={item.sku || ''}
                                onChange={e => setEditItems(arr => {
                                  const c = [...arr]; c[idx] = { ...c[idx], sku: e.target.value || null }; return c;
                                })}
                                className="w-full px-2 py-1 border rounded"
                              />
                            ) : (item.sku || '—')}
                          </td>
                          {/* Prix d'Achat */}
                          <td className="px-4 py-3 text-right">
                            {editMode ? (
                              <input
                                type="number" step="0.01"
                                value={item.purchase_price ?? ''}
                                onChange={e => setEditItems(arr => {
                                  const v = e.target.value === '' ? null : parseFloat(e.target.value);
                                  const c = [...arr]; c[idx] = { ...c[idx], purchase_price: v }; return c;
                                })}
                                className="w-24 text-right px-2 py-1 border rounded"
                              />
                           ) : (
                              item.purchase_price != null
                                ? new Intl.NumberFormat(DATE_LOCALE, { style: 'currency', currency: 'EUR' }).format(item.purchase_price)
                                : '—'
                            )}
                          </td>
                          {/* Send to FBA – editabil în editMode, altfel view-only */}
                        <td className="px-4 py-3 text-center">
                          {editMode ? (
                            <div className="inline-flex items-center gap-2 px-2 py-1 rounded border bg-yellow-50 border-yellow-300">
                              <label className="flex items-center gap-2 text-yellow-900">
                                <input
                                  type="checkbox"
                                  checked={!!item.send_to_fba}
                                  onChange={e => setEditItems(arr => {
                                    const c = [...arr];
                                    const v = e.target.checked;
                                    const q = Math.max(1, Number(item.quantity_received) || 1);
                                    c[idx] = {
                                      ...c[idx],
                                      send_to_fba: v,
                                      fba_qty: v ? (c[idx].fba_qty && c[idx].fba_qty >= 1 ? Math.min(q, c[idx].fba_qty) : q) : null
                                    };
                                    return c;
                                  })}
                                  className="rounded border-yellow-400 text-yellow-600 focus:ring-yellow-500"
                                />
                                <span className="text-xs font-medium">{t('fba_direct')}</span>
                              </label>
                              {item.send_to_fba && (
                                <input
                                  type="number"
                                  min="1"
                                  max={item.quantity_received || 1}
                                  value={item.fba_qty ?? ''}
                                  onChange={e => setEditItems(arr => {
                                    const c = [...arr];
                                    const q = Math.max(1, Number(item.quantity_received) || 1);
                                    const val = Number(e.target.value);
                                    c[idx] = {
                                      ...c[idx],
                                      fba_qty: Number.isFinite(val) ? Math.min(q, Math.max(1, val)) : null
                                    };
                                    return c;
                                  })}
                                  className="w-16 text-right px-2 py-0.5 border border-yellow-300 rounded bg-white"
                                  placeholder={t('fba_qty_ph')}
                                   title={t('fba_qty_title')}
                                />
                              )}
                            </div>
                          ) : (
                            (item.send_to_fba || item.fba_qty) ? (
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                                {item.fba_qty
                                  ? t('direct_with_qty', { qty: item.fba_qty })
                                  : t('fba_direct')}
                              </span>
                            ) : '—'
                          )}
                        </td>
                        {/* Validare */}
                      <td className="px-4 py-3 text-center">
                        {validateEAN(item.ean_asin).valid ? <span className="text-green-600">✓</span> : <span className="text-red-600">✗</span>}
                      </td>

                      {/* Actions doar în edit */}
                      {editMode && (
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setEditItems(arr => arr.filter((_, i) => i !== idx))}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
                        </table>
            {editMode && (
              <div className="mt-3">
                <button
                  onClick={() =>
                    setEditItems(arr => [
                      ...arr,
                      { id: undefined, ean_asin: '', product_name: '', quantity_received: 1, sku: null, purchase_price: null }
                    ])
                  }
                  className="flex items-center px-3 py-2 text-primary border border-primary rounded-lg hover:bg-primary hover:text-white"
                >
                  <Plus className="w-4 h-4 mr-1" /> {t('add_row')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
}
  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text-primary">{t('new_receipt')}</h2>
          <button
            onClick={resetForm}
            className="text-text-secondary hover:text-text-primary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

      {message && (
          <div
            className={`px-4 py-3 rounded-lg ${
              messageType === 'success'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : messageType === 'info'
                ? 'bg-blue-50 border border-blue-200 text-blue-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {message}
          </div>
        )}

        {/* Shipment Header Form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
         <h3 className="text-lg font-semibold text-text-primary mb-4">{t('delivery_info')}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Transporteur */}
            <div>
             <label className="block text-sm font-medium text-text-primary mb-2">
                {t('carrier')}
              </label>
              <select
                value={formData.carrier}
                onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">{t('select_carrier')}</option>
                {carriers.map((carrier) => (
                  <option key={carrier.id} value={carrier.code}>
                    {carrier.name}
                  </option>
                ))}
                <option value="OTHER">{t('other')}</option>
              </select>
            </div>

            {/* Autre transporteur (condițional) */}
            {formData.carrier === 'OTHER' && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  {t('other_carrier')}
                </label>
                <input
                  type="text"
                  value={formData.carrier_other}
                  onChange={(e) => setFormData({ ...formData, carrier_other: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder={t('other_carrier_ph')}
                />
              </div>
            )}

            {/* Tracking Numbers (multiple) */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-primary mb-2">
                  {t('tracking_id')}
                </label>

                {(formData.tracking_ids || ['']).map((num, index) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={num}
                      onChange={(e) => {
                        const updated = [...(formData.tracking_ids || [])];
                        updated[index] = e.target.value;
                        setFormData({ ...formData, tracking_ids: updated });
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Ex: 1Z999AA1234567890"
                    />
                    {(formData.tracking_ids?.length ?? 0) > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = formData.tracking_ids.filter((_, i) => i !== index);
                          setFormData({ ...formData, tracking_ids: updated });
                        }}
                        className="text-red-500 font-bold text-lg"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      tracking_ids: [...(formData.tracking_ids || []), ''],
                    })
                  }
                  className="text-primary hover:underline text-sm"
                >
                  {t('add_tracking_number') || 'Add tracking number'}
                </button>
              </div>

              {/* === Bloc nou: FBA Shipment IDs === */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-primary mb-2">
                  FBA Shipment ID(s)
                </label>

                {(formData.fba_shipment_ids || ['']).map((id, index) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={id}
                      onChange={(e) => {
                        const updated = [...(formData.fba_shipment_ids || [])];
                        updated[index] = e.target.value;
                        setFormData({ ...formData, fba_shipment_ids: updated });
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                      placeholder="Ex: FBA15KZV38J"
                    />
                    {(formData.fba_shipment_ids?.length ?? 0) > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = formData.fba_shipment_ids.filter((_, i) => i !== index);
                          setFormData({ ...formData, fba_shipment_ids: updated });
                        }}
                        className="text-red-500 font-bold text-lg"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      fba_shipment_ids: [...(formData.fba_shipment_ids || []), ''],
                    })
                  }
                  className="text-primary hover:underline text-sm"
                >
                  {t('add_fba_id') || 'Add FBA Shipment ID'}
                </button>
              </div>


            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                {t('notes')}
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder={t('notes_ph')}
                rows={2}
              />
            </div>
          </div>
        </div>
        {/* File Upload */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">{t('import_products')}</h3>
          
          <div className="flex items-center space-x-4 mb-4">
           <HelpMenuButton />

            <button
              onClick={downloadTemplate}
              className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              {t('download_template')}
            </button>
            <label className="flex items-center px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <Upload className="w-4 h-4 mr-2" />
              {t('import_file')}
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => handleFileUpload(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-primary bg-blue-50' : 'border-gray-300'
            }`}
            role="button"
            tabIndex={0}
            onClick={() => dropInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                dropInputRef.current?.click();
              }
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
    
            {/* input invizibil pentru click pe dropzone */}
            <input
              ref={dropInputRef}
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              className="hidden"
            />
          </div>
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-text-primary">
              {t('products_count', { count: items.length })}
            </h3>
            <button
              onClick={addManualItem}
              className="flex items-center px-3 py-2 text-primary border border-primary rounded-lg hover:bg-primary hover:text-white transition-colors"
            >
              <Plus className="w-4 h-4 mr-1" /> {t('add_row')}
            </button>
          </div>
    
          {items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">{t('th_ean_asin_req')}</th>
                    <th className="px-3 py-2 text-left">{t('th_name_req')}</th>
                    <th className="px-3 py-2 text-right">{t('th_qty_req')}</th>
                    <th className="px-3 py-2 text-left">{t('th_sku')}</th>
                    <th className="px-3 py-2 text-right">{t('th_price')}</th>
                    <th className="px-3 py-2 text-center">
                      <span>{t('th_send_to_fba')}</span>
                    </th>
                    <th className="px-3 py-2 text-center">{t('th_valid')}</th>
                    <th className="px-3 py-2 text-center">{t('actions')}</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.ean_asin}
                          onChange={(e) => updateItem(index, 'ean_asin', e.target.value)}
                          className={`w-full px-2 py-1 border rounded ${
                            item.validation.valid ? 'border-green-300' : 'border-red-300'
                          }`}
                          placeholder={t('ph_ean')}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.product_name}
                          onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                          placeholder={t('ph_name')}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity_received}
                          onChange={(e) => updateItem(index, 'quantity_received', parseInt(e.target.value) || 1)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.sku}
                          onChange={(e) => updateItem(index, 'sku', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                          placeholder={t('ph_sku')}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={item.purchase_price || ''}
                          onChange={(e) => updateItem(index, 'purchase_price', e.target.value ? parseFloat(e.target.value) : null)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-right"
                          placeholder="0.00"
                        />
                      </td>

                      {/* --- NOUA COLONĂ GALBENĂ: Send to FBA (ÎNAINTE de Valid) --- */}
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center gap-2 px-2 py-1 rounded border bg-yellow-50 border-yellow-300">
                          <label className="flex items-center gap-2 text-yellow-900">
                            <input
                              type="checkbox"
                              checked={!!item.send_to_fba}
                              onChange={(e) => updateItem(index, 'send_to_fba', e.target.checked)}
                              className="rounded border-yellow-400 text-yellow-600 focus:ring-yellow-500"
                            />
                            <span className="text-xs font-medium">{t('fba_direct')}</span>
                          </label>

                          {item.send_to_fba && (
                            <input
                              type="number"
                              min="1"
                              max={item.quantity_received || 1}
                              value={item.fba_qty ?? ''}
                              onChange={(e) => updateItem(index, 'fba_qty', e.target.value)}
                              className="w-16 text-right px-2 py-0.5 border border-yellow-300 rounded bg-white"
                               placeholder={t('fba_qty_ph')}
                               title={t('fba_qty_title')}
                            />
                          )}
                        </div>
                      </td>
                      {/* --- /NOUA COLONĂ GALBENĂ --- */}

                      <td className="px-3 py-2 text-center">
                        {item.validation.valid ? (
                          <span className="text-green-600 font-medium" title={item.validation.type}>✓</span>
                        ) : (
                          <span className="text-red-600 font-medium">✗</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => deleteItem(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-text-secondary">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('empty_products_title')}</p>
              <p className="text-sm">{t('empty_products_desc')}</p>
            </div>
          )}
        </div>
                {/* Actions */}
          <div className="flex justify-end space-x-4">
            <button
              onClick={resetForm}
              className="px-6 py-3 border border-gray-300 text-text-secondary rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={saveDraft}
              disabled={items.length === 0}
              className="flex items-center px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {t('save_draft')}
            </button>
            <button
              onClick={sendShipment}
              disabled={validateForm() !== null}
              className="flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4 mr-2" />
              {t('send')}
            </button>
          </div>
        </div> 
      );
    }

          return (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">{t('page_title')}</h2>
          <p className="text-text-secondary">{t('page_subtitle')}</p>
          </div>

            <div className="flex items-center gap-3">
              <HelpMenuButton />
            <button
                onClick={() => setShowForm(true)}
                className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('new_receipt')}
              </button>
            </div>
          </div>
          {message && (
        <div
          className={`px-4 py-3 rounded-lg ${
            messageType === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : messageType === 'info'
              ? 'bg-blue-50 border border-blue-200 text-blue-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {message}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="min-w-[1000px]">
         <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
              {t('list_carrier')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
              {t('list_tracking')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
              FBA Shipment ID(s)
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
              {t('list_status')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
              {t('list_products')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
              {t('list_date')}
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
              {t('actions')}
            </th>
          </tr>
        </thead>
         <tbody className="bg-white divide-y divide-gray-200">
          {shipments.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center">
                <Truck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-text-secondary mb-2">
                  {t('empty_list_title')}
                </h3>
                <p className="text-text-light mb-6">
                  {t('empty_list_desc')}
                </p>
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                >
                  <h2>{t('new_receipt')}</h2>
                </button>
              </td>
            </tr>
          ) : (
            shipments.map((shipment) => (
              <tr key={shipment.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <Truck className="w-5 h-5 text-text-secondary mr-2" />
                    <span className="text-text-primary">
                      {shipment.carrier}
                      {shipment.carrier_other && ` (${shipment.carrier_other})`}
                    </span>
                  </div>
                </td>
                {/* Tracking Numbers */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(shipment.tracking_ids || [shipment.tracking_id])
                      .filter(Boolean)
                      .map((id, i) => (
                        <p key={i} className="font-mono text-text-primary">{id}</p>
                      ))}
                  </td>

                  {/* FBA Shipment IDs */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(shipment.fba_shipment_ids || [])
                      .filter(Boolean)
                      .map((id, i) => (
                        <p key={`fba-${i}`} className="font-mono text-blue-600">{id}</p>
                      ))}
                  </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(shipment.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-text-primary">
                    {shipment.receiving_items?.length || 0} {t('units_label')}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-text-secondary">
                  {new Date(shipment.created_at).toLocaleDateString(DATE_LOCALE)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <button
                    onClick={() => {
                      setSelectedShipment(shipment);
                      setEditMode(false);
                      setEditHeader({
                        carrier: shipment.carrier || '',
                        carrier_other: shipment.carrier_other || '',
                        tracking_id: shipment.tracking_id || '',
                        notes: shipment.notes || '',
                      });
                      setEditItems((shipment.receiving_items || []).map(it => ({ ...it })));
                    }}
                    className="text-primary hover:text-primary-dark"
                  >
                                       {t('view_details')}
                  </button>
                </td>
              </tr>
            ))
          )}
         </tbody>    
        </table>
      </div>

      {/* ===== Recent Preparation Requests (copied from ClientStock.jsx) ===== */}
      <div className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">Recent preparation requests</h3>
          <div className="flex items-center gap-2 text-sm">
            <button
              className="border rounded px-2 py-1 disabled:opacity-50"
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              disabled={historyPage <= 1}
            >
              Prev
            </button>
            <span>Page {historyPage}</span>
            <button
              className="border rounded px-2 py-1 disabled:opacity-50"
              onClick={() => {
                const total = Math.max(1, Math.ceil(history.length / HISTORY_PER_PAGE));
                setHistoryPage((p) => Math.min(total, p + 1));
              }}
              disabled={history.length <= HISTORY_PER_PAGE * historyPage}
            >
              Next
            </button>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Country</th>
                <th className="px-2 py-2 text-left">FBA Shipment ID</th>
                <th className="px-2 py-2 text-left">Tracking IDs</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-left">Actions</th>
              </tr>
            </thead>

            <tbody>
              {history.length === 0 ? (
                <tr className="border-t">
                  <td className="px-2 py-6 text-center text-gray-400" colSpan={6}>
                    No recent requests.
                  </td>
                </tr>
              ) : (
                history
                  .slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE)
                  .map((h) => (
                    <tr key={h.id} className="border-t">
                      <td className="px-2 py-2">{h.created_at?.slice(0, 10) || '—'}</td>
                      <td className="px-2 py-2">{h.destination_country || '—'}</td>
                      <td className="px-2 py-2">{h.fba_shipment_id || '—'}</td>
                      <td className="px-2 py-2">
                        {(h.prep_request_tracking || []).join(', ') || '—'}
                      </td>
                      <td className="px-2 py-2">{h.status || 'pending'}</td>
                      <td className="px-2 py-2">
                        <button
                          className="text-xs border rounded px-2 py-1"
                          onClick={() => openReqEditor(h.id)}
                        >
                          View / Edit
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ClientReceiving;

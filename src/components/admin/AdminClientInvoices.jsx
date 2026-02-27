// FILE: src/components/admin/AdminClientInvoices.jsx
import React, { useEffect, useState } from 'react';
import { Plus, Download, Eye, Calendar, FileText, Edit, Trash2, Save, X, Mail } from 'lucide-react';
import { supabase, supabaseHelpers } from '../../config/supabase';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';

const stripBillingInvoiceId = (text) => String(text || '')
  .replace(/\s*\|\s*Billing invoice ID:\s*[0-9a-f-]+/ig, '')
  .trim();

export default function AdminClientInvoices({ profile, hideTitles = false }) {
  const userId = profile?.id;
  const companyId = profile?.company_id;
  const { profile: currentProfile } = useSupabaseAuth();
  const isLimitedAdmin = Boolean(currentProfile?.is_limited_admin);

  const [invoices, setInvoices] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  // upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [flash, setFlash] = useState('');
  const [emailingId, setEmailingId] = useState(null);

  const [form, setForm] = useState({
    invoice_number: '',
    amount: '',
    vat_amount: '',
    description: '',
    issue_date: '',
    due_date: '',
    status: 'pending',
  });

  // edit state
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({
    invoice_number: '',
    amount: '',
    vat_amount: '',
    description: '',
    issue_date: '',
    due_date: '',
    status: 'pending',
  });

  // load client invoices (by company!)
  const load = async () => {
    if (!companyId || isLimitedAdmin) { setInvoices([]); setLoadingList(false); return; }
    setLoadingList(true);
    // dacă ai un helper dedicat, folosește-l; altfel, query direct:
    let data, error;
    try {
      const res = await supabase
        .from('invoices')
        .select('*')
        .eq('company_id', companyId)
        .order('issue_date', { ascending: false });
      data = res.data; error = res.error;
    } catch (e) { error = e; }
    if (!error) setInvoices(data || []);
    setLoadingList(false);
  };

  useEffect(() => {
    if (!isLimitedAdmin) {
      load();
    } else {
      setInvoices([]);
      setLoadingList(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isLimitedAdmin]);

  const onUpload = async (e) => {
    e.preventDefault();
    if (!userId || !companyId) return setFlash('Missing user / company id.');
    if (!form.invoice_number || !form.amount || !form.issue_date) {
      return setFlash('Invoice number, amount and issue date are required.');
    }
  const normDate = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    if (s === '') return null;
    // ISO valid (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // European (DD.MM.YYYY)
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
      const [dd, mm, yyyy] = s.split('.');
      return `${yyyy}-${mm}-${dd}`; // to ISO
    }
    // Fallback – parse Date și serializează ISO (fără timp)
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  };

    setUploadLoading(true);
    setFlash('');
 // Normalize: scoate spații/NBSP & transformă virgula în punct (evită NaN)
    const normNum = (v) =>
      Number(String(v).replace(/[\s\u00A0\u200B\u200C\u200D]/g, '').replace(',', '.'));
    const amt = normNum(form.amount);
    const vat = form.vat_amount === '' ? null : normNum(form.vat_amount);
    if (Number.isNaN(amt) || (vat !== null && Number.isNaN(vat))) {
      setUploadLoading(false);
      return setFlash('Amount/VAT invalid (format).');
   }

    try {
          const issue = normDate(form.issue_date);
    const due = normDate(form.due_date);
    if (!issue) {
      setUploadLoading(false);
      return setFlash('Issue date invalid.');
    }
      const payload = {
        ...form,
        amount: amt,
        vat_amount: vat,
        company_id: companyId,
        user_id: userId, 
        issue_date: issue,
        due_date: due, 
        
      };

      // păstrează helper-ul tău, dar asigură-te că îl pasezi cu company_id
      const { error } = await supabaseHelpers.uploadInvoice(uploadFile, userId, payload);
      if (error) throw error;

      setFlash('Invoice uploaded successfully.');
      setShowUpload(false);
      setUploadFile(null);
      setForm({
        invoice_number: '',
        amount: '',
        vat_amount: '',
        description: '',
        issue_date: '',
        due_date: '',
        status: 'pending',
      });
      load();
    } catch (err) {
      setFlash(err.message || 'Upload failed.');
    } finally {
      setUploadLoading(false);
    }
  };

  // download/view
  const downloadInvoice = async (invoice) => {
    const { data, error } = await supabaseHelpers.downloadInvoice(invoice.file_path);
    if (error) { setFlash('Download failed.'); return; }
    const url = window.URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${invoice.invoice_number}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const viewInvoice = async (invoice) => {
    const { data, error } = await supabaseHelpers.getInvoiceSignedUrl(invoice.file_path, 300);
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const sendInvoiceEmail = async (invoice) => {
    if (!invoice?.file_path) {
      setFlash('Email failed: missing PDF file.');
      return;
    }
    const recipientEmail = String(invoice?.document_payload?.customerEmail || profile?.email || '').trim();
    if (!recipientEmail) {
      setFlash('Email failed: client email is missing.');
      return;
    }
    setEmailingId(invoice.id);
    try {
      const { data: pdfBlob, error: downloadError } = await supabaseHelpers.downloadInvoice(invoice.file_path);
      if (downloadError || !pdfBlob) throw downloadError || new Error('Could not load invoice PDF.');

      const payload = invoice?.document_payload || {};
      const billingProfile = payload?.billingProfile || {};
      const net = Number(invoice.amount ?? payload?.totals?.net ?? 0) || 0;
      const vat = Number(invoice.vat_amount ?? payload?.totals?.vat ?? 0) || 0;
      const total = Number(payload?.totals?.gross ?? (net + vat)) || 0;
      const looksProforma = String(invoice?.document_type || '').toLowerCase() === 'proforma'
        || /\bPF\d+\b/.test(String(invoice?.invoice_number || '').toUpperCase());
      const attachmentName = `${String(invoice?.invoice_number || invoice?.id || 'invoice').replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;

      const { error } = await supabaseHelpers.sendInvoiceEmail(
        {
          email: recipientEmail,
          client_name: [billingProfile?.first_name, billingProfile?.last_name].filter(Boolean).join(' ') || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null,
          company_name: billingProfile?.company_name || profile?.company_name || null,
          document_type: looksProforma ? 'proforma' : 'invoice',
          invoice_number: invoice?.invoice_number || invoice?.id,
          issue_date: invoice?.issue_date || null,
          due_date: invoice?.due_date || payload?.dueDate || null,
          net_amount: net,
          vat_amount: vat,
          total_amount: total,
          attachment_filename: attachmentName
        },
        pdfBlob
      );
      if (error) throw error;
      setFlash('Invoice email sent successfully.');
    } catch (err) {
      setFlash(err?.message || 'Email sending failed.');
    } finally {
      setEmailingId(null);
    }
  };

  // edit handlers
  const startEdit = (inv) => {
    setEditId(inv.id);
    setEditForm({
      invoice_number: inv.invoice_number || '',
      amount: inv.amount ?? '',
      vat_amount: inv.vat_amount ?? '',
      description: inv.description || '',
      issue_date: inv.issue_date || '',
      due_date: inv.due_date || '',
      status: inv.status || 'pending',
    });
  };
  const cancelEdit = () => { setEditId(null); };

  const saveEdit = async () => {
    if (!editId) return;
    const payload = {
      ...editForm,
      amount: editForm.amount === '' ? null : Number(String(editForm.amount).replace(',', '.')),
      vat_amount: editForm.vat_amount === '' ? null : Number(String(editForm.vat_amount).replace(',', '.')),
      company_id: companyId, // asigurăm consistența la update
    };

    const { error } = await supabaseHelpers.updateInvoice(editId, payload);
    if (error) { setFlash(error.message || 'Update failed.'); return; }
    setFlash('Invoice updated.');
    setEditId(null);
    load();
  };

  const deleteInvoice = async (inv) => {
    if (!confirm('Delete this invoice? The PDF will also be removed.')) return;
    const { error } = await supabaseHelpers.deleteInvoice(inv);
    if (error) { setFlash(error.message || 'Delete failed.'); return; }
    setFlash('Invoice deleted.');
    load();
  };

  if (isLimitedAdmin) {
    return (
      <div className="text-sm text-text-secondary bg-gray-50 border rounded-xl p-4">
        Access to invoices is disabled for this account.
      </div>
    );
  }

  const pill = (status) => ({
    paid: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    overdue: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
  }[status] || 'bg-gray-100 text-gray-800');

  const formatAmount = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (Number.isNaN(number)) return String(value);
    return `${number.toLocaleString('ro-RO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} €`;
  };

  return (
    <div className="space-y-6">
      {/* header */}
      <div className={`flex items-center ${hideTitles ? 'justify-end' : 'justify-between'}`}>
        {!hideTitles && (
          <h2 className="text-xl font-semibold text-text-primary">
            Invoices (admin upload)
          </h2>
        )}
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center px-4 py-2 bg-primary text-white rounded-lg"
        >
          <Plus className="w-4 h-4 mr-2" />
          Upload invoice (PDF optional)
        </button>
      </div>

      {/* flash */}
      {flash && (
        <div className={`px-4 py-3 rounded-lg ${
          /success|updated|deleted|uploaded|sent/i.test(flash)
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {flash}
        </div>
      )}

      {/* upload form */}
      {showUpload && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-md font-semibold">Upload new invoice</h4>
            <button onClick={() => setShowUpload(false)} className="text-text-secondary hover:text-text-primary">✕</button>
          </div>

          <form onSubmit={onUpload} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Invoice number *</label>
                <input
                  className="w-full px-3 py-2 border rounded-lg"
                  value={form.invoice_number}
                  onChange={(e) => setForm((s) => ({ ...s, invoice_number: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Amount (EUR) *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={form.amount}
                  onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">VAT (EUR)</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={form.vat_amount}
                  onChange={(e) => setForm((s) => ({ ...s, vat_amount: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Status</label>
                <select
                  className="w-full px-3 py-2 border rounded-lg"
                  value={form.status}
                  onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Issue date *</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={form.issue_date}
                  onChange={(e) => setForm((s) => ({ ...s, issue_date: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Due date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={form.due_date}
                  onChange={(e) => setForm((s) => ({ ...s, due_date: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1">Invoice file (PDF) – opțional</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowUpload(false)} className="px-5 py-2 border rounded-lg">
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploadLoading}
                className="px-5 py-2 bg-primary text-white rounded-lg disabled:opacity-60"
              >
                {uploadLoading ? 'Uploading…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* list */}
      <div className="space-y-4">
        {loadingList ? (
          <div className="text-text-secondary">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="text-text-secondary">No invoices yet.</div>
        ) : (
          invoices.map((inv) => {
            const invoiceAmount = formatAmount(inv.amount);
            const cleanDescription = stripBillingInvoiceId(inv.description);
            return (
            <div key={inv.id} className="bg-white border border-gray-200 rounded-xl p-5">
              {editId === inv.id ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm mb-1">Invoice number</label>
                      <input
                        className="w-full px-3 py-2 border rounded-lg"
                        value={editForm.invoice_number}
                        onChange={(e) => setEditForm(s => ({ ...s, invoice_number: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Amount (EUR)</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border rounded-lg"
                        value={editForm.amount}
                        onChange={(e) => setEditForm(s => ({ ...s, amount: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">VAT (EUR)</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border rounded-lg"
                        value={editForm.vat_amount ?? ''}
                        onChange={(e) => setEditForm(s => ({ ...s, vat_amount: e.target.value }))}
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-sm mb-1">Description</label>
                      <textarea
                        rows={2}
                        className="w-full px-3 py-2 border rounded-lg"
                        value={editForm.description}
                        onChange={(e) => setEditForm(s => ({ ...s, description: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Issue date</label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 border rounded-lg"
                        value={editForm.issue_date || ''}
                        onChange={(e) => setEditForm(s => ({ ...s, issue_date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Due date</label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 border rounded-lg"
                        value={editForm.due_date || ''}
                        onChange={(e) => setEditForm(s => ({ ...s, due_date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Status</label>
                      <select
                        className="w-full px-3 py-2 border rounded-lg"
                        value={editForm.status}
                        onChange={(e) => setEditForm(s => ({ ...s, status: e.target.value }))}
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button onClick={cancelEdit} className="px-3 py-2 border rounded-lg flex items-center">
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </button>
                    <button onClick={saveEdit} className="px-3 py-2 bg-green-600 text-white rounded-lg flex items-center">
                      <Save className="w-4 h-4 mr-1" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row md:items-center justify-between">
                  <div className="flex-1 mb-3 md:mb-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-5 h-5 text-text-secondary" />
                      <h4 className="font-semibold text-text-primary">Invoice #{inv.invoice_number}</h4>
                      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${pill(inv.status)}`}>
                        {inv.status}
                      </span>
                    </div>
                    <div className="text-sm text-text-secondary space-y-1">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-2" />
                        <span>Issue: {inv.issue_date}</span>
                      </div>
                      {invoiceAmount && (
                        <div className="flex items-center">
                          <span className="ml-6 font-semibold text-text-primary">
                            Suma: {invoiceAmount}
                          </span>
                        </div>
                      )}
                      {inv.due_date && (
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2" />
                          <span>Due: {inv.due_date}</span>
                        </div>
                      )}
                      {cleanDescription && <p>{cleanDescription}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {inv.file_path && (
                      <button
                        onClick={() => viewInvoice(inv)}
                        className="flex items-center px-3 py-2 text-primary border border-primary rounded-lg hover:bg-primary hover:text-white transition-colors"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </button>
                    )}
                    {inv.file_path && (
                     <button
                        onClick={() => downloadInvoice(inv)}
                        className="flex items-center px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </button>
                    )}
                    <button
                      onClick={() => sendInvoiceEmail(inv)}
                      disabled={!inv.file_path || emailingId === inv.id}
                      className="flex items-center px-3 py-2 border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-60"
                    >
                      <Mail className="w-4 h-4 mr-1" />
                      {emailingId === inv.id ? 'Sending...' : 'Send email'}
                    </button>
                    <button
                      onClick={() => startEdit(inv)}
                      className="flex items-center px-3 py-2 border rounded-lg hover:bg-gray-50"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </button>
                    <button
                      onClick={() => deleteInvoice(inv)}
                      className="flex items-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
          })
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, User } from 'lucide-react';
import { supabase, supabaseHelpers } from '../../config/supabase';
import Section from '../common/Section';
import AdminClientInvoices from './AdminClientInvoices';
import AdminClientBillingProfiles from './AdminClientBillingProfiles';
import AdminDeals from './AdminDeals';

import AdminFBA from './AdminFBA';
import AdminFBM from './AdminFBM';
import AdminStockClientView from './AdminStockClientView';
import AdminReturns from './AdminReturns';
import AdminOther from './AdminOther';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import BillingSelectionPanel from './BillingSelectionPanel';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import AdminClientIntegrations from './AdminClientIntegrations';

export default function AdminUserDetail({ profile, onBack }) {
  const { profile: currentAdmin } = useSupabaseAuth();
  const isLimitedAdmin = Boolean(currentAdmin?.is_limited_admin);
  const canManageInvoices = !isLimitedAdmin;
  const [companyId, setCompanyId] = useState(profile?.company_id || null);
  const [company, setCompany] = useState(null);

  const [fbaRows, setFbaRows] = useState([]);
  const [fbmRows, setFbmRows] = useState([]);
  const [otherRows, setOtherRows] = useState([]);
  const [returnRows, setReturnRows] = useState([]);
  const [billingSelections, setBillingSelections] = useState({});
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingError, setBillingError] = useState('');
  const hasBillingSelection = canManageInvoices && Object.keys(billingSelections).length > 0;
  const serviceSections = ['fba', 'fbm', 'other', 'stock', 'returns', 'integrations'];
  const allowedSections = isLimitedAdmin ? ['stock'] : serviceSections;

  // panouri “secundare” (billing / invoices)
  const [activePanel, setActivePanel] = useState(null);

  // nou: tab-urile principale din dreapta clientului (persistate per client)
  const sectionStorageKey = profile?.id
    ? `admin-user-section-${profile.id}`
    : 'admin-user-section';
  const defaultSection = allowedSections[0] || 'stock';
  const [activeSectionRaw, setActiveSection] = useSessionStorage(sectionStorageKey, defaultSection);
  const activeSection = allowedSections.includes(activeSectionRaw) ? activeSectionRaw : defaultSection;

  useEffect(() => {
    if (!allowedSections.includes(activeSectionRaw) && defaultSection) {
      setActiveSection(defaultSection);
    }
  }, [allowedSections, activeSectionRaw, defaultSection, setActiveSection]);

  // Creează companie dacă lipsește și atașează profilul la ea
const ensureCompany = async () => {
  const cid = profile?.company_id || profile?.id || null;
  setCompanyId(cid);
  return cid;
};

  const loadAll = async () => {
    const cid = await ensureCompany();
    if (!cid) return;

    const invoiceSelect = canManageInvoices
      ? '*, billing_invoice:billing_invoices(id, invoice_number, invoice_date)'
      : '*';

    const fetchPromises = [];
    if (!isLimitedAdmin) {
      fetchPromises.push(
        supabase
          .from('fba_lines')
          .select(invoiceSelect)
          .eq('company_id', cid)
          .order('service_date', { ascending: false })
      );
      fetchPromises.push(
        supabase
          .from('fbm_lines')
          .select(invoiceSelect)
          .eq('company_id', cid)
          .order('service_date', { ascending: false })
      );
      fetchPromises.push(
        supabase
          .from('other_lines')
          .select(invoiceSelect)
          .eq('company_id', cid)
          .order('service_date', { ascending: false })
      );
    }
    fetchPromises.push(
      supabase
        .from('returns')
        .select('*')
        .eq('company_id', cid)
        .order('return_date', { ascending: false })
    );

    const results = await Promise.all(fetchPromises);
    const [fbaRes, fbmRes, otherRes, returnsRes] = isLimitedAdmin
      ? [null, null, null, results[0]]
      : results;

setCompany({ id: cid, name: profile.company_name || profile.first_name || profile.email });
if (!isLimitedAdmin) {
  if (!fbaRes?.error) setFbaRows(fbaRes?.data || []);
  if (!fbmRes?.error) setFbmRows(fbmRes?.data || []);
  if (!otherRes?.error) setOtherRows(otherRes?.data || []);
} else {
  setFbaRows([]);
  setFbmRows([]);
  setOtherRows([]);
}
if (!returnsRes?.error) setReturnRows(returnsRes?.data || []);

  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const toggleBillingSelection = useCallback((section, row) => {
    if (!canManageInvoices) return;
    setBillingSelections((prev) => {
      const key = `${section}:${row.id}`;
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
        return next;
      }
      next[key] = { section, row };
      return next;
    });
  }, [canManageInvoices]);

  const clearBillingSelections = useCallback(() => {
    setBillingSelections({});
    setBillingError('');
  }, []);

  const handleBillingSave = useCallback(
    async ({ invoiceNumber, invoiceDate, lines, total }) => {
    if (!company?.id) {
      const error = new Error('Nicio companie selectată.');
      setBillingError(error.message);
      return { error };
    }
      setBillingSaving(true);
      setBillingError('');
      const { error } = await supabaseHelpers.createBillingInvoice({
        company_id: company.id,
        user_id: profile?.id,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        total_amount: total,
        lines
      });
      if (error) {
        setBillingError(error.message || 'Nu am putut salva factura.');
        setBillingSaving(false);
        return { error };
      }
      setBillingSaving(false);
      setBillingSelections({});
      await loadAll();
      return { error: null };
    },
    [company?.id, profile?.id, loadAll]
  );

  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Utilizator';

  // helper pentru stilul butoanelor de tab
  const tabBtn = (on, off) =>
    `px-4 py-2 rounded-lg text-sm font-medium ${on ? 'bg-blue-50 text-primary border border-blue-200' : 'text-text-secondary hover:bg-gray-50'}`;

  useEffect(() => {
    if (!canManageInvoices && activePanel === 'invoices') {
      setActivePanel(null);
    }
  }, [canManageInvoices, activePanel]);

  useEffect(() => {
    if (!canManageInvoices) {
      setBillingSelections({});
      setBillingError('');
    }
  }, [canManageInvoices]);

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center text-sm text-text-secondary hover:text-primary"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Înapoi la listă
      </button>

      {/* Header utilizator */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          {/* stânga: info client */}
          <div>
            <h2 className="text-xl font-semibold text-text-primary flex items-center">
              <User className="w-5 h-5 mr-2" />
              {displayName}
            </h2>
            <p className="text-sm text-text-secondary">
              {profile?.email} · Companie: <strong>{company?.name || '—'}</strong>
            </p>
          </div>

          {/* dreapta: 2 rânduri de acțiuni (sus: Billing/Invoices; jos: FBA/FBM/Stock/Retururi) */}
          <div className="flex flex-col items-end gap-2">
            {/* Billing / Invoices */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActivePanel((p) => (p === 'deals' ? null : 'deals'))}
                className={tabBtn(activePanel === 'deals')}
              >
                Deals negociate
              </button>
              <button
                onClick={() => setActivePanel((p) => (p === 'billing' ? null : 'billing'))}
                className={tabBtn(activePanel === 'billing')}
              >
                Billing details
              </button>
              {canManageInvoices && (
                <button
                  onClick={() => setActivePanel((p) => (p === 'invoices' ? null : 'invoices'))}
                  className={tabBtn(activePanel === 'invoices')}
                >
                  Invoices
                </button>
              )}
            </div>
    
            {/* Tabs principale */}
            <div className="flex items-center gap-2 flex-wrap">
              {allowedSections.includes('fba') && (
                <button
                  onClick={() => setActiveSection('fba')}
                  className={tabBtn(activeSection === 'fba')}
                  title="FBA"
                >
                  FBA
                </button>
              )}
              {allowedSections.includes('fbm') && (
                <button
                  onClick={() => setActiveSection('fbm')}
                  className={tabBtn(activeSection === 'fbm')}
                  title="FBM"
                >
                  FBM
                </button>
              )}
              {allowedSections.includes('other') && (
                <button
                  onClick={() => setActiveSection('other')}
                  className={tabBtn(activeSection === 'other')}
                  title="Other"
                >
                  Other
                </button>
              )}
              {allowedSections.includes('stock') && (
                <button
                  onClick={() => setActiveSection('stock')}
                  className={tabBtn(activeSection === 'stock')}
                  title="Stoc"
                >
                  Stock
                </button>
              )}
              {allowedSections.includes('returns') && (
                <button
                  onClick={() => setActiveSection('returns')}
                  className={tabBtn(activeSection === 'returns')}
                  title="Retururi"
                >
                  Retururi
                </button>
              )}
              {allowedSections.includes('integrations') && (
                <button
                  onClick={() => setActiveSection('integrations')}
                  className={tabBtn(activeSection === 'integrations')}
                  title="Integrări Amazon"
                >
                  Integrations
                </button>
              )}
            </div>
          </div>
        </div>

        {/* panouri secundare (sub header) */}
        {activePanel === 'billing' && (
          <Section title="" right={null}>
            <AdminClientBillingProfiles profile={profile} hideTitles />
          </Section>
        )}
        {canManageInvoices && activePanel === 'invoices' && (
          <Section title="" right={null}>
            <AdminClientInvoices profile={profile} hideTitles />
          </Section>
        )}
      </div>
      {activePanel === 'deals' && (
        <Section title="" right={null}>
          <AdminDeals companyId={companyId} />
        </Section>
      )}
      {/* Conținut principal – afișăm DOAR tab-ul selectat */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
            {activeSection === 'fba' && (
              <AdminFBA
                rows={fbaRows}
              reload={loadAll}
              companyId={companyId}
              profile={profile}
              billingSelectedLines={billingSelections}
              onToggleBillingSelection={toggleBillingSelection}
              canSelectForBilling={canManageInvoices}
            />
          )}
            {activeSection === 'fbm' && (
              <AdminFBM
              rows={fbmRows}
              reload={loadAll}
              companyId={companyId}
              profile={profile}
              billingSelectedLines={billingSelections}
              onToggleBillingSelection={toggleBillingSelection}
              canSelectForBilling={canManageInvoices}
            />
          )}
            {activeSection === 'other' && (
              <AdminOther
              rows={otherRows}
              reload={loadAll}
              companyId={companyId}
              profile={profile}
              billingSelectedLines={billingSelections}
              onToggleBillingSelection={toggleBillingSelection}
              canSelectForBilling={canManageInvoices}
            />
          )}
          {activeSection === 'stock' && (
            <AdminStockClientView profile={profile} />
          )}
          {activeSection === 'returns' && (
            <AdminReturns rows={returnRows} reload={loadAll} companyId={companyId} profile={profile} />
          )}
          {activeSection === 'integrations' && !isLimitedAdmin && (
            <AdminClientIntegrations profile={profile} />
          )}
        </div>
        {canManageInvoices && hasBillingSelection && (
          <div className="lg:w-[360px] lg:flex-shrink-0">
            <BillingSelectionPanel
              selections={billingSelections}
              onSave={handleBillingSave}
              onClear={clearBillingSelections}
              isSaving={billingSaving}
              error={billingError}
            />
          </div>
        )}
      </div>
    </div>
  );
}

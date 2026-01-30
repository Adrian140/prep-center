import React, { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { supabase } from '@/config/supabase';

const FieldLabel = ({ label, children }) => (
  <div className="flex flex-col gap-1 text-sm text-slate-700">
    <span className="font-semibold text-slate-800">{label}</span>
    {children}
  </div>
);

// Small inline placeholder (60x60 light gray) to avoid network failures
const placeholderImg =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%23f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="10">SKU</text></svg>';

export default function FbaStep1Inventory({
  data,
  skuStatuses = [],
  blocking = false,
  error = '',
  loadingPlan = false,
  saving = false,
  inboundPlanId = null,
  requestId = null,
  packGroupsPreview = [],
  packGroupsPreviewLoading = false,
  packGroupsPreviewError = '',
  onChangePacking,
  onChangeQuantity,
  onChangeExpiry,
  onChangePrep,
  onNext
}) {
  const resolvedInboundPlanId =
    inboundPlanId ||
    data?.inboundPlanId ||
    data?.inbound_plan_id ||
    data?.planId ||
    data?.plan_id ||
    null;
  const shipFrom = data?.shipFrom || {};
  const marketplaceRaw = data?.marketplace || '';
  const rawSkus = Array.isArray(data?.skus) ? data.skus : [];
  const skus = rawSkus;

  const marketplaceIdByCountry = {
    FR: 'A13V1IB3VIYZZH',
    DE: 'A1PA6795UKMFR9',
    ES: 'A1RKKUPIHCS9HS',
    IT: 'APJ6JRA9NG5V4',
    FRANCE: 'A13V1IB3VIYZZH',
    GERMANY: 'A1PA6795UKMFR9',
    SPAIN: 'A1RKKUPIHCS9HS',
    ITALY: 'APJ6JRA9NG5V4'
  };
  const marketplaceId = (() => {
    const upper = String(marketplaceRaw || '').trim().toUpperCase();
    return marketplaceIdByCountry[upper] || marketplaceRaw;
  })();
  const marketplaceName = (() => {
    const map = {
      A13V1IB3VIYZZH: 'France',
      A1PA6795UKMFR9: 'Germany',
      A1RKKUPIHCS9HS: 'Spain',
      APJ6JRA9NG5V4: 'Italy'
    };
    return map[marketplaceId] || marketplaceRaw || '—';
  })();
  const totalUnits = skus.reduce((sum, sku) => sum + Number(sku.units || 0), 0);
  const hasUnits = totalUnits > 0;
  const statusForSku = (sku) => {
    const match =
      skuStatuses.find((s) => s.sku === sku.sku) ||
      skuStatuses.find((s) => s.asin && s.asin === sku.asin) ||
      skuStatuses.find((s) => s.id && s.id === sku.id);
    return match || { state: 'unknown', reason: '' };
  };
  const hasBlocking = blocking || skuStatuses.some((s) => ['missing', 'inactive', 'restricted'].includes(String(s.state)));

  const [packingModal, setPackingModal] = useState({
    open: false,
    sku: null,
    templateType: 'case',
    unitsPerBox: '',
    boxL: '',
    boxW: '',
    boxH: '',
    boxWeight: '',
    templateName: ''
  });
  const [prepModal, setPrepModal] = useState({
    open: false,
    sku: null,
    prepCategory: '',
    useManufacturerBarcode: false,
    manufacturerBarcodeEligible: true
  });
  const LABEL_PRESETS = {
    thermal: { width: '50', height: '25' },
    standard: { width: '63', height: '25' }
  };

  const [labelModal, setLabelModal] = useState({
    open: false,
    sku: null,
    format: 'thermal',
    width: LABEL_PRESETS.thermal.width,
    height: LABEL_PRESETS.thermal.height,
    quantity: 1
  });
  const [prepTab, setPrepTab] = useState('prep');
  const [prepSelections, setPrepSelections] = useState({});
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState('');

  // Prefill prep selections as "No prep needed" for all SKUs (Amazon expects a choice).
  useEffect(() => {
    setPrepSelections((prev) => {
      const next = { ...prev };
      skus.forEach((sku) => {
        if (!next[sku.id]) {
          next[sku.id] = {
            resolved: true,
            prepCategory: 'none',
            useManufacturerBarcode: false,
            manufacturerBarcodeEligible: sku.manufacturerBarcodeEligible !== false
          };
        }
      });
      return next;
    });
  }, [skus]);

  const openPackingModal = (sku) => {
    setPackingModal({
      open: true,
      sku,
      templateType: 'case',
      unitsPerBox: '',
      boxL: '',
      boxW: '',
      boxH: '',
      boxWeight: '',
      templateName: ''
    });
  };

  const closePackingModal = () => setPackingModal((prev) => ({ ...prev, open: false, sku: null }));

  const savePackingTemplate = async () => {
    if (packingModal.sku) {
      const derivedName =
        packingModal.templateName || (packingModal.unitsPerBox ? `pack ${packingModal.unitsPerBox}` : '');
      if (!derivedName) {
        setTemplateError('Setează un nume sau units per box pentru template.');
        return;
      }

      const templateType = packingModal.templateType === 'case' ? 'case' : 'individual';
      const unitsPerBox = packingModal.unitsPerBox ? Number(packingModal.unitsPerBox) : null;

      // Persist template if we have a name and companyId
      if (!data?.companyId) {
        setTemplateError('Lipsește companyId în plan; nu pot salva template-ul.');
      } else {
        try {
          const payload = {
            company_id: data.companyId,
            marketplace_id: marketplaceId,
            sku: packingModal.sku.sku || null,
            asin: packingModal.sku.asin || null,
            name: derivedName,
            template_type: templateType,
            units_per_box: unitsPerBox,
            box_length_cm: packingModal.boxL ? Number(packingModal.boxL) : null,
            box_width_cm: packingModal.boxW ? Number(packingModal.boxW) : null,
            box_height_cm: packingModal.boxH ? Number(packingModal.boxH) : null,
            box_weight_kg: packingModal.boxWeight ? Number(packingModal.boxWeight) : null
          };
          const { error } = await supabase
            .from('packing_templates')
            .upsert(payload, { onConflict: 'company_id,marketplace_id,sku,name' });
          if (error) {
            console.error('packing template upsert error', error);
            throw error;
          }
          // Reload templates
          const { data: rows } = await supabase
            .from('packing_templates')
            .select('*')
            .eq('company_id', data.companyId)
            .eq('marketplace_id', marketplaceId);
          setTemplates(Array.isArray(rows) ? rows : []);
        } catch (e) {
          setTemplateError(e?.message || 'Nu am putut salva template-ul.');
        }
      }

      onChangePacking(packingModal.sku.id, {
        packing: templateType,
        packingTemplateName: derivedName || null,
        unitsPerBox
      });
    }
    closePackingModal();
  };

  const openPrepModal = (sku, eligible = true) => {
    setPrepModal({
      open: true,
      sku,
      prepCategory: prepSelections[sku.id]?.prepCategory || '',
      useManufacturerBarcode: prepSelections[sku.id]?.useManufacturerBarcode || false,
      manufacturerBarcodeEligible: eligible
    });
  };

  const closePrepModal = () => setPrepModal((prev) => ({ ...prev, open: false, sku: null }));

  const savePrepModal = () => {
    if (!prepModal.sku) return;
    const patch = {
      resolved: true,
      prepCategory: prepModal.prepCategory || 'none',
      useManufacturerBarcode: prepModal.useManufacturerBarcode,
      manufacturerBarcodeEligible: prepModal.manufacturerBarcodeEligible
    };
    const labelOwnerFromSku = prepModal.sku.labelOwner || null;
    const derivedLabelOwner =
      labelOwnerFromSku ||
      (patch.useManufacturerBarcode
        ? 'NONE'
        : prepModal.sku.manufacturerBarcodeEligible === false
          ? 'SELLER'
          : null);
    const prepOwner = patch.prepCategory && patch.prepCategory !== 'none' ? 'SELLER' : 'NONE';

    setPrepSelections((prev) => ({
      ...prev,
      [prepModal.sku.id]: patch
    }));
    onChangePrep?.(prepModal.sku.id, {
      prepCategory: patch.prepCategory,
      useManufacturerBarcode: patch.useManufacturerBarcode,
      prepOwner,
      labelOwner: derivedLabelOwner
    });
    closePrepModal();
  };

  const openLabelModal = (sku) => {
    setLabelModal({
      open: true,
      sku,
      format: 'thermal',
      width: '50',
      height: '25',
      quantity: Number(sku.units || 1) || 1
    });
  };

  const closeLabelModal = () => setLabelModal((prev) => ({ ...prev, open: false, sku: null }));

  const handleDownloadLabels = async () => {
    if (!labelModal.sku) return;
    setLabelError('');
    setLabelLoading(true);

    try {
      const payload = {
        company_id: data.companyId,
        marketplace_id: marketplaceId,
        items: [
          {
            sku: labelModal.sku.sku,
            asin: labelModal.sku.asin,
            fnsku: labelModal.sku.fnsku,
            quantity: Math.max(1, Number(labelModal.quantity) || 1)
          }
        ]
      };

      const { data: resp, error } = await supabase.functions.invoke('fba-labels', { body: payload });
      if (error) {
        throw new Error(error.message || 'Nu am putut cere etichetele de la Amazon.');
      }
      if (resp?.error) {
        throw new Error(resp.error);
      }
      if (resp?.downloadUrl) {
        window.open(resp.downloadUrl, '_blank', 'noopener');
        closeLabelModal();
        return;
      }
      if (resp?.operationId) {
        setLabelError('Label request trimis la Amazon; reîncearcă după câteva secunde dacă nu s-a deschis PDF-ul.');
        return;
      }
      throw new Error('Răspuns Amazon fără downloadUrl/operationId');
    } catch (err) {
      console.error('fba-labels error', err);
      setLabelError(err?.message || 'Nu am putut descărca etichetele Amazon.');
    } finally {
      setLabelLoading(false);
    }
  };

  const prepCategoryLabel = (value) => {
    switch (value) {
      case 'fragile':
        return 'Fragile/glass';
      case 'liquids':
        return 'Liquids (non glass)';
      case 'perforated':
        return 'Perforated packaging';
      case 'powder':
        return 'Powder, pellets and granular';
      case 'small':
        return 'Small';
      case 'none':
      default:
        return 'No prep needed';
    }
  };

  // Load packing templates for this company/marketplace
  useEffect(() => {
    const loadTemplates = async () => {
      if (!data?.companyId) return;
      setLoadingTemplates(true);
      setTemplateError('');
      try {
        const { data: rows, error } = await supabase
          .from('packing_templates')
          .select('*')
          .eq('company_id', data.companyId)
          .eq('marketplace_id', marketplaceId);
        if (error) throw error;
        setTemplates(Array.isArray(rows) ? rows : []);
      } catch (e) {
        setTemplateError(e?.message || 'Nu am putut încărca template-urile de packing.');
      } finally {
        setLoadingTemplates(false);
      }
    };
    loadTemplates();
  }, [data?.companyId, marketplaceId]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600" />
        <div className="font-semibold text-slate-900">Step 1 - Confirmed inventory to send</div>
        <div className="text-sm text-slate-500">SKUs confirmed ({skus.length})</div>
      </div>

      {(error || hasBlocking) && (
        <div
          className={`px-6 py-3 border-b text-sm ${error ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}
        >
          {error || 'Unele produse nu sunt eligibile pentru marketplace-ul selectat.'}
        </div>
      )}
      {loadingPlan && skus.length === 0 && (
        <div className="px-6 py-3 border-b text-sm bg-amber-50 text-amber-800 border-amber-200">
          Planul Amazon este în curs de încărcare. Așteptăm SKU-urile/shipments generate; momentan nu afișăm produse.
        </div>
      )}

      <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border-b border-slate-200">
        <FieldLabel label="Ship from">
          <div className="text-slate-800">{shipFrom.name || '—'}</div>
          <div className="text-slate-600 text-sm">{shipFrom.address || '—'}</div>
        </FieldLabel>
        <FieldLabel label="Marketplace destination (Country)">
          <select
            value={marketplaceId}
            className="border rounded-md px-3 py-2 text-sm w-full bg-slate-100 text-slate-800"
            disabled
          >
            <option value={marketplaceId}>{marketplaceName}</option>
          </select>
        </FieldLabel>
      </div>

      <div className="px-6 py-4 overflow-x-auto">
        <table className="min-w-full text-sm text-slate-700">
          <colgroup>
            <col className="w-[42%]" />
            <col className="w-[22%]" />
            <col className="w-[24%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-slate-500 uppercase text-xs">
              <th className="py-2">SKU details</th>
              <th className="py-2">Packing details</th>
              <th className="py-2">Information / action</th>
              <th className="py-2">Quantity to send</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {skus.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-500">
                  {loadingPlan
                    ? 'Așteptăm răspunsul Amazon pentru SKU-uri și shipments...'
                    : 'Nu există SKU-uri de afișat.'}
                </td>
              </tr>
            )}
            {skus.map((sku) => {
              const status = statusForSku(sku);
              const state = String(status.state || '').toLowerCase();
              const prepSelection = prepSelections[sku.id] || {};
              const labelOwner =
                sku.labelOwner ||
                (prepSelection.useManufacturerBarcode === true
                  ? 'NONE'
                  : sku.manufacturerBarcodeEligible === false
                    ? 'SELLER'
                    : null);
              const labelOwnerSource = sku.labelOwnerSource || 'unknown';
              const labelRequired = labelOwner && labelOwner !== 'NONE';
              const showLabelButton =
                (labelRequired || labelOwner === null) &&
                (['amazon-override', 'prep-guidance'].includes(labelOwnerSource) || true);
              const needsPrepNotice = sku.prepRequired || sku.manufacturerBarcodeEligible === false;
              const prepResolved = prepSelection.resolved;
              const needsExpiry = Boolean(sku.expiryRequired);
              const badgeClass =
                state === 'ok'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : state === 'missing' || state === 'restricted'
                    ? 'text-red-700 bg-red-50 border-red-200'
                    : state === 'inactive'
                      ? 'text-amber-700 bg-amber-50 border-amber-200'
                      : 'text-slate-600 bg-slate-100 border-slate-200';

              const badgeLabel =
                state === 'ok'
                  ? 'Eligibil'
                  : state === 'missing'
                    ? 'Nu există listing'
                    : state === 'inactive'
                      ? 'Listing inactiv'
                      : state === 'restricted'
                        ? 'Restricționat'
                        : 'Necunoscut';

              return (
                <tr key={sku.id} className="align-top">
                <td className="py-3">
                  <div className="flex gap-3">
                    <img
                      src={sku.image || placeholderImg}
                      alt={sku.title}
                      className="w-12 h-12 object-contain border border-slate-200 rounded"
                    />
                    <div>
                      <div className="font-semibold text-slate-900 hover:text-blue-700 cursor-pointer">
                        {sku.title}
                      </div>
                      <div className="text-xs text-slate-500">SKU: {sku.sku}</div>
                      <div className="text-xs text-slate-500">ASIN: {sku.asin}</div>
                      <div className="text-xs text-slate-500">Storage: {sku.storageType}</div>
                      <div className={`mt-2 inline-flex items-center gap-2 text-xs border px-2 py-1 rounded ${badgeClass}`}>
                        {badgeLabel}
                        {status.reason ? <span className="text-slate-500">· {status.reason}</span> : null}
                      </div>
                    </div>
                  </div>
                </td>
                  <td className="py-3">
                    <select
                      value={sku.packingTemplateName || sku.packing || 'individual'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__template__') {
                          openPackingModal(sku);
                          return;
                        }
                        const template = templates.find(
                          (t) => t.name === val && (t.sku === sku.sku || (t.asin && t.asin === sku.asin))
                        );
                        if (template) {
                          onChangePacking(sku.id, {
                            packing: template.template_type === 'case' ? 'case' : 'individual',
                            packingTemplateId: template.id,
                            packingTemplateName: template.name,
                            unitsPerBox: template.units_per_box || null
                          });
                          return;
                        }
                        onChangePacking(sku.id, {
                          packing: val,
                          packingTemplateId: null,
                          packingTemplateName: null,
                          unitsPerBox: null
                        });
                      }}
                      className="border rounded-md px-3 py-2 text-sm w-full"
                    >
                      {templates
                        .filter((t) => t.sku === sku.sku || (t.asin && t.asin === sku.asin))
                        .map((t) => (
                          <option key={t.id} value={t.name}>
                            {t.name}
                          </option>
                        ))}
                      <option value="individual">Individual units</option>
                      <option value="case">Case packed</option>
                      <option value="__template__">Create packing template</option>
                    </select>
                  </td>
                  <td className="py-3">
                    <div className="space-y-1">
                      <div className="text-slate-700 flex items-center gap-2">
                        <span>
                          {needsPrepNotice && prepResolved
                            ? `Prep set: ${prepCategoryLabel(prepSelection.prepCategory)}`
                            : sku.prepRequired
                              ? 'Prep and labelling details needed'
                              : 'Prep not required'}
                        </span>
                        <button
                          onClick={() => openPrepModal(sku, sku.manufacturerBarcodeEligible !== false)}
                          className="text-amber-600 text-xs inline-flex items-center gap-1"
                        >
                          More inputs
                        </button>
                      </div>
                      <div className="text-xs text-slate-600">
                        {prepSelection.manufacturerBarcodeEligible === false
                          ? 'Manufacturer barcode not eligible'
                          : prepSelection.useManufacturerBarcode
                            ? 'Unit labelling: Not required (manufacturer barcode)'
                            : labelOwner === 'NONE'
                              ? 'Unit labelling: Not required'
                              : labelOwner
                                ? 'Unit labelling: By seller'
                                : 'Unit labelling: Unknown (check guidance)'}
                      </div>
                      {sku.manufacturerBarcodeEligible !== false && !prepSelection.useManufacturerBarcode && (
                        <button
                          onClick={() => {
                            const currentPrepCategory = prepSelections[sku.id]?.prepCategory || 'none';
                            setPrepSelections((prev) => ({
                              ...prev,
                              [sku.id]: {
                                ...(prev[sku.id] || {}),
                                resolved: true,
                                prepCategory: currentPrepCategory,
                                useManufacturerBarcode: true,
                                manufacturerBarcodeEligible: true
                              }
                            }));
                            onChangePrep?.(sku.id, {
                              prepCategory: currentPrepCategory,
                              useManufacturerBarcode: true,
                              prepOwner: 'NONE',
                              labelOwner: 'NONE'
                            });
                          }}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center"
                        >
                          Save by using manufacturer barcode
                        </button>
                      )}
                      {showLabelButton && (
                        <button
                          onClick={() => openLabelModal(sku)}
                          className="text-sm font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                        >
                          Print SKU labels
                        </button>
                      )}
                      {labelRequired && labelOwnerSource === 'amazon-override' && (
                        <div className="text-[11px] text-amber-600">
                          Amazon solicită etichete pentru acest SKU.
                        </div>
                      )}
                      {labelOwner === null && (
                        <div className="text-[11px] text-amber-600">
                          Label owner necunoscut (se recomandă verificare / print).
                        </div>
                      )}
                    </div>
                    {templateError && (
                      <div className="text-xs text-red-600 mt-2">
                        {templateError}
                      </div>
                    )}
                  </td>
                  <td className="py-3 w-48">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col text-xs text-slate-600">
                        <span className="mb-1 text-slate-700">Boxes</span>
                        <input
                          type="text"
                          value="—"
                          disabled
                          className="border rounded-md px-2 py-1 w-16 bg-slate-100 text-center text-slate-500"
                        />
                      </div>
                      <div className="flex flex-col text-xs text-slate-600">
                        <span className="mb-1 text-slate-700">Units</span>
                        <input
                          type="number"
                          min={0}
                          value={sku.units}
                          onChange={(e) => onChangeQuantity(sku.id, Number(e.target.value))}
                          className="border rounded-md px-2 py-1 w-20"
                        />
                      </div>
                    </div>
                    {needsExpiry && (
                      <div className="mt-3 flex flex-col gap-1 text-xs text-slate-700">
                        <div className="font-semibold text-slate-800">Expiry</div>
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={sku.expiry || ''}
                            onChange={(e) => onChangeExpiry(sku.id, e.target.value)}
                            className="border rounded-md px-2 py-1 text-xs"
                          />
                        </div>
                      </div>
                    )}
                    {sku.readyToPack && (
                      <div className="mt-2 flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                        <CheckCircle className="w-4 h-4" /> Ready to pack
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-slate-200 space-y-3">
        <div className="font-semibold text-slate-900">Pack groups preview (Step 1)</div>
        {packGroupsPreviewLoading && (
          <div className="text-sm text-slate-600">Se încarcă gruparea de la Amazon…</div>
        )}
        {!packGroupsPreviewLoading && packGroupsPreviewError && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
            {packGroupsPreviewError}
          </div>
        )}
        {!packGroupsPreviewLoading && !packGroupsPreviewError && (!packGroupsPreview || packGroupsPreview.length === 0) && (
          <div className="text-sm text-slate-600">
            Nu avem încă packing groups. Continuă către Step 1b sau reîncarcă planul.
          </div>
        )}
        {!packGroupsPreviewLoading && Array.isArray(packGroupsPreview) && packGroupsPreview.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {packGroupsPreview.map((group, idx) => {
              const items = Array.isArray(group.items) ? group.items : [];
              return (
                <div key={group.packingGroupId || group.id || `pack-${idx + 1}`} className="px-4 py-3">
                  <div className="font-semibold text-slate-900">Pack {idx + 1}</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    {items.map((it, itemIdx) => {
                      const label = it.title || it.name || it.sku || it.asin || 'SKU';
                      const skuLabel = it.sku || it.msku || it.SellerSKU || it.asin || '—';
                      const qty = Number(it.quantity || 0) || 0;
                      return (
                        <div key={`${skuLabel}-${itemIdx}`} className="flex items-center justify-between gap-3">
                          <div className="flex flex-col">
                            <span className="font-semibold">{label}</span>
                            <span className="text-xs text-slate-500">{skuLabel}</span>
                          </div>
                          <div className="text-sm font-semibold">{qty}</div>
                        </div>
                      );
                    })}
                  </div>
                  {idx < packGroupsPreview.length - 1 && <div className="border-t border-slate-200 mt-3" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200">
        <div className="text-sm text-slate-600">
          SKUs confirmed to send: {skus.length} ({totalUnits} units)
        </div>
        <div className="flex gap-3 justify-end">
          {!resolvedInboundPlanId && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
              Așteptăm inboundPlanId de la Amazon; nu poți continua până nu este încărcat planul.
            </div>
          )}
          {!hasUnits && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-md">
              Nu există unități de trimis. Setează cel puțin 1 unitate.
            </div>
          )}
          <button
            onClick={() => {
              if (hasBlocking) {
                alert('Unele SKU-uri nu sunt eligibile în Amazon; rezolvă eligibilitatea și încearcă din nou.');
                return;
              }
              const disabled =
                hasBlocking ||
                saving ||
                !resolvedInboundPlanId ||
                !requestId ||
                !hasUnits ||
                (loadingPlan && skus.length === 0);
              if (disabled) return;
              onNext?.();
            }}
            disabled={
              hasBlocking ||
              saving ||
              !resolvedInboundPlanId ||
              !requestId ||
              !hasUnits ||
              (loadingPlan && skus.length === 0)
            }
            className={`px-4 py-2 rounded-md font-semibold shadow-sm text-white ${
              hasBlocking || saving || !resolvedInboundPlanId || !requestId || !hasUnits || (loadingPlan && skus.length === 0)
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loadingPlan && skus.length === 0
              ? 'Așteaptă răspunsul Amazon...'
              : saving
                ? 'Se salvează…'
                : hasBlocking
                  ? 'Rezolvă eligibilitatea în Amazon'
                  : !inboundPlanId || !requestId
                    ? 'Așteaptă planul Amazon'
                    : !hasUnits
                      ? 'Adaugă unități'
                    : 'Continue to packing'}
          </button>
        </div>
      </div>

      {packingModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">Packing details</div>
              <button onClick={closePackingModal} className="text-slate-500 hover:text-slate-700 text-sm">Close</button>
            </div>
            <div className="px-6 py-5 space-y-5">
              {packingModal.sku && (
                <div className="flex gap-3">
                  <img
                    src={packingModal.sku.image || placeholderImg}
                    alt={packingModal.sku.title}
                    className="w-14 h-14 object-contain border border-slate-200 rounded"
                  />
                  <div className="text-sm text-slate-800">
                    <div className="font-semibold text-slate-900 leading-snug">{packingModal.sku.title}</div>
                    <div className="text-xs text-slate-600">SKU: {packingModal.sku.sku}</div>
                    <div className="text-xs text-slate-600">ASIN: {packingModal.sku.asin}</div>
                    <div className="text-xs text-slate-600">Storage: {packingModal.sku.storageType}</div>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-800">Packing template name</label>
                  <input
                    type="text"
                    value={packingModal.templateName}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, templateName: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    placeholder="e.g. 12 units per box"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-800">Template type</label>
                  <select
                    value={packingModal.templateType}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, templateType: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="case">Case pack</option>
                    <option value="individual">Individual units</option>
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-800">Units per box</label>
                  <input
                    type="number"
                    min={0}
                    value={packingModal.unitsPerBox}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, unitsPerBox: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-sm font-semibold text-slate-800">Box dimensions (cm)</label>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min={0}
                      value={packingModal.boxL}
                      onChange={(e) => setPackingModal((prev) => ({ ...prev, boxL: e.target.value }))}
                      className="border rounded-md px-3 py-2 text-sm"
                      placeholder="L"
                    />
                    <input
                      type="number"
                      min={0}
                      value={packingModal.boxW}
                      onChange={(e) => setPackingModal((prev) => ({ ...prev, boxW: e.target.value }))}
                      className="border rounded-md px-3 py-2 text-sm"
                      placeholder="W"
                    />
                    <input
                      type="number"
                      min={0}
                      value={packingModal.boxH}
                      onChange={(e) => setPackingModal((prev) => ({ ...prev, boxH: e.target.value }))}
                      className="border rounded-md px-3 py-2 text-sm"
                      placeholder="H"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-800">Box weight (kg)</label>
                  <input
                    type="number"
                    min={0}
                    value={packingModal.boxWeight}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, boxWeight: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    placeholder="0.0"
                  />
                </div>
              </div>

              <div className="text-sm text-slate-700">
                <div className="font-semibold text-slate-800">Prep category:</div>
                <div className="text-emerald-700">No prep needed</div>
                <div className="text-slate-600 mt-1">Manufacturer barcode required (no additional labelling needed)</div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={closePackingModal} className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm">
                Cancel
              </button>
              <button
                onClick={savePackingTemplate}
                className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {prepModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">Prepare your FBA items</div>
              <button onClick={closePrepModal} className="text-slate-500 hover:text-slate-700 text-sm">Close</button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {prepModal.sku && (
                <div className="flex gap-3">
                  <img
                    src={prepModal.sku.image || placeholderImg}
                    alt={prepModal.sku.title}
                    className="w-12 h-12 object-contain border border-slate-200 rounded"
                  />
                  <div className="text-sm text-slate-800">
                    <div className="font-semibold text-slate-900 leading-snug">{prepModal.sku.title}</div>
                    <div className="text-xs text-slate-600">SKU: {prepModal.sku.sku}</div>
                    <div className="text-xs text-slate-600">ASIN: {prepModal.sku.asin}</div>
                    <div className="text-xs text-slate-600">Storage: {prepModal.sku.storageType}</div>
                  </div>
                </div>
              )}

              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setPrepTab('prep')}
                  className={`px-4 py-2 text-sm font-semibold ${prepTab === 'prep' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-600'}`}
                >
                  Prep guidance
                </button>
                <button
                  onClick={() => setPrepTab('barcode')}
                  className={`px-4 py-2 text-sm font-semibold ${prepTab === 'barcode' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-600'}`}
                >
                  Use manufacturer barcode
                </button>
              </div>

              {prepTab === 'prep' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Choose prep category</label>
                    <select
                      value={prepModal.prepCategory}
                      onChange={(e) => setPrepModal((prev) => ({ ...prev, prepCategory: e.target.value }))}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Select...</option>
                      <option value="fragile">Fragile/glass</option>
                      <option value="liquids">Liquids (non glass)</option>
                      <option value="perforated">Perforated packaging</option>
                      <option value="powder">Powder, pellets and granular</option>
                      <option value="small">Small</option>
                      <option value="none">No prep needed</option>
                    </select>
                  </div>
                  {prepModal.sku?.prepNotes && (
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2">
                      Guidance: {prepModal.sku.prepNotes}
                    </div>
                  )}
                </div>
              )}

              {prepTab === 'barcode' && (
                <div className="space-y-3">
                  {!prepModal.manufacturerBarcodeEligible ? (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                      This SKU is not eligible to use manufacturer barcode for tracking.
                    </div>
                  ) : (
                    <div className="text-sm text-slate-700">This SKU can use manufacturer barcode.</div>
                  )}
                  <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={prepModal.useManufacturerBarcode}
                      onChange={(e) => setPrepModal((prev) => ({ ...prev, useManufacturerBarcode: e.target.checked }))}
                    />
                    Use manufacturer barcode for tracking
                  </label>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={closePrepModal} className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm">
                Cancel
              </button>
              <button
                onClick={savePrepModal}
                className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {labelModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">Print SKU labels</div>
              <button onClick={closeLabelModal} className="text-slate-500 hover:text-slate-700 text-sm">Close</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {labelModal.sku && (
                <div className="flex gap-3">
                  <img
                    src={labelModal.sku.image || placeholderImg}
                    alt={labelModal.sku.title}
                    className="w-12 h-12 object-contain border border-slate-200 rounded"
                  />
                  <div className="text-sm text-slate-800">
                    <div className="font-semibold text-slate-900 leading-snug">{labelModal.sku.title}</div>
                    <div className="text-xs text-slate-600">SKU: {labelModal.sku.sku}</div>
                    <div className="text-xs text-slate-600">ASIN: {labelModal.sku.asin}</div>
                    <div className="text-xs text-slate-600">Fulfilment by Amazon storage type: {labelModal.sku.storageType}</div>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">Choose printing format</label>
                  <select
                    value={labelModal.format}
                    onChange={(e) => {
                      const nextFormat = e.target.value;
                      const preset = LABEL_PRESETS[nextFormat] || LABEL_PRESETS.thermal;
                      setLabelModal((prev) => ({
                        ...prev,
                        format: nextFormat,
                        width: preset.width,
                        height: preset.height
                      }));
                    }}
                    className="border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="thermal">Thermal printing</option>
                    <option value="standard">Standard formats</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">Width (mm)</label>
                  <input
                    type="number"
                    min={1}
                    value={labelModal.width}
                    onChange={(e) => setLabelModal((prev) => ({ ...prev, width: e.target.value }))}
                    className="border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">Height (mm)</label>
                  <input
                    type="number"
                    min={1}
                    value={labelModal.height}
                    onChange={(e) => setLabelModal((prev) => ({ ...prev, height: e.target.value }))}
                    className="border rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="border border-slate-200 rounded-md">
                <div className="px-4 py-3 text-sm font-semibold text-slate-800 border-b border-slate-200">SKU details</div>
                {labelModal.sku && (
                  <div className="px-4 py-3 flex items-center gap-3">
                    <img
                      src={labelModal.sku.image || placeholderImg}
                      alt={labelModal.sku.title}
                      className="w-10 h-10 object-contain border border-slate-200 rounded"
                    />
                    <div className="flex-1 text-sm text-slate-800">
                      <div className="font-semibold text-slate-900 leading-snug line-clamp-2">{labelModal.sku.title}</div>
                      <div className="text-xs text-slate-600">SKU: {labelModal.sku.sku}</div>
                      <div className="text-xs text-slate-600">ASIN: {labelModal.sku.asin}</div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <label className="text-xs text-slate-600">Print labels</label>
                      <input
                        type="number"
                        min={1}
                        value={labelModal.quantity}
                        onChange={(e) => setLabelModal((prev) => ({ ...prev, quantity: e.target.value }))}
                        className="border rounded-md px-3 py-2 text-sm w-24 text-right"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={closeLabelModal} className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm">
                Cancel
              </button>
              <button
                onClick={handleDownloadLabels}
                disabled={labelLoading}
                className={`px-4 py-2 rounded-md text-white text-sm font-semibold shadow-sm ${labelLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {labelLoading ? 'Downloading…' : 'Download labels'}
              </button>
            </div>
            {labelError && (
              <div className="px-6 pb-4 text-sm text-red-600">
                {labelError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

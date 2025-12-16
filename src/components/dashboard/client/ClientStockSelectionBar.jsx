import React from 'react';

const ClientStockSelectionBar = ({
  t,
  tp,
  selectedIds,
  submitType,
  setSubmitType,
  receptionForm,
  onReceptionFormChange,
  destinationCountries,
  carrierOptions,
  trackingDraft,
  onTrackingDraftChange,
  onTrackingAdd,
  trackingList,
  trackingPanelOpen,
  onToggleTrackingPanel,
  onTrackingRemove,
  onReceptionFbaModeChange, // kept for compatibility, not used
  selectedRows,
  rowEdits,
  updateEdit,
  openPrep,
  openReception,
  openReturn,
  clearSelection,
  onDelete,
  deleteInProgress,
  returnError,
  returnNotes,
  onReturnNotesChange,
  returnInsideFiles = [],
  returnLabelFiles = [],
  onReturnFilesUpload,
  onReturnSubmit,
  savingReturn
}) => {
  if (!selectedIds?.size) return null;
  const rawReturnLabel = t('ClientStock.return.cta') || t('ClientStock.cta.return');
  const returnLabel =
    rawReturnLabel && !String(rawReturnLabel).includes('ClientStock.cta.return')
      ? rawReturnLabel
      : 'Return items';
  const insideLabel =
    t('ClientStock.return.insideDocs') && !String(t('ClientStock.return.insideDocs')).includes('ClientStock.return.insideDocs')
      ? t('ClientStock.return.insideDocs')
      : 'Docs to put inside the box';
  const labelDocsLabel =
    t('ClientStock.return.labelDocs') && !String(t('ClientStock.return.labelDocs')).includes('ClientStock.return.labelDocs')
      ? t('ClientStock.return.labelDocs')
      : 'Return labels';
  const uploadHint =
    t('ClientStock.return.uploadHint') && !String(t('ClientStock.return.uploadHint')).includes('ClientStock.return.uploadHint')
      ? t('ClientStock.return.uploadHint')
      : 'Upload PDF/JPG/PNG/DOC (multiple allowed)';
  const notesLabel =
    t('ClientStock.return.notes') && !String(t('ClientStock.return.notes')).includes('ClientStock.return.notes')
      ? t('ClientStock.return.notes')
      : 'Notes for the team';

  const showReceptionFields = submitType === 'reception';
  const showCarrierOther = receptionForm.carrier === 'OTHER';
  const trackingSummary =
    trackingList.length > 0
      ? t('ClientStock.receptionForm.trackingCount', { count: trackingList.length })
      : t('ClientStock.receptionForm.trackingNone');
  const normalizedDestinationCountries = Array.isArray(destinationCountries)
    ? destinationCountries
    : [];
  const showDestinationNearPrep = submitType === 'prep';
  const showFbaControls = showReceptionFields;
  const showReturnFields = submitType === 'return';
  const selectedCount = Array.isArray(selectedRows) ? selectedRows.length : 0;
  const selectedUnits = Array.isArray(selectedRows)
    ? selectedRows.reduce((acc, row) => {
        const units = Math.max(0, Number(rowEdits?.[row.id]?.units_to_send || 0));
        return acc + units;
      }, 0)
    : 0;
  const itemsLabel = selectedCount === 1 ? 'item' : 'items';
  const unitsLabel = selectedUnits === 1 ? 'unit' : 'units';

  const renderDestinationSelector = (className = 'w-full sm:w-48') => (
    <div className={`flex flex-col gap-1 ${className}`}>
      <select
        value={receptionForm.destinationCountry || 'FR'}
        onChange={(e) => onReceptionFormChange('destinationCountry', e.target.value)}
        className="border rounded-md px-2 py-1 text-sm w-full"
      >
        {normalizedDestinationCountries.map((code) => (
          <option key={code} value={code}>
            {t(`ClientStock.countries.${code}`)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 shadow-md border border-gray-200 rounded-[36px] px-6 py-2 flex flex-col gap-2 items-center backdrop-blur-md bg-white/80 w-full max-w-[640px] sm:px-8">
      <div className="flex flex-col sm:flex-row items-center gap-2 w-full justify-between">
        <select
        value={submitType}
        onChange={(e) => setSubmitType(e.target.value)}
        className="border rounded-md px-3 py-1.5 text-sm min-w-[220px] text-center"
      >
          <option value="prep">{t('ClientStock.cta.sendToPrep')}</option>
          <option value="reception">{t('ClientStock.cta.announceReception')}</option>
          <option value="return">{returnLabel}</option>
          <option value="delete">{t('ClientStock.cta.deleteListing')}</option>
        </select>
        {showReceptionFields && renderDestinationSelector()}
        {showDestinationNearPrep && !showReceptionFields && !showReturnFields && renderDestinationSelector()}
        {showReturnFields && renderDestinationSelector()}
      </div>

      {showReceptionFields && (
        <div className="w-full flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row sm:items-start sm:gap-4">
            <div className="flex-1 min-w-[200px]">
              <select
                value={receptionForm.carrier}
                onChange={(e) => onReceptionFormChange('carrier', e.target.value)}
                className={`border rounded-md px-2 py-1 w-full ${
                  receptionForm.carrier ? 'text-text-primary' : 'text-gray-400'
                }`}
              >
                <option value="">{t('ClientStock.receptionForm.carrierPlaceholder')}</option>
                {carrierOptions.map((carrier) => (
                  <option key={carrier.code} value={carrier.code}>
                    {carrier.code === 'OTHER' ? t('other') : carrier.label}
                  </option>
                ))}
              </select>
              {showCarrierOther && (
                <input
                  type="text"
                  value={receptionForm.carrierOther}
                  onChange={(e) => onReceptionFormChange('carrierOther', e.target.value)}
                  placeholder={t('ClientStock.receptionForm.carrierOther')}
                  className="border rounded-md px-2 py-1 mt-2 w-full"
                />
              )}
              {selectedCount > 0 && (
                <div className="mt-2 flex items-center">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700">
                    {selectedCount} {itemsLabel}
                    {selectedUnits > 0 && (
                      <span className="text-blue-500">· {selectedUnits} {unitsLabel}</span>
                    )}
                  </span>
                </div>
              )}
            </div>

          <div className="flex flex-col flex-[1.2] min-w-[220px]">
            <div className="flex items-center gap-2">
              <input
                  type="text"
                  value={trackingDraft}
                  onChange={(e) => onTrackingDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onTrackingAdd();
                    }
                  }}
                  placeholder={t('ClientStock.receptionForm.tracking')}
                  className="border rounded-md px-2 py-1 w-full"
                />
                <button
                  type="button"
                  onClick={onTrackingAdd}
                  className="px-3 py-1 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary-dark whitespace-nowrap"
                >
                  {t('ClientStock.receptionForm.trackingAddShort') ?? 'Add'}
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                <span className="font-semibold">
                  {trackingList.length > 0 ? `${trackingList.length} added` : trackingSummary}
                </span>
                {trackingList.length > 0 && (
                  <button
                    type="button"
                    className="text-primary font-semibold"
                    onClick={onToggleTrackingPanel}
                  >
                    {trackingPanelOpen
                      ? t('ClientStock.receptionForm.trackingHide')
                      : t('ClientStock.receptionForm.trackingManage')}
                  </button>
                )}
              </div>
              {trackingPanelOpen && trackingList.length > 0 && (
                <div className="mt-1 border rounded-md bg-white shadow-inner max-h-16 overflow-y-auto w-full">
                  {trackingList.map((value, idx) => (
                    <div
                      key={`${value}-${idx}`}
                      className="flex items-center justify-between px-2 py-1 text-xs"
                    >
                      <span className="truncate">{value}</span>
                      <button
                        type="button"
                        className="text-red-500 text-[11px] hover:underline"
                        onClick={() => onTrackingRemove(idx)}
                      >
                        {t('ClientStock.drawer.remove')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>
        </div>
      )}

     {showFbaControls && (
        <div className="w-full flex flex-col gap-2">
          <div className="flex flex-col gap-2 border rounded-lg bg-white/70 p-3">
            <div className="flex flex-wrap items-center gap-3 text-[13px] sm:text-sm text-text-primary">
              {['none', 'full', 'partial'].map((mode) => (
                <label key={mode} className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="fba-mode"
                    value={mode}
                    checked={(receptionForm.fbaMode || 'none') === mode}
                    onChange={() => onReceptionFbaModeChange?.(mode)}
                  />
                  {mode === 'none'
                    ? t('fba_mode_none') || 'Do not send now'
                    : mode === 'full'
                    ? t('fba_mode_full') || 'Send all units to Amazon'
                    : t('fba_mode_partial') || 'Partial shipment'}
                </label>
              ))}
            </div>

            {receptionForm.fbaMode === 'partial' && (
              <div className="mt-2 border rounded-md bg-white max-h-40 overflow-y-auto divide-y">
                {selectedRows.length === 0 ? (
                  <p className="text-xs text-text-secondary px-3 py-2">
                    {t('fba_mode_hint') || 'Adjust quantities to send to Amazon.'}
                  </p>
                ) : (
                  <>
                    <div className="px-3 py-2 grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.6fr)_minmax(0,0.7fr)] text-[11px] font-semibold uppercase tracking-wide border-b bg-gray-50">
                      <span className="text-text-secondary">{t('th_name') || 'Product'}</span>
                      <span className="text-text-secondary text-right">
                        {t('fba_units_announced') || 'Units to send'}
                      </span>
                      <span className="text-text-secondary text-right">
                        {t('fba_units_to_amazon') || 'Units to Amazon'}
                      </span>
                    </div>
                    {selectedRows.map((row) => {
                      const edit = rowEdits[row.id] || {};
                      const units = Math.max(0, Number(edit.units_to_send || 0));
                      const fba = Math.max(0, Math.min(units, Number(edit.fba_units || 0)));
                      return (
                        <div
                          key={row.id}
                          className="px-3 py-2 grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.6fr)_minmax(0,0.7fr)] items-center gap-2"
                        >
                          <span className="truncate text-sm text-text-primary" title={row.name || row.asin || row.sku}>
                            {row.name || row.asin || row.sku || row.ean || 'Item'}
                          </span>
                          <span className="text-right text-sm font-semibold text-text-secondary">{units}</span>
                          <input
                            type="number"
                            min={0}
                            max={units}
                            className="w-24 text-right border rounded px-2 py-1 text-sm"
                            value={fba}
                            onChange={(e) => updateEdit(row.id, { fba_units: e.target.value })}
                          />
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showReturnFields && (
        <div className="w-full flex flex-col gap-3 border rounded-lg bg-white/70 p-3">
          {returnError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {returnError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border rounded-lg p-3 bg-white">
              <div className="text-sm font-semibold">
                {insideLabel}
              </div>
              <div className="text-xs text-text-secondary mb-2">
                {uploadHint}
              </div>
              <input
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                onChange={(e) => onReturnFilesUpload?.('inside', e.target.files)}
                className="text-sm"
              />
              <div className="mt-2 space-y-1 text-xs">
                {returnInsideFiles.length === 0 && <div className="text-text-secondary">—</div>}
                {returnInsideFiles.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="text-text-primary break-all">
                    {f.name || f.url}
                  </div>
                ))}
              </div>
            </div>
            <div className="border rounded-lg p-3 bg-white">
              <div className="text-sm font-semibold">
                {labelDocsLabel}
              </div>
              <div className="text-xs text-text-secondary mb-2">
                {uploadHint}
              </div>
              <input
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                onChange={(e) => onReturnFilesUpload?.('label', e.target.files)}
                className="text-sm"
              />
              <div className="mt-2 space-y-1 text-xs">
                {returnLabelFiles.length === 0 && <div className="text-text-secondary">—</div>}
                {returnLabelFiles.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="text-text-primary break-all">
                    {f.name || f.url}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="border rounded-lg p-3 bg-white">
            <div className="text-sm font-semibold">
              {notesLabel}
            </div>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm min-h-[70px]"
              value={returnNotes}
              onChange={(e) => onReturnNotesChange?.(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col items-center sm:flex-row sm:justify-center gap-3 w-full">
        <div className="flex flex-col gap-2 w-full sm:flex-row sm:items-center sm:justify-center sm:gap-3">
          <button
            onClick={() => {
              if (submitType === 'prep') openPrep();
              else if (submitType === 'reception') openReception();
              else if (submitType === 'return') onReturnSubmit?.();
              else if (submitType === 'delete') onDelete?.();
            }}
            disabled={submitType === 'delete' ? deleteInProgress : false}
            className={`${
              submitType === 'delete'
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-500 hover:bg-blue-600'
            } text-white text-sm px-6 py-2 rounded-md w-full sm:w-auto text-center disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {submitType === 'prep'
              ? t('ClientStock.cta.sendToPrep')
              : submitType === 'reception'
              ? t('ClientStock.cta.announceReception')
              : submitType === 'return'
              ? returnLabel
              : t('ClientStock.cta.deleteListing')}
          </button>
          {showDestinationNearPrep && renderDestinationSelector('w-full sm:w-[190px] sm:min-w-[170px]')}
        </div>
        <button onClick={clearSelection} className="text-sm text-gray-500 hover:text-gray-700">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};

export default ClientStockSelectionBar;

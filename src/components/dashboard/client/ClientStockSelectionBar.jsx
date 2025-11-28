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
  onReceptionFbaModeChange,
  selectedRows,
  rowEdits,
  updateEdit,
  openPrep,
  openReception,
  clearSelection
  , onDelete,
  deleteInProgress
}) => {
  if (!selectedIds?.size) return null;

  const destinationLabel = t('ClientStock.receptionForm.countryTag') || 'Country';
  const showReceptionFields = submitType === 'reception';
  const showCarrierOther = receptionForm.carrier === 'OTHER';
  const trackingSummary =
    trackingList.length > 0
      ? t('ClientStock.receptionForm.trackingCount', {
          count: trackingList.length
        })
      : t('ClientStock.receptionForm.trackingNone');
  const normalizedDestinationCountries = Array.isArray(destinationCountries)
    ? destinationCountries
    : [];
  const showDestinationNearPrep = submitType === 'prep';

  const renderDestinationSelector = (className = 'w-full sm:max-w-[140px]') => (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[10px] uppercase text-text-light">{destinationLabel}</span>
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
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-white shadow-md border border-gray-200 rounded-[48px] px-6 py-3 flex flex-col gap-3 items-center backdrop-blur-md bg-white/95 w-[min(95vw,640px)] max-w-full sm:px-8">
      <div className="flex flex-col items-center gap-3 w-full">
        <select
          value={submitType}
          onChange={(e) => setSubmitType(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm min-w-[220px] text-center"
        >
          <option value="prep">{t('ClientStock.cta.sendToPrep')}</option>
          <option value="reception">{t('ClientStock.cta.announceReception')}</option>
          <option value="delete">{t('ClientStock.cta.deleteListing')}</option>
        </select>

        {showReceptionFields && (
          <div className="w-full flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            {renderDestinationSelector()}
            <div className="flex flex-col flex-1 min-w-[200px] gap-3">
              <div>
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
              </div>

              <div className="flex flex-col flex-[1.2] min-w-[220px]">
                <span className="text-[10px] text-gray-500 font-semibold">
                  {t('ClientStock.receptionForm.tracking')}
                </span>
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
                  <span>{trackingSummary}</span>
                  {trackingList.length > 1 && (
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

        {showReceptionFields && (
          <div className="flex flex-col gap-1 w-full sm:max-w-3xl">
            <span className="font-semibold text-text-secondary">
              {t('ClientStock.receptionFba.title')}
            </span>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="reception-fba-mode"
                  value="none"
                  checked={receptionForm.fbaMode === 'none'}
                  onChange={() => onReceptionFbaModeChange('none')}
                />
                {t('ClientStock.receptionFba.none')}
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="reception-fba-mode"
                  value="full"
                  checked={receptionForm.fbaMode === 'full'}
                  onChange={() => onReceptionFbaModeChange('full')}
                />
                {t('ClientStock.receptionFba.full')}
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="reception-fba-mode"
                  value="partial"
                  checked={receptionForm.fbaMode === 'partial'}
                  onChange={() => onReceptionFbaModeChange('partial')}
                />
                {t('ClientStock.receptionFba.partial')}
              </label>
            </div>
            {receptionForm.fbaMode === 'partial' && (
              <div className="mt-2">
                <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.4fr)_0.8fr_0.8fr] text-[11px] uppercase tracking-wide text-gray-500 px-2 mb-1">
                  <span />
                  <span>{tp('ClientStock.receptionFba.availableLabel')}</span>
                  <span className="text-right">{t('ClientStock.receptionFba.toAmazonLabel')}</span>
                </div>
                <div className="border rounded-md p-2 bg-white max-h-64 overflow-y-auto">
                  {selectedRows.length === 0 ? (
                    <p className="text-text-secondary">
                      {t('ClientStock.receptionFba.noSelection')}
                    </p>
                  ) : (
                    <>
                      {selectedRows.map((row) => {
                        const edits = rowEdits[row.id] || {};
                        const units = Math.max(0, Number(edits.units_to_send || 0));
                        const image = row.image_url || row.photo_url || '';
                        const asin = row.asin || '';
                        const rawFba = edits.fba_units;
                        const displayFba =
                          rawFba === undefined || rawFba === null || rawFba === ''
                            ? units
                            : rawFba;
                        return (
                          <div key={row.id} className="py-2 border-b last:border-b-0">
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_0.8fr_0.8fr] sm:items-center">
                              <div className="flex items-start gap-3">
                                {image ? (
                                  <img
                                    src={image}
                                    alt={row.name || row.asin || 'Product'}
                                    className="w-10 h-10 rounded border object-cover"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded border bg-gray-100 flex items-center justify-center text-[10px] text-gray-400">
                                    N/A
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-text-primary truncate">
                                    {row.name || row.asin || row.ean || '—'}
                                  </p>
                                  {asin && (
                                    <p className="text-[11px] text-gray-500 font-mono truncate">
                                      ASIN: {asin}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col text-xs sm:text-sm">
                                <span className="sm:hidden text-[10px] uppercase tracking-wide text-gray-500">
                                  {tp('ClientStock.receptionFba.availableLabel')}
                                </span>
                                <span className="text-base font-semibold text-text-primary">
                                  {units}
                                </span>
                              </div>
                              <div className="flex flex-col items-start sm:items-end gap-1 text-xs sm:text-sm">
                                <span className="sm:hidden text-[10px] uppercase tracking-wide text-gray-500">
                                  {t('ClientStock.receptionFba.toAmazonLabel')}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  className="w-20 text-right border rounded px-2 py-1"
                                  value={displayFba}
                                  onChange={(e) =>
                                    updateEdit(row.id, { fba_units: e.target.value })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col items-center sm:flex-row sm:justify-center gap-3 w-full">
          <div className="flex flex-col gap-2 w-full sm:flex-row sm:items-center sm:justify-center sm:gap-3">
            <button
              onClick={() => {
                if (submitType === 'prep') openPrep();
                else if (submitType === 'reception') openReception();
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
                : t('ClientStock.cta.deleteListing')}
            </button>
            {showDestinationNearPrep && renderDestinationSelector('w-full sm:w-[190px] sm:min-w-[170px]')}
          </div>
          <button onClick={clearSelection} className="text-sm text-gray-500 hover:text-gray-700">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientStockSelectionBar;

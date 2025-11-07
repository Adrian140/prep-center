import React, { useState, useEffect } from 'react';
import { supabaseHelpers } from '../config/supabase';
import { Package, CheckCircle, Calculator, Download, Gift, Truck, Star } from 'lucide-react';
import { useServicesTranslation } from '../translations/services';
import { useLanguage } from '../contexts/LanguageContext';

function ServicesPricing() {
  const { currentLanguage } = useLanguage();
  const { t } = useServicesTranslation(currentLanguage);
  const [country, setCountry] = useState("DE");
  const [pricing, setPricing] = useState({});
  const [content, setContent] = useState({});
  const [quantity, setQuantity] = useState(100);
  const [fbmOrders, setFbmOrders] = useState(50);
  const [storagePallets, setStoragePallets] = useState(1);
  const [polybaggingUnits, setPolybaggingUnits] = useState(0);
  const [multipacks, setMultipacks] = useState(0);
  const [insertMaterials, setInsertMaterials] = useState(0);
  const [storageVolume, setStorageVolume] = useState(0);
  const [additionalLabelsClient, setAdditionalLabelsClient] = useState(0);
  const [additionalLabelsTranslation, setAdditionalLabelsTranslation] = useState(0);
  const [otherLabels, setOtherLabels] = useState(0);
  const [shippingCartons, setShippingCartons] = useState(0);
  const [plFnskuLabelingUnits, setPlFnskuLabelingUnits] = useState(0);
  const [plPolybaggingUnits, setPlPolybaggingUnits] = useState(0);
  const [plMultipackUnits, setPlMultipackUnits] = useState(0);
  const [selectedServices, setSelectedServices] = useState({
    labeling: true,
    fbmShipping: false,
    storage: false,
    polybagging: false,
    multipack: false,
    insertMaterials: false,
    additionalStorage: false,
    shippingCartons: false,
    fbmEbay: false,
    fbmShopify: false,
    plFnskuLabeling: false,
    plPolybagging: false,
    plMultipack: false,
    additionalLabelsClient: false,
    additionalLabelsTranslation: false,
    otherLabels: false
  });

  useEffect(() => {
    const fetchData = async () => {
      const [pricingRes, contentRes] = await Promise.all([
        supabaseHelpers.getPricing(),
        supabaseHelpers.getContent()
      ]);

      if (pricingRes.error) console.error('Error fetching pricing:', pricingRes.error);
      else setPricing(pricingRes.data || {});

      if (contentRes.error) console.error('Error fetching content:', contentRes.error);
      else setContent(contentRes.data || {});
    };

    fetchData();
  }, []);
 
  const parseFloatValue = (str) => {
    if (typeof str !== 'string') return 0;
    return parseFloat(str.replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
  };

  const calculateTotal = () => {
    let total = 0;
    
    // FNSKU Labeling (Standard FBA Services)
    if (selectedServices.labeling && pricing.standard_rate) {
      total += quantity * parseFloatValue(pricing.standard_rate);
    }

    // Private Label Partnership
    if (selectedServices.plFnskuLabeling && pricing.pl_fnsku_labeling) {
      total += plFnskuLabelingUnits * parseFloatValue(pricing.pl_fnsku_labeling);
    }
    if (selectedServices.plPolybagging && pricing.pl_polybagging) {
      total += plPolybaggingUnits * parseFloatValue(pricing.pl_polybagging);
    }
    if (selectedServices.plMultipack && pricing.pl_multipack) {
      total += plMultipackUnits * parseFloatValue(pricing.pl_multipack);
    }

    // Multi-Platform FBM
    if (selectedServices.fbmShipping) {
      let fbmRate = 0;
      if (fbmOrders >= 0 && fbmOrders <= 999 && pricing.starter_price) {
        fbmRate = parseFloatValue(pricing.starter_price);
      } else if (fbmOrders >= 1000 && fbmOrders <= 1999 && pricing.growth_price) {
        fbmRate = parseFloatValue(pricing.growth_price);
      } else if (fbmOrders >= 2000 && pricing.enterprise_price) {
        fbmRate = parseFloatValue(pricing.enterprise_price);
      }
      total += fbmOrders * fbmRate;

      if (selectedServices.fbmEbay && pricing.fbm_ebay) {
        total += fbmOrders * parseFloatValue(pricing.fbm_ebay);
      }
      if (selectedServices.fbmShopify && pricing.fbm_shopify) {
        total += fbmOrders * parseFloatValue(pricing.fbm_shopify);
      }
    }

    // Additional Labels
    if (selectedServices.additionalLabelsClient && pricing.labels_client) {
      total += additionalLabelsClient * parseFloatValue(pricing.labels_client);
    }
    if (selectedServices.additionalLabelsTranslation && pricing.labels_translation) {
      total += additionalLabelsTranslation * (parseFloatValue(pricing.labels_translation) + 0.20); // Assuming 0.20 is per unit application fee
    }

    // Storage (Pallet)
    if (selectedServices.storage && pricing.pallet_storage_price) {
      total += storagePallets * parseFloatValue(pricing.pallet_storage_price);
    }

    // Polybagging & Sealing (from general services, if not covered by PL)
    if (selectedServices.polybagging && !selectedServices.plPolybagging) {
      total += polybaggingUnits * 0.30; // Assuming a default rate if not in pricing table
    }

    // Multipack / Bundling (from general services, if not covered by PL)
    if (selectedServices.multipack && !selectedServices.plMultipack) {
      total += multipacks * 0.50; // Assuming a default rate if not in pricing table
    }

    // Insert Materials
    if (selectedServices.insertMaterials) {
      total += insertMaterials * 0.15; // Assuming a default rate if not in pricing table
    }

    // Additional Storage
    if (selectedServices.additionalStorage) {
      total += storageVolume * 15; // Assuming a default rate if not in pricing table
    }

    // Other Labels
    if (selectedServices.otherLabels) {
      total += otherLabels * 0.10; // Assuming a default rate if not in pricing table
    }

    // Shipping Cartons
    if (selectedServices.shippingCartons) {
      total += shippingCartons * 3.00; // Assuming a default rate if not in pricing table
    }

    return total.toFixed(2);
  };

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header with 5 stars */}
        <div className="flex justify-center mb-4">
          <Star className="w-8 h-8 text-yellow-400 fill-current" />
          <Star className="w-8 h-8 text-yellow-400 fill-current" />
          <Star className="w-8 h-8 text-yellow-400 fill-current" />
          <Star className="w-8 h-8 text-yellow-400 fill-current" />
          <Star className="w-8 h-8 text-yellow-400 fill-current" />
        </div>
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
            {content.services_title || t('pageTitle')}
          </h1>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            {content.services_subtitle || t('pageSubtitle')}
          </p>
        </div>

        {/* New Customer Bonus Banner */}
        <section className="mb-16">
          <div className="bg-gradient-to-r from-accent to-accent-dark rounded-xl p-6 text-center">
            <div className="flex items-center justify-center mb-4">
              <Gift className="w-8 h-8 text-white mr-3" />
              <h2 className="text-2xl font-bold text-white">{content.bonus_title || t('newCustomerBonus')}</h2>
            </div>
            <p className="text-white text-lg mb-4">
              {content.bonus_subtitle1?.replace('{new_customer_rate}', pricing.new_customer_rate || '€0.45').replace('{standard_rate}', pricing.standard_rate || '€0.50') || t('bonusFirstMonths').replace('{new_customer_rate}', pricing.new_customer_rate || '€0.45').replace('{standard_rate}', pricing.standard_rate || '€0.50')}
            </p>
            <p className="text-orange-100 text-sm">
              {content.bonus_subtitle2 || t('bonusFreelabels')}
            </p>
          </div>
        </section>

        {/* Standard FBA Services */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              {content.standard_fba_title || t('standardFbaTitle')}
            </h2>
            <p className="text-text-secondary">
              {content.standard_fba_subtitle || t('standardFbaSubtitle')}
            </p>
          </div>
          <div className="bg-white rounded-xl border-2 border-primary p-8 mb-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl font-bold text-text-primary mb-4">
                  {t('fnskuLabelingService')} – {pricing.standard_rate || '€0.50'} {t('perProduct')}
                </h3>
                <p className="text-sm text-text-secondary mb-4">{t('includedInRate')}</p>
                <div className="space-y-3 mb-6">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                    <span className="text-text-secondary">{content.fba_reception || t('receptionInspection')}</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                    <span className="text-text-secondary">{content.fba_polybagging || t('professionalPolybagging')}</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                    <span className="text-text-secondary">{content.fba_labeling || t('fnskuLabeling')}</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                    <span className="text-text-secondary">{content.fba_dunnage || t('dunnageProtection')}</span>
                  </div>
                </div>
              </div>
              <div className="text-center lg:text-right">
                <div className="bg-gray-50 rounded-xl p-6">
                  <p className="text-sm text-text-secondary mb-2">{content.fba_rate_label || t('standardRate')}</p>
                  <p className="text-4xl font-bold text-primary mb-2">{pricing.standard_rate || '€0.50'}</p>
                  <p className="text-text-secondary mb-4">{content.fba_unit_label || t('perProduct')}</p>
                  <div className="bg-accent text-white px-4 py-2 rounded-lg inline-block">
                    <p className="text-sm font-medium">{content.fba_new_customer_label?.replace('{new_customer_rate}', pricing.new_customer_rate || '€0.45') || t('newCustomers').replace('{new_customer_rate}', pricing.new_customer_rate || '€0.45')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Private Label & Multi-Platform Services */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              {content.private_label_title || t('privateLabelTitle')}
            </h2>
            <p className="text-text-secondary">
              {content.private_label_subtitle || t('privateLabelSubtitle')}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Private Label Partnership */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xl font-semibold text-text-primary mb-4">
                {content.pl_partnership_title || t('privateLabelPartnership')}
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">FNSKU Labeling</span>
                  <span className="font-medium text-primary">{pricing.pl_fnsku_labeling || '€0.35'} / unit</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Polybagging & Sealing</span>
                  <span className="font-medium text-primary">{pricing.pl_polybagging || '€0.15'} / unit</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Multipack / Bundling (polybag included)</span>
                  <span className="font-medium text-primary">{pricing.pl_multipack || '€0.50'} / set</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Quality Check (visual inspection)</span>
                  <span className="font-medium text-green-600">Free</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Protective Dunnage (void fill)</span>
                  <span className="font-medium text-green-600">Included</span>
                </div>
              </div>
            </div>

            {/* Multi-Platform FBM */}
<div className="bg-white rounded-xl border border-gray-200 p-6">
  <h3 className="text-xl font-semibold text-text-primary mb-4">
    {content.fbm_title || t('multiPlatformFbm')}
  </h3>

  <div className="space-y-3">
    {/* Amazon */}
    <div className="flex justify-between items-center">
      <span className="text-text-secondary">
        {content.fbm_amazon_label || t('amazonFbmOrders')}
      </span>
      <span className="font-medium text-primary">
        {pricing.fbm_amazon || '€1.40'} {t('cartonsIncluded')}
      </span>
    </div>

    {/* eBay */}
    <div className="flex justify-between items-center">
      <span className="text-text-secondary">
        {content.fbm_ebay_label || t('ebayIntegration')}
      </span>
      <span className="font-medium text-primary">
        {pricing.fbm_ebay || '€1.40'} {t('cartonsIncluded')}
      </span>
    </div>

    {/* Shopify / Website */}
    <div className="flex justify-between items-center">
      <span className="text-text-secondary">
        {content.fbm_shopify_label || t('shopifyWebsiteOrders')}
      </span>
      <span className="font-medium text-primary">
        {pricing.fbm_shopify || '€1.40'} {t('cartonsIncluded')}
      </span>
    </div>

    {/* Vinted */}
    <div className="flex justify-between items-center">
      <span className="text-text-secondary">
        {content.fbm_vinted_label || 'Vinted orders'}
      </span>
      <span className="font-medium text-primary">
        {pricing.fbm_vinted || '€1.45'} {t('cartonsIncluded')}
      </span>
    </div>

    {/* Integrare transport */}
    <div className="flex justify-between items-center">
      <span className="text-text-secondary">
        {content.fbm_packlink_label || t('shippingViaPacklink')}
      </span>
      <span className="font-medium text-primary">
        {content.fbm_packlink_value || t('automaticDataIntegration')}
      </span>
    </div>
  </div>

  {/* Nota despre alte platforme */}
  <p className="mt-4 text-sm text-text-secondary italic">
    Upon request, we can also collaborate on other platforms (e.g., Etsy, Cdiscount, Kaufland, Allegro, etc.), as long as the process is similar (order export via CSV/API, label generation, pick & pack, shipping). Tell us what you use and we’ll quickly assess the integration.
  </p>
</div>

          </div>
        </section>

            {/* Extra Services */}
        <section className="mb-16">
          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-md">
            <h2 className="text-3xl font-bold text-text-primary mb-8 text-center">Extra Services</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Insert Materials */}
              <div className="bg-gray-50 rounded-lg p-6 hover:shadow-md transition">
                <h3 className="text-lg font-semibold text-text-primary mb-2">Insert Materials</h3>
                <p className="text-primary font-medium mb-1">{t('customPricing')}</p>
                <p className="text-sm text-text-secondary">
                  Flyers, manuals, QR codes, transparency codes, warnings
                </p>
              </div>
          
              {/* Additional Labels */}
              <div className="bg-gray-50 rounded-lg p-6 hover:shadow-md transition">
                <h3 className="text-lg font-semibold text-text-primary mb-2">Additional Labels</h3>
                <ul className="text-sm text-text-secondary space-y-2">
                  <li>
                    <span className="font-medium text-primary">{pricing.labels_client || '€0.20'} / unit</span> – client provides translation
                  </li>
                  <li>
                    <span className="font-medium text-primary">{pricing.labels_translation || '€5.00'} + €0.20 / unit</span> – we provide translation & application
                  </li>
                </ul>
              </div>

              {/* Bubble Wrap */}
              <div className="bg-gray-50 rounded-lg p-6 hover:shadow-md transition">
                <h3 className="text-lg font-semibold text-text-primary mb-2">Bubble Wrap</h3>
                <p className="text-primary font-medium mb-1">€0.20 / unit</p>
                <p className="text-sm text-text-secondary">
                  Protective bubble wrap for fragile items
                </p>
              </div>
            </div>
          </div>
        </section>

           {/* Cele 3 oferte */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <h3 className="text-lg font-semibold text-text-primary mb-2">{t('starter')}</h3>
              <p className="text-text-secondary mb-4">{content.fbm_starter_tier || t('unitsPerMonth0999')}</p>
              <p className="text-3xl font-bold text-primary mb-2">{pricing.starter_price || '€1.45'}</p>
              <p className="text-sm text-text-secondary">{content.fbm_order_unit || t('perOrder')}</p>
            </div>
            <div className="bg-white rounded-xl border-2 border-primary p-6 text-center relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-primary text-white px-3 py-1 rounded-full text-xs font-medium">{t('popular')}</span>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">{t('growth')}</h3>
              <p className="text-text-secondary mb-4">{content.fbm_growth_tier || t('unitsPerMonth1000')}</p>
              <p className="text-3xl font-bold text-primary mb-2">{pricing.growth_price || '€1.25'}</p>
              <p className="text-sm text-text-secondary">{content.fbm_order_unit || t('perOrder')}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <h3 className="text-lg font-semibold text-text-primary mb-2">{t('enterprise')}</h3>
              <p className="text-text-secondary mb-4">{content.fbm_enterprise_tier || t('unitsPerMonth2000')}</p>
              <p className="text-3xl font-bold text-primary mb-2">{pricing.enterprise_price || '€1.15'}</p>
              <p className="text-sm text-text-secondary">{content.fbm_order_unit || t('perOrder')}</p>
            </div>
          </div>

        {/* FBM Package Shipping Rates */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-text-primary mb-12 text-center">
            FBM Package Shipping Rates
          </h2>
          <div className="max-w-5xl mx-auto">
            <h3 className="text-xl font-semibold text-text-primary mb-6 text-center">
              Domestic Shipping – France
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="border border-gray-200 px-4 py-2">Transporter</th>
                    <th className="border border-gray-200 px-4 py-2">0.25 kg</th>
                    <th className="border border-gray-200 px-4 py-2">0.5 kg</th>
                    <th className="border border-gray-200 px-4 py-2">1 kg</th>
                    <th className="border border-gray-200 px-4 py-2">20 kg Max (60×40×40)</th>
                    <th className="border border-gray-200 px-4 py-2">Info</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Colissimo */}
                  <tr className="hover:opacity-90 transition-colors" style={{ backgroundColor: '#FFF3E0' }}>
                    <td className="border border-gray-200 px-4 py-2 font-medium text-[#FF6F00]">Colissimo</td>
                    <td className="border border-gray-200 px-4 py-2 text-center">€5.25</td>
                    <td className="border border-gray-200 px-4 py-2 text-center">€7.35</td>
                    <td className="border border-gray-200 px-4 py-2 text-center">€9.40</td>
                    <td className="border border-gray-200 px-4 py-2 text-center">—</td>
                    <td className="border border-gray-200 px-4 py-2 text-center text-sm text-text-light">24/48h</td>
                  </tr>

                  {/* Colis Privé */}
                  <tr className="hover:opacity-90 transition-colors" style={{ backgroundColor: '#E3F2FD' }}>
                    <td className="border border-gray-200 px-4 py-2 font-medium text-[#0072CE]">Colis Privé</td>
                    <td className="border border-gray-200 px-4 py-2 text-center">€4.37</td>
                    <td className="border border-gray-200 px-4 py-2 text-center">€4.94</td>
                    <td className="border border-gray-200 px-4 py-2 text-center">€6.35</td>
                    <td className="border border-gray-200 px-4 py-2 text-center">—</td>
                    <td className="border border-gray-200 px-4 py-2 text-center text-sm text-text-light">3/5 Days</td>
                  </tr>

                  {/* UPS */}
                  <tr className="hover:opacity-90 transition-colors" style={{ backgroundColor: '#EFEBE9' }}>
                    <td className="border border-gray-200 px-4 py-2 font-medium text-[#5E3A1C]">UPS</td>
                    <td className="border border-gray-200 px-4 py-2 text-center">€7.05</td>
                    <td className="border border-gray-200 px-4 py-2 text-center">€7.05</td>
                    <td className="border border-gray-200 px-4 py-2 text-center">€7.55</td>
                    <td className="border border-gray-200 px-4 py-2 text-center">€12.40</td>
                    <td className="border border-gray-200 px-4 py-2 text-center text-sm text-text-light">24/48h</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-sm text-text-light mt-6 text-center">
              These prices are indicative and may not always be updated in real time. For exact shipping rates, please contact us.
            </p>
          </div>
        </section>

        {/* FBM International Shipping Rates */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-text-primary mb-12 text-center">
            FBM International Shipping Rates
          </h2>
          <div className="max-w-5xl mx-auto">
            <div className="flex justify-center mb-6">
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="px-4 py-2 border rounded-lg text-text-primary"
              >
                <option value="DE">Germany/Austria</option>
                <option value="IT">Italy</option>
                <option value="ES">Spain</option>
                <option value="BE">Belgium</option>
                <option value="UK">United Kingdom</option>
              </select>
            </div>

            {/* Germany */}
            {country === "DE" && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-gray-100 text-left">
                      <th className="border border-gray-200 px-4 py-2">Transporter</th>
                      <th className="border border-gray-200 px-4 py-2">0.5 kg</th>
                      <th className="border border-gray-200 px-4 py-2">1 kg</th>
                      <th className="border border-gray-200 px-4 py-2">10 kg</th>
                      <th className="border border-gray-200 px-4 py-2">20 kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ backgroundColor: '#FFF8E1' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#FF9800]">Mondial Relay</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">€7.44</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">€7.66</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">€15.75</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">€20.83</td>
                    </tr>
                    <tr style={{ backgroundColor: '#EFEBE9' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#5E3A1C]">UPS</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">€9.40</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">€10.00</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">€17.00</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">€30.00</td>
                    </tr>
                    <tr style={{ backgroundColor: '#E8EAF6' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#3F51B5]">Chronopost</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">€11.79</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">€11.79</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">—</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Italy */}
            {country === "IT" && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-gray-100 text-left">
                      <th className="border border-gray-200 px-4 py-2">Transporter</th>
                      <th className="border border-gray-200 px-4 py-2">0.5 kg</th>
                      <th className="border border-gray-200 px-4 py-2">1 kg</th>
                      <th className="border border-gray-200 px-4 py-2">10 kg</th>
                      <th className="border border-gray-200 px-4 py-2">20 kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ backgroundColor: '#FFF8E1' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#FF9800]">Mondial Relay</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">8.97</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">9.34</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">16.75</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">29.37</td>
                    </tr>
                    <tr style={{ backgroundColor: '#EFEBE9' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#5E3A1C]">UPS</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">9.40</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">10.00</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">30.00</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">30</td>
                    </tr>
                    <tr style={{ backgroundColor: '#E8EAF6' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#3F51B5]">Chronopost</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">12.40</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">12.40</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">22.74</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">34.23</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}


            {/* Spain */}
            {country === "ES" && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-gray-100 text-left">
                      <th className="border border-gray-200 px-4 py-2">Transporter</th>
                      <th className="border border-gray-200 px-4 py-2">0.5 kg</th>
                      <th className="border border-gray-200 px-4 py-2">1 kg</th>
                      <th className="border border-gray-200 px-4 py-2">10 kg</th>
                      <th className="border border-gray-200 px-4 py-2">20 kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ backgroundColor: '#FFF8E1' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#FF9800]">Mondial Relay</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">8.85</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">9.11</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">16.20</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">29.54</td>
                    </tr>
                    <tr style={{ backgroundColor: '#EFEBE9' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#5E3A1C]">UPS</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">9.40</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">10.00</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">30.00</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">30.00</td>
                    </tr>
                    <tr style={{ backgroundColor: '#E8EAF6' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#3F51B5]">Chronopost</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">12.40</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">12.40</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">22.74</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">34.23</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}


            {/* Belgium */}
            {country === "BE" && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-gray-100 text-left">
                      <th className="border border-gray-200 px-4 py-2">Transporter</th>
                      <th className="border border-gray-200 px-4 py-2">0.5 kg</th>
                      <th className="border border-gray-200 px-4 py-2">1 kg</th>
                      <th className="border border-gray-200 px-4 py-2">10 kg</th>
                      <th className="border border-gray-200 px-4 py-2">20 kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ backgroundColor: '#FFF8E1' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#FF9800]">Mondial Relay</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">7.44</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">7.66</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">15.75</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">20.83</td>
                    </tr>
                    <tr style={{ backgroundColor: '#EFEBE9' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#5E3A1C]">UPS</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">9.40</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">17.00</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">22.00</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">30.00</td>
                    </tr>
                    <tr style={{ backgroundColor: '#E8EAF6' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#3F51B5]">Chronopost</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">11.79</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">11.79</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">20.87</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">30.96</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {/* United Kingdom */}
            {country === "UK" && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-gray-100 text-left">
                      <th className="border border-gray-200 px-4 py-2">Transporter</th>
                      <th className="border border-gray-200 px-4 py-2">0.5 kg</th>
                      <th className="border border-gray-200 px-4 py-2">1 kg</th>
                      <th className="border border-gray-200 px-4 py-2">2 kg</th>
                      <th className="border border-gray-200 px-4 py-2">5 kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ backgroundColor: '#EFEBE9' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#5E3A1C]">UPS</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">15.10</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">15.80</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">18.80</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">20.00</td>
                    </tr>
                    <tr style={{ backgroundColor: '#EFEBE9' }}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-[#5E3A1C]">FedEx</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">-</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">-</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">-</td>
                      <td className="border border-gray-200 px-4 py-2 text-center">19.10</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}


            <p className="text-sm text-text-light mt-6 text-center">
              These international shipping prices are indicative and may not always be updated in real time. For exact rates, please contact us.
            </p>
          </div>
        </section>





        {/* Storage */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <Package className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              {t('storageSolutions')}
            </h2>
            <p className="text-text-secondary">
              {t('storageSubtitle')}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xl font-semibold text-text-primary mb-4">{t('warehouseStorage')}</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">{t('storageIncluded')}</span>
                  <span className="font-medium text-green-600">{t('free')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">{t('additionalStorage')}</span>
                  <span className="font-medium text-primary">15 € {t('perCubicMeterMonth')}</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xl font-semibold text-text-primary mb-4">{t('specializedStorage')}</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">{t('oversizedProducts')}</span>
                  <span className="font-medium text-primary">{t('customPricing')}</span>
                </div>
                <p className="text-xs text-text-light">{t('oversizedNote')}</p>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">{t('fragileItemsHandling')}</span>
                  <span className="font-medium text-primary">{t('customPricing')}</span>
                </div>
                <p className="text-xs text-text-light">{t('fragileNote')}</p>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">{t('hazardousMaterials')}</span>
                  <span className="font-medium text-primary">{t('customPricing')}</span>
                </div>
                <p className="text-xs text-text-light">{t('hazardousNote')}</p>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">{t('highValueItems')}</span>
                  <span className="font-medium text-primary">{t('customPricing')}</span>
                </div>
                <p className="text-xs text-text-light">{t('highValueNote')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Inspection & Quality Control */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <CheckCircle className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              {t('inspectionTitle')}
            </h2>
          </div>
          
          <div className="bg-white rounded-xl border-2 border-primary p-8">
            <div className="space-y-6">
              <p className="text-text-secondary leading-relaxed mb-4">
                {t('inspectionDescription1')}
              </p>
              <p className="text-text-secondary leading-relaxed">
                {t('inspectionDescription2')}
              </p>
              <p className="text-text-secondary leading-relaxed">
                {t('inspectionDescription3')}
              </p>
            </div>
          </div>
        </section>
        {/* FBM Shipping Rates */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <Truck className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              {content.fbm_shipping_title || t('fbmShippingTitle')}
            </h2>
            <p className="text-text-secondary">
              {content.fbm_shipping_subtitle || t('fbmShippingSubtitle')}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-12">
            <h3 className="text-xl font-semibold text-text-primary mb-4">{t('fbmMultiPlatformTitle')}</h3>
            <p className="text-text-secondary leading-relaxed mb-4">
              {t('fbmDescription1')}
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-2">
              <li><strong>{t('Storage').split(' – ')[0]}</strong> – {t('Storage').split(' – ')[1] || 'Secure storage and transparent real-time stock control.'}</li>
              <li><strong>{t('Order Processing').split(' – ')[0]}</strong> – {t('Order Processing').split(' – ')[1] || 'Fast picking and professional packing.'}</li>
              <li><strong>{t('Dispatch 24h').split(' – ')[0]}</strong> – {t('Dispatch 24h').split(' – ')[1] || 'All orders are shipped within 24 hours.'}</li>
              <li><strong>{t('SameDayShipping').split(' – ')[0]}</strong> – {t('SameDayShipping').split(' – ')[1] || 'Orders placed before 12:00 are shipped the same day.'}</li>
              <li><strong>{t('Returns Support').split(' – ')[0]}</strong> – {t('Returns Support').split(' – ')[1] || 'Efficient processing and quick reintegration of returned items.'}</li>
            </ul>
            <p className="text-text-secondary leading-relaxed mt-4">
              {t('fbmDescription2')}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default ServicesPricing;
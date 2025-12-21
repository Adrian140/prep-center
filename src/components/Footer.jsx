import React, { useState, useEffect } from 'react';
import { Mail, Phone, MapPin } from 'lucide-react';
import { supabaseHelpers } from '../config/supabase';

function Footer() {
  const [content, setContent] = useState({});
  const withFallback = (value, fallback) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : fallback;
    }
    return fallback;
  };

  const withSafeSubtitle = (value, fallback) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && !/(amazon|fba|fbm)/i.test(trimmed)) return trimmed;
    }
    return fallback;
  };

  useEffect(() => {
    const fetchContent = async () => {
      const { data, error } = await supabaseHelpers.getContent();
      if (!error) setContent(data || {});
    };
    fetchContent();
  }, []);

  const logoWidthStyle = { width: 'clamp(140px, 18vw, 180px)' };
  const sloganGradientStyle = {
    background: 'linear-gradient(90deg, #084a9b 0%, #006ea8 50%, #0082b5 100%)',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
  };

  const companyInfoName = withFallback(content.company_info_name, 'Global Fulfill Hub');
  const companyInfoSiret = withFallback(content.company_info_siret, '941 373 110 00019');
  const companyInfoVat = withFallback(content.company_info_vat, 'FR 38 941 373 110');
  const warehouseName = withFallback(content.warehouse_name, 'EcomPrep Hub');
  const warehouseAddress = withFallback(
    content.warehouse_address,
    '5 Rue des Enclos, Zone B, Cellule 7\n35350 La Gouesnière\nFrance'
  );
  const warehousePhone = withFallback(content.warehouse_phone, '+33 6 75 11 62 18');
  const warehouseEmail = withFallback(content.warehouse_email, 'contact@prep-center.eu');
  const contactEmail = withFallback(content.contact_email, warehouseEmail);
  const contactPhone = withFallback(content.contact_phone, warehousePhone);
  const contactAddress = withFallback(content.contact_address, '35350 La Gouesnière\nFrance');

  const renderAddress = (text) =>
    text.split(/\r?\n/).map((line, idx) => (
      <span key={`${line}-${idx}`} className="block">
        {line.trim()}
      </span>
    ));

  return (
    <footer className="bg-gray-50 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="space-y-3 max-w-sm">
            <div className="flex items-start space-x-3">
              <div className="flex flex-col items-center" style={logoWidthStyle}>
                <img 
                  src="/branding/fulfillment-prep-logo.png"
                  alt="Fulfillment Prep Logistics Logo" 
                  className="w-full object-contain"
                  style={{ maxHeight: 'clamp(34px, 3.8vw, 44px)' }}
                />
                <span
                  className="block mt-1 font-semibold uppercase tracking-[0.05em] text-center whitespace-nowrap"
                  style={{ ...sloganGradientStyle, fontSize: 'clamp(6px, 0.8vw, 8px)' }}
                >
                  We prep. You scale.
                </span>
              </div>
              <span className="text-lg font-bold text-text-primary leading-tight">PrepCenter France</span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              {withSafeSubtitle(
                content.hero_subtitle,
                'Reception, quality control, labeling, polybagging & fast shipping to EU fulfillment centers.'
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://wa.me/33675116218"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#25D366] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#1ebe5d] transition-colors text-sm"
              >
                WhatsApp
              </a>
              <a
                href="https://us04web.zoom.us/j/7184050116?pwd=zaaAe2ANnKbXNTGp7f8DebRbtY4LKD.1"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-dark transition-colors text-sm"
              >
                Book Zoom
              </a>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Company information</h3>
            <p className="text-sm text-text-secondary">{companyInfoName}</p>
            <p className="text-sm text-text-secondary">SIRET : {companyInfoSiret}</p>
            <p className="text-sm text-text-secondary">VAT : {companyInfoVat}</p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Warehouse &amp; operations</h3>
            <p className="text-sm text-text-secondary">{warehouseName}</p>
            <p className="text-sm text-text-secondary">
              {renderAddress(warehouseAddress)}
            </p>
            <p className="text-sm text-text-secondary">Phone : {warehousePhone}</p>
            <p className="text-sm text-text-secondary">Email : {warehouseEmail}</p>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Contact</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-text-secondary" />
                <span className="text-text-secondary">{contactEmail}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4 text-text-secondary" />
                <span className="text-text-secondary">{contactPhone}</span>
              </div>
              <div className="flex items-start space-x-2">
                <MapPin className="w-4 h-4 text-text-secondary mt-1" />
                <span className="text-text-secondary">
                  {renderAddress(contactAddress)}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Quick Links</h3>
            <div className="space-y-2 text-sm">
              <a href="/services-pricing" className="block text-text-secondary hover:text-primary transition-colors">
                Services & Pricing
              </a>
              <a href="#" className="block text-text-secondary hover:text-primary transition-colors">
                Pricing PDF
              </a>
              <a href="/terms" className="block text-text-secondary hover:text-primary transition-colors">
                Terms of Service
              </a>
              <a href="/privacy-policy" className="block text-text-secondary hover:text-primary transition-colors">
                Privacy Policy
              </a>
              <a href="https://linkedin.com/in/adrian-bucur-82baa91a5" target="_blank" rel="noopener noreferrer" className="block text-text-secondary hover:text-primary transition-colors">
                LinkedIn
              </a>
              <a href="https://www.tiktok.com/@prepcenterfrance?lang=ro-RO" target="_blank" rel="noopener noreferrer" className="block text-text-secondary hover:text-primary transition-colors">
                TikTok
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright Bar */}
      <div className="bg-gray-100 border-t py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-text-light">
            AI vibe coded development by{' '}
            <a 
              href="https://biela.dev/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-dark transition-colors"
            >
              Biela.dev
            </a>
            , powered by{' '}
            <a 
              href="https://teachmecode.ae/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-dark transition-colors"
            >
              TeachMeCode® Institute
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;

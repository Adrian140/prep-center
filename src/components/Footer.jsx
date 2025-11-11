import React, { useState, useEffect } from 'react';
import { Mail, Phone, MapPin } from 'lucide-react';
import { supabaseHelpers } from '../config/supabase';

function Footer() {
  const [content, setContent] = useState({});

  useEffect(() => {
    const fetchContent = async () => {
      const { data, error } = await supabaseHelpers.getContent();
      if (!error) setContent(data || {});
    };
    fetchContent();
  }, []);
  return (
    <footer className="bg-gray-50 border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="space-y-3 max-w-sm">
            <div className="flex items-center space-x-2">
              <img 
                src="https://i.postimg.cc/9zLyQFZx/Chat-GPT-Image-25-aug-2025-01-47-38.png" 
                alt="FBA Prep Logistics Logo" 
                className="w-14 h-14 object-contain"
              />
              <span className="text-lg font-bold text-text-primary leading-tight">PrepCenter France</span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              {content.hero_subtitle || 'Reception, quality control, FNSKU labeling, polybagging & fast shipping to EU Amazon FCs.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://wa.me/33675116218"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-accent text-white px-4 py-2 rounded-lg font-medium hover:bg-accent-dark transition-colors text-sm"
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
            <p className="text-sm text-text-secondary">Global Fulfill Hub</p>
            <p className="text-sm text-text-secondary">SIRET : 941 373 110 00019</p>
            <p className="text-sm text-text-secondary">VAT : FR 38 941 373 110</p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Warehouse &amp; operations</h3>
            <p className="text-sm text-text-secondary">EcomPrep Hub</p>
            <p className="text-sm text-text-secondary">5 Rue des Enclos, Port 7, 35350 La Gouesnière, France</p>
            <p className="text-sm text-text-secondary">Phone : +33 6 75 11 62 18</p>
            <p className="text-sm text-text-secondary">Email : contact@prep-center.eu</p>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Contact</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-text-secondary" />
                <span className="text-text-secondary">contact@prep-center.eu</span>
              </div>
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4 text-text-secondary" />
                <span className="text-text-secondary">+33 6 75 11 62 18</span>
              </div>
              <div className="flex items-start space-x-2">
                <MapPin className="w-4 h-4 text-text-secondary mt-1" />
                <span className="text-text-secondary">
                  35350 La Gouesnière, France
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

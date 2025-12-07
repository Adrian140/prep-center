import React from 'react';
import { useAboutTranslation } from '../translations/about';
import { useLanguage } from '../contexts/LanguageContext';
import { Award, Users, Clock, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';

function About() {
  const { currentLanguage } = useLanguage();
  const { t } = useAboutTranslation(currentLanguage);
  
const images = [
  // 🔹 Noile imagini
  "https://i.postimg.cc/J7SVPbtc/3-BD91-B45-0354-4-BEF-85-B7-5-F6949-F4-C814.png",
  "https://i.postimg.cc/Qd3LrhQF/3-DB7-A80-F-CAC3-45-AF-A046-C4-D29-C6329-CF.png",
  "https://i.postimg.cc/W4NQh8fj/718-D0-B72-E1-E0-48-E3-A153-6-CFC579-F91-E5.png",
  "https://i.postimg.cc/xTHr7czr/85-CF0738-B8-EF-4-F58-8627-9-A51605760-D9.png",
  "https://i.postimg.cc/jSQpxmcZ/89-B2118-F-C99-C-4-F59-B273-5-AF174-E636-D8.png",
  "https://i.postimg.cc/RFqyTFBD/B9-A03935-9-EB2-4472-8-CA0-77-F6-F2699311.png",
  "https://i.postimg.cc/XvstF5T5/E26783-CD-7-EF7-4-C38-B3-DE-88-C0-E136-EBE9.png",
  "https://i.postimg.cc/hjwwZB4P/F2-EDC678-330-B-4905-AC01-ABBB971-A5-C44.png",
  "https://i.postimg.cc/rsrHvPzG/rn-image-picker-lib-temp-77215b1c-8d60-4042-9db0-7f13a590c647.jpg",

  // 🔹 Imaginile vechi
  "https://i.postimg.cc/Y027zQWp/ED3-D0320-0-A71-4-C30-97-FF-74-E4-D0709-B5-E.png",
  "https://i.postimg.cc/GtMC79Fv/A0493481-C674-44-B5-B071-AEF8-D7-F295-A3.png",
  "https://content-studio.biela.dev/i/content-studio/68a9b2648cd1ba15f2ff2bbc/1755951730702-68a9b2648cd1ba15f2ff2bbc/1756508278444.png/a0493481-c674-44b5-b071-aef8d7f295a3.webp",
  "https://content-studio.biela.dev/i/content-studio/68a9b2648cd1ba15f2ff2bbc/1755951730702-68a9b2648cd1ba15f2ff2bbc/1756508278969.png/ed3d0320-0a71-4c30-97ff-74e4d0709b5e.webp"
];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 5000); // Change image every 5 seconds
    return () => clearInterval(interval);
  }, [images.length]);

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
            {t('pageTitle')}
          </h1>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            {t('pageSubtitle')}
          </p>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-20">
          {/* Story */}
          <div>
            <h2 className="text-3xl font-bold text-text-primary mb-6">{t('ourStory')}</h2>
            <div className="space-y-4 text-text-secondary">
              <p>{t('ourStoryParagraph1')}</p>
              <p>{t('ourStoryParagraph2')}</p>
              <p>{t('ourStoryParagraph3')}</p>
            </div>
          </div>

          {/* Warehouse Imagery */}
          <div className="space-y-4">
            <div className="relative rounded-xl overflow-hidden aspect-video flex items-center justify-center bg-black">
              <img
                src={images[currentImageIndex]}
                alt={t('warehouseFacilityAlt')}
                className="w-full h-full object-contain transition-opacity duration-1000 ease-in-out"
              />
              <div className="flex justify-center mt-4 absolute bottom-2 w-full">
                <a
                  href="https://www.tiktok.com/@prepcenterfrance?lang=ro-RO"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-white bg-black/60 px-3 py-2 rounded-lg hover:bg-black/80 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-6 h-6"
                  >
                    <path d="M12.525 0H11.475C10.118 0 9.005 1.113 9.005 2.475v19.05c0 1.362 1.113 2.475 2.475 2.475h1.05c1.362 0 2.475-1.113 2.475-2.475V12.525c0-1.362-1.113-2.475-2.475-2.475H11.475V0zM18.525 0H17.475C16.118 0 15.005 1.113 15.005 2.475v19.05c0 1.362 1.113 2.475 2.475 2.475h1.05c1.362 0 2.475-1.113 2.475-2.475V12.525c0-1.362-1.113-2.475-2.475-2.475H17.475V0zM6.525 0H5.475C4.118 0 3.005 1.113 3.005 2.475v19.05c0 1.362 1.113 2.475 2.475 2.475h1.05c1.362 0 2.475-1.113 2.475-2.475V12.525c0-1.362-1.113-2.475-2.475-2.475H6.525V0z"></path>
                  </svg>
                  <span className="ml-2 font-medium">Follow us on TikTok</span>
                </a>
              </div>
            </div>
            <p className="text-text-secondary">
              <strong>Main warehouse:</strong> 5 Rue des Enclos, 35350 La Gouesnière, France
            </p>
          </div>
        </div>

        <section className="mb-20">
          <h2 className="text-3xl font-bold text-text-primary mb-6">{t('whyMattersTitle')}</h2>
          <p className="text-text-secondary text-lg">{t('whyMattersParagraph')}</p>
        </section>
        
        {/* Values */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-text-primary mb-12 text-center">{t('ourValues')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <Clock className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-text-primary mb-4">{t('speedEfficiency')}</h3>
              <p className="text-text-secondary">
                {t('speedEfficiencyDesc')}
              </p>
            </div>
            <div className="text-center">
              <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-text-primary mb-4">{t('qualityCompliance')}</h3>
              <p className="text-text-secondary">
                {t('qualityComplianceDesc')}
              </p>
            </div>
            <div className="text-center">
              <Users className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-text-primary mb-4">{t('partnershipSupport')}</h3>
              <p className="text-text-secondary">
                {t('partnershipSupportDesc')}
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center">
          <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-12 space-y-6">
            <h2 className="text-3xl font-bold text-text-primary">Ready to Partner with Us?</h2>
            <p className="text-xl text-text-secondary">
              Streamline your logistics with Prep Center France — your trusted partner for Amazon
              FBA and FBM fulfillment in Europe.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="https://prep-center.eu/contact"
                className="bg-primary text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-primary-dark transition-colors text-center"
              >
                Get a Quote
              </a>
              <a
                href="https://wa.me/33675116218"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-accent text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-accent-dark transition-colors text-center"
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default About;

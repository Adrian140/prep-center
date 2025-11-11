import React, { useState, useEffect } from 'react';
import {
  Clock, DollarSign, MapPin, Award, ArrowRight, CheckCircle, Star, Truck,
  Package, Shield, Users, Phone, Mail, MessageCircle
} from 'lucide-react';
import { useTranslation } from '../translations';
import { supabaseHelpers } from '../config/supabase';

function Home() {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState([]);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  useEffect(() => {
    const fetchReviews = async () => {
      const { data, error } = await supabaseHelpers.getReviews();
      if (!error) setReviews(data || []);
    };
    fetchReviews();
  }, []);

  // pornește autoplay doar dacă ai >1 recenzie
  useEffect(() => {
    if (reviews.length <= 1) {
      setCurrentTestimonial(0);
      return;
    }
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % reviews.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [reviews.length]);

  // dacă lista se schimbă (ex: din 0 -> N), resetează indexul
  useEffect(() => {
    if (currentTestimonial >= reviews.length) setCurrentTestimonial(0);
  }, [reviews.length, currentTestimonial]);

  const whyChooseUs = [
    { icon: Clock, title: t('turnaroundTitle'), description: t('turnaroundDesc') },
    { icon: DollarSign, title: t('transparentPricingTitle'), description: t('transparentPricingDesc') },
    { icon: MapPin, title: t('strategicLocationTitle'), description: t('strategicLocationDesc') },
    { icon: Award, title: t('amazonReadyTitle'), description: t('amazonReadyDesc') }
  ];

  const timeline = [
    { step: t('receptionStep'), description: t('receptionDesc') },
    { step: t('qualityControlStep'), description: t('qualityControlDesc') },
    { step: t('labelingStep'), description: t('labelingDesc') },
    { step: t('polybaggingStep'), description: t('polybaggingDesc') },
    { step: t('shippingStep'), description: t('shippingDesc') },
    { step: t('confirmStep'), description: t('confirmDesc') }
  ];

  const carriers = [
    { name: "UPS", logo: "https://i.postimg.cc/VSMSdrb2/desca-rcare-1.jpg" },
    { name: "Colissimo", logo: "https://i.postimg.cc/G8C4YLFt/desca-rcare-2.png" },
    { name: "Colis Privé", logo: "https://i.postimg.cc/y36WQLrz/desca-rcare-2.jpg" },
    { name: "Chronopost", logo: "https://i.postimg.cc/BtJ8nvZw/desca-rcare-3.png" },
    { name: "Mondial Relay", logo: "https://i.postimg.cc/TLJpJz09/desca-rcare-3.jpg" },
    { name: "GLS", logo: "https://i.postimg.cc/rzGkNzYG/desca-rcare-5.png" }
  ];

  const services = [
    {
      icon: Package,
      title: t('fnskuLabelingTitle'),
      description: t('fnskuLabelingDesc'),
      price: "€0.50",
      unit: t('perProduct'),
      features: [t('receptionInspection'), t('fnskuLabeling'), t('polybagging'), t('qualityControl')]
    },
    {
      icon: Truck,
      title: t('fbmShippingTitle'),
      description: t('fbmShippingDesc'),
      price: "€1.40",
      unit: t('perOrder'),
      features: [t('pickPack'), t('multiPlatform'), t('sameDayShipping'), t('returnsHandling')]
    },
    {
      icon: Shield,
      title: t('storageTitle'),
      description: t('storageDesc'),
      price: null,
      unit: null,
      features: [t('secureStorage'), t('inventoryTracking'), t('climateControlled'), t('monitoring24h')]
    }
  ];

  const stats = [
    { number: "4+", label: t('yearsExperience'), icon: Clock },
    { number: "700K+", label: t('ordersProcessed'), icon: Package },
    { number: "25+", label: t('happyClients'), icon: Users },
    { number: "24h", label: t('averageTurnaround'), icon: Shield }
  ];

  const benefits = [
    { title: t('euDistributionTitle'), description: t('euDistributionDesc'), icon: MapPin },
    { title: t('complianceTitle'), description: t('complianceDesc'), icon: Shield },
    { title: t('qualityAssuranceTitle'), description: t('qualityAssuranceDesc'), icon: CheckCircle },
    { title: t('transparentPricingBenefitTitle'), description: t('transparentPricingBenefitDesc'), icon: DollarSign }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-50 to-white py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-6">
            <Star className="w-8 h-8 text-yellow-400 fill-current" />
            <Star className="w-8 h-8 text-yellow-400 fill-current" />
            <Star className="w-8 h-8 text-yellow-400 fill-current" />
            <Star className="w-8 h-8 text-yellow-400 fill-current" />
            <Star className="w-8 h-8 text-yellow-400 fill-current" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-text-primary mb-6 leading-tight">
            {t('heroTitle')}
          </h1>
          <p className="text-lg sm:text-xl text-text-secondary mb-8 max-w-3xl mx-auto leading-relaxed">
            {t('heroSubtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a href="/contact" className="w-full sm:w-auto bg-primary text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-primary-dark transition-colors text-center">
              {t('getQuote')}
            </a>
            <a href="https://wa.me/33675116218" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto bg-accent text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-accent-dark transition-colors text-center">
              {t('chatWhatsApp')}
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <stat.icon className="w-12 h-12 text-primary mx-auto mb-4" />
              <div className="text-3xl font-bold text-text-primary mb-2">{stat.number}</div>
              <div className="text-text-secondary">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Why */}
      <section className="py-16 lg:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-text-primary mb-4">{t('whyChooseTitle')}</h2>
            <p className="text-lg sm:text-xl text-text-secondary">{t('whyChooseSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {whyChooseUs.map((item, i) => (
              <div key={i} className="bg-white p-6 rounded-xl text-center hover:shadow-lg transition-shadow">
                <item.icon className="w-12 h-12 text-primary mx-auto mb-4" />
                <h3 className="text-base sm:text-lg font-semibold text-text-primary mb-2">{item.title}</h3>
                <p className="text-sm sm:text-base text-text-secondary">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-text-primary mb-4">{t('coreServicesTitle')}</h2>
            <p className="text-lg sm:text-xl text-text-secondary">{t('coreServicesSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {services.map((service, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-8 text-center hover:shadow-lg transition-shadow">
                <service.icon className="w-16 h-16 text-primary mx-auto mb-6" />
                <h3 className="text-xl font-bold text-text-primary mb-4">{service.title}</h3>
                <p className="text-text-secondary mb-6">{service.description}</p>
                {service.price && (
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-primary">{service.price}</span>
                    <span className="text-text-secondary ml-2">{service.unit}</span>
                  </div>
                )}
                <ul className="space-y-2 mb-6">
                  {service.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                      <span className="text-sm text-text-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>
                <a href="/services-pricing" className="inline-flex items-center text-primary font-medium hover:text-primary-dark transition-colors">
                  {t('learnMore')} <ArrowRight className="w-4 h-4 ml-1" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 lg:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-text-primary mb-4">{t('howItWorksTitle')}</h2>
            <p className="text-lg sm:text-xl text-text-secondary">{t('howItWorksSubtitle')}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-6">
            {timeline.map((item, i) => (
              <div key={i} className="text-center">
                <div className="bg-primary text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-sm sm:text-base">
                  {i + 1}
                </div>
                <h3 className="text-sm sm:text-lg font-semibold text-text-primary mb-2">{item.step}</h3>
                <p className="text-xs sm:text-sm text-text-secondary">{item.description}</p>
                {i < timeline.length - 1 && (
                  <ArrowRight className="w-4 h-4 sm:w-6 sm:h-6 text-text-light mx-auto mt-4 hidden lg:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-text-primary mb-4">{t('benefitsTitle')}</h2>
            <p className="text-lg sm:text-xl text-text-secondary">{t('benefitsSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {benefits.map((benefit, i) => (
              <div key={i} className="flex items-start space-x-4 p-6 bg-gray-50 rounded-xl">
                <benefit.icon className="w-12 h-12 text-primary flex-shrink-0" />
                <div>
                  <h3 className="text-xl font-semibold text-text-primary mb-2">{benefit.title}</h3>
                  <p className="text-text-secondary">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials (fixat) */}
      <section className="py-16 lg:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-text-primary mb-4">
              {t('testimonialsTitle')}
            </h2>
            <p className="text-lg sm:text-xl text-text-secondary">
              {t('testimonialsSubtitle')}
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            {reviews.length > 0 ? (
              <>
                <div className="bg-white p-6 sm:p-8 rounded-xl text-center shadow-lg">
                  <div className="flex justify-center mb-4">
                    {[...Array(reviews[currentTestimonial]?.rating || 0)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  <p className="text-base sm:text-lg text-text-secondary mb-6 italic">
                    “{reviews[currentTestimonial]?.review_text}”
                  </p>
                  <div>
                    <p className="text-sm sm:text-base font-semibold text-text-primary">
                      {reviews[currentTestimonial]?.reviewer_name}
                    </p>
                    {reviews[currentTestimonial]?.review_link && (
                      <a
                        href={reviews[currentTestimonial].review_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm"
                      >
                        See original review
                      </a>
                    )}
                  </div>
                </div>

                {reviews.length > 1 && (
                  <div className="flex justify-center mt-6 space-x-2">
                    {reviews.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentTestimonial(index)}
                        className={`w-3 h-3 rounded-full transition-colors ${
                          index === currentTestimonial ? 'bg-primary' : 'bg-gray-300'
                        }`}
                        aria-label={`Go to testimonial ${index + 1}`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-center text-text-secondary">Momentan nu sunt recenzii afișate.</p>
            )}
          </div>
        </div>
      </section>

      {/* Carriers */}
      <section className="py-12 lg:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-4">{t('carriersTitle')}</h2>
            <p className="text-sm sm:text-base text-text-secondary">{t('carriersSubtitle')}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 items-center justify-items-center">
            {carriers.map((carrier, i) => (
              <div key={i} className="flex flex-col justify-center items-center h-20">
                <p className="text-sm font-semibold text-text-primary mb-2">{carrier.name}</p>
                <img src={carrier.logo} alt={`${carrier.name} logo`} className="h-10 max-w-full object-contain transition-all duration-300" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Private Label */}
      <section className="py-16 lg:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-text-primary mb-4">{t('privateLabelTitle')}</h2>
            <p className="text-lg sm:text-xl text-text-secondary">{t('privateLabelSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg">
              <h3 className="text-xl sm:text-2xl font-bold text-text-primary mb-6">{t('privateLabelPartnershipTitle')}</h3>
              <div className="space-y-4">
                {[t('customPackaging'), t('productSourcing'), t('qualityCompliance'), t('endToEndFulfillment')].map((txt, i) => (
                  <div className="flex items-center" key={i}>
                    <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                    <span className="text-sm sm:text-base text-text-secondary">{txt}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg">
              <h3 className="text-xl sm:text-2xl font-bold text-text-primary mb-6">{t('multiPlatformTitle')}</h3>
              <div className="space-y-4">
                {[t('amazonFbmFulfillment'), t('ebayProcessing'), t('shopifyIntegration'), t('customWebsiteFulfillment')].map((txt, i) => (
                  <div className="flex items-center" key={i}>
                    <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                    <span className="text-sm sm:text-base text-text-secondary">{txt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-20 bg-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6">{t('ctaTitle')}</h2>
          <p className="text-lg sm:text-xl text-blue-100 mb-8 max-w-2xl mx-auto">{t('ctaSubtitle')}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a href="/contact" className="w-full sm:w-auto bg-white text-primary px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-100 transition-all duration-200 shadow-lg hover:shadow-xl text-center">
              {t('getQuote')}
            </a>
            <a href="https://wa.me/33675116218" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto bg-accent text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-accent-dark transition-all duration-200 shadow-lg hover:shadow-xl text-center">
              {t('chatWhatsApp')}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;

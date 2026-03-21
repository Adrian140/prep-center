import React, { useState, useEffect, useRef } from "react";
import {
  Clock, DollarSign, MapPin, Award, ArrowRight, CheckCircle, Star, Truck,
  Package, Shield, Users, Zap, Globe, BarChart3, Play, ChevronRight
} from "lucide-react";
import { useTranslation } from "../translations";
import { supabaseHelpers } from "../config/supabase";

function AnimatedCounter({ target, suffix = "", duration = 2000 }) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const num = parseInt(String(target).replace(/[^0-9]/g, ""), 10);
    if (isNaN(num) || num === 0) { setCount(target); return; }
    let start = 0;
    const step = Math.ceil(num / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= num) { clearInterval(timer); setCount(target); }
      else setCount(start + suffix);
    }, 16);
    return () => clearInterval(timer);
  }, [started, target, suffix, duration]);

  return <span ref={ref}>{count}</span>;
}

function FadeInSection({ children, className = "", delay = 0 }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(32px)",
        transitionDelay: `${delay}ms`
      }}
    >
      {children}
    </div>
  );
}

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

  useEffect(() => {
    if (reviews.length <= 1) { setCurrentTestimonial(0); return; }
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % reviews.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [reviews.length]);

  useEffect(() => {
    if (currentTestimonial >= reviews.length) setCurrentTestimonial(0);
  }, [reviews.length, currentTestimonial]);

  const whyChooseUs = [
    { icon: Clock, title: t("turnaroundTitle"), description: t("turnaroundDesc"), color: "bg-blue-500" },
    { icon: DollarSign, title: t("transparentPricingTitle"), description: t("transparentPricingDesc"), color: "bg-emerald-500" },
    { icon: MapPin, title: t("strategicLocationTitle"), description: t("strategicLocationDesc"), color: "bg-violet-500" },
    { icon: Award, title: t("amazonReadyTitle"), description: t("amazonReadyDesc"), color: "bg-amber-500" }
  ];

  const timeline = [
    { step: t("receptionStep"), description: t("receptionDesc"), icon: Package },
    { step: t("qualityControlStep"), description: t("qualityControlDesc"), icon: Shield },
    { step: t("labelingStep"), description: t("labelingDesc"), icon: BarChart3 },
    { step: t("polybaggingStep"), description: t("polybaggingDesc"), icon: Package },
    { step: t("shippingStep"), description: t("shippingDesc"), icon: Truck },
    { step: t("confirmStep"), description: t("confirmDesc"), icon: CheckCircle }
  ];

  const carriers = [
    { name: "UPS", logo: "https://i.postimg.cc/VSMSdrb2/desca-rcare-1.jpg" },
    { name: "Colissimo", logo: "https://i.postimg.cc/G8C4YLFt/desca-rcare-2.png" },
    { name: "Colis Prive", logo: "https://i.postimg.cc/y36WQLrz/desca-rcare-2.jpg" },
    { name: "Chronopost", logo: "https://i.postimg.cc/BtJ8nvZw/desca-rcare-3.png" },
    { name: "Mondial Relay", logo: "https://i.postimg.cc/TLJpJz09/desca-rcare-3.jpg" },
    { name: "GLS", logo: "https://i.postimg.cc/rzGkNzYG/desca-rcare-5.png" }
  ];

  const services = [
    {
      icon: Package,
      title: t("fnskuLabelingTitle"),
      description: t("fnskuLabelingDesc"),
      features: [t("sixSidePhotos"), t("linkedToAsin"), t("secureCloudStorage"), t("instantDashboardAccess")],
      color: "blue"
    },
    {
      icon: Truck,
      title: t("fbmShippingTitle"),
      description: t("fbmShippingDesc"),
      features: [t("pickPack"), t("multiPlatform"), t("sameDayShipping"), t("returnsHandling")],
      color: "emerald"
    },
    {
      icon: Shield,
      title: t("storageTitle"),
      description: t("storageDesc"),
      features: [t("secureStorage"), t("inventoryTracking"), t("climateControlled"), t("monitoring24h")],
      color: "violet"
    }
  ];

  const stats = [
    { number: "5+", label: t("yearsExperience"), icon: Clock },
    { number: "700K+", label: t("ordersProcessed"), icon: Package },
    { number: "150+", label: t("happyClients"), icon: Users },
    { number: "24h", label: t("averageTurnaround"), icon: Zap }
  ];

  const benefits = [
    { title: t("euDistributionTitle"), description: t("euDistributionDesc"), icon: Globe },
    { title: t("complianceTitle"), description: t("complianceDesc"), icon: Shield },
    { title: t("qualityAssuranceTitle"), description: t("qualityAssuranceDesc"), icon: CheckCircle },
    { title: t("transparentPricingBenefitTitle"), description: t("transparentPricingBenefitDesc"), icon: DollarSign }
  ];

  const serviceColors = {
    blue: { bg: "bg-blue-50", icon: "bg-blue-600", text: "text-blue-600", border: "border-blue-100", hoverBorder: "hover:border-blue-300" },
    emerald: { bg: "bg-emerald-50", icon: "bg-emerald-600", text: "text-emerald-600", border: "border-emerald-100", hoverBorder: "hover:border-emerald-300" },
    violet: { bg: "bg-violet-50", icon: "bg-violet-600", text: "text-violet-600", border: "border-violet-100", hoverBorder: "hover:border-violet-300" }
  };

  return (
    <div id="home_root" className="min-h-screen">
      {/* ===== HERO ===== */}
      <section id="home_hero" className="relative overflow-hidden bg-[#060d19] min-h-[85vh] flex items-center">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-blue-600/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-violet-600/8 rounded-full blur-[120px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-primary/3 rounded-full blur-[150px]" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvc3ZnPg==')] opacity-60" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-0 w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 mb-8 backdrop-blur-md">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <span className="text-lg text-white/60 font-medium">150+ Happy Clients</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-semibold text-white mb-8 leading-[1.08] tracking-tight" style={{ textWrap: "balance" }}>
                {t("heroTitle")}
              </h1>

              <p className="text-xl text-white/50 mb-10 max-w-xl leading-relaxed font-light">
                {t("heroSubtitle")}
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href="/contact"
                  className="group inline-flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-md font-semibold text-lg hover:bg-primary-dark transition-all duration-300 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30"
                >
                  {t("getQuote")}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                </a>
                <a
                  href="https://wa.me/33675116218"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white px-8 py-4 rounded-md font-semibold text-lg hover:bg-[#1ebe5d] transition-all duration-300 shadow-lg shadow-[#25D366]/20"
                >
                  {t("chatWhatsApp")}
                </a>
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 to-violet-500/20 rounded-md blur-2xl" />
                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-md p-8 space-y-6">
                  {stats.map((stat, i) => (
                    <div key={i} className="flex items-center gap-5 group">
                      <div className="w-14 h-14 rounded-md bg-white/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-300">
                        <stat.icon className="w-6 h-6 text-white/80" />
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-white">
                          <AnimatedCounter target={stat.number} />
                        </div>
                        <div className="text-lg text-white/40 font-light">{stat.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
      </section>

      {/* ===== MOBILE STATS ===== */}
      <section id="home_stats_mobile" className="lg:hidden py-12 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-2 gap-4">
            {stats.map((stat, i) => (
              <FadeInSection key={i} delay={i * 100}>
                <div className="text-center p-5 bg-gray-50 rounded-md">
                  <div className="text-3xl font-bold text-text-primary mb-1">
                    <AnimatedCounter target={stat.number} />
                  </div>
                  <div className="text-lg text-text-secondary font-light">{stat.label}</div>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHY CHOOSE US ===== */}
      <section id="home_why" className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeInSection>
            <div className="max-w-3xl mb-16">
              <p className="text-lg font-semibold text-primary mb-4 uppercase tracking-widest">Why Us</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-text-primary leading-tight" style={{ textWrap: "balance" }}>
                {t("whyChooseTitle")}
              </h2>
              <p className="text-xl text-text-secondary mt-5 leading-relaxed font-light max-w-2xl">{t("whyChooseSubtitle")}</p>
            </div>
          </FadeInSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {whyChooseUs.map((item, i) => (
              <FadeInSection key={i} delay={i * 120}>
                <div className="group relative bg-white p-7 rounded-md border border-gray-100 hover:border-gray-200 hover:shadow-xl transition-all duration-500 h-full">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/0 to-transparent group-hover:via-primary/60 transition-all duration-500 rounded-t-md" />
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-md ${item.color} mb-6`}>
                    <item.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-text-primary mb-3">{item.title}</h3>
                  <p className="text-lg text-text-secondary leading-relaxed font-light">{item.description}</p>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SERVICES ===== */}
      <section id="home_services" className="py-20 lg:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeInSection>
            <div className="text-center mb-16">
              <p className="text-lg font-semibold text-primary mb-4 uppercase tracking-widest">Services</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-text-primary mb-5">{t("coreServicesTitle")}</h2>
              <p className="text-xl text-text-secondary max-w-2xl mx-auto font-light">{t("coreServicesSubtitle")}</p>
            </div>
          </FadeInSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {services.map((service, i) => {
              const c = serviceColors[service.color];
              return (
                <FadeInSection key={i} delay={i * 150}>
                  <div className={`group relative bg-white rounded-md border ${c.border} ${c.hoverBorder} hover:shadow-xl transition-all duration-500 overflow-hidden h-full flex flex-col`}>
                    <div className={`h-1 ${c.icon}`} />
                    <div className="p-8 flex flex-col flex-1">
                      <div className={`inline-flex items-center justify-center w-14 h-14 rounded-md ${c.icon} mb-6 group-hover:scale-110 transition-transform duration-300`}>
                        <service.icon className="w-7 h-7 text-white" />
                      </div>
                      <h3 className="text-xl font-semibold text-text-primary mb-3">{service.title}</h3>
                      <p className="text-lg text-text-secondary mb-7 leading-relaxed font-light">{service.description}</p>
                      <ul className="space-y-3 mb-7 flex-1">
                        {service.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-3">
                            <CheckCircle className={`w-5 h-5 ${c.text} flex-shrink-0 mt-0.5`} />
                            <span className="text-lg text-text-secondary font-light">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <a
                        href="/services-pricing"
                        className={`inline-flex items-center gap-2 ${c.text} font-semibold text-lg group-hover:gap-3 transition-all duration-300 mt-auto`}
                      >
                        {t("learnMore")} <ChevronRight className="w-5 h-5" />
                      </a>
                    </div>
                  </div>
                </FadeInSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="home_process" className="py-20 lg:py-28 bg-[#060d19] relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeInSection>
            <div className="text-center mb-16">
              <p className="text-lg font-semibold text-blue-400 mb-4 uppercase tracking-widest">Process</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-5">{t("howItWorksTitle")}</h2>
              <p className="text-xl text-white/40 max-w-2xl mx-auto font-light">{t("howItWorksSubtitle")}</p>
            </div>
          </FadeInSection>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
            {timeline.map((item, i) => (
              <FadeInSection key={i} delay={i * 100}>
                <div className="relative text-center group">
                  <div className="relative mx-auto w-16 h-16 rounded-md bg-white/5 border border-white/10 flex items-center justify-center mb-5 group-hover:bg-white/10 group-hover:border-primary/30 transition-all duration-500">
                    <span className="text-2xl font-bold text-white">{i + 1}</span>
                  </div>
                  {i < timeline.length - 1 && (
                    <div className="hidden lg:block absolute top-8 left-[calc(50%+32px)] w-[calc(100%-64px)] h-px bg-gradient-to-r from-white/15 to-transparent" />
                  )}
                  <h3 className="text-lg font-semibold text-white mb-2">{item.step}</h3>
                  <p className="text-lg text-white/35 leading-relaxed font-light">{item.description}</p>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BENEFITS ===== */}
      <section id="home_benefits" className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeInSection>
            <div className="max-w-3xl mb-16">
              <p className="text-lg font-semibold text-primary mb-4 uppercase tracking-widest">Advantages</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-text-primary mb-5">{t("benefitsTitle")}</h2>
              <p className="text-xl text-text-secondary max-w-2xl font-light">{t("benefitsSubtitle")}</p>
            </div>
          </FadeInSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {benefits.map((benefit, i) => (
              <FadeInSection key={i} delay={i * 120}>
                <div className="group flex items-start gap-6 p-7 rounded-md bg-gray-50 border border-gray-100 hover:bg-white hover:border-gray-200 hover:shadow-lg transition-all duration-500">
                  <div className="flex-shrink-0 w-14 h-14 rounded-md bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors duration-300">
                    <benefit.icon className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-text-primary mb-2">{benefit.title}</h3>
                    <p className="text-lg text-text-secondary leading-relaxed font-light">{benefit.description}</p>
                  </div>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section id="home_testimonials" className="py-20 lg:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeInSection>
            <div className="text-center mb-16">
              <p className="text-lg font-semibold text-primary mb-4 uppercase tracking-widest">Reviews</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-text-primary mb-5">
                {t("testimonialsTitle")}
              </h2>
              <p className="text-xl text-text-secondary font-light">{t("testimonialsSubtitle")}</p>
            </div>
          </FadeInSection>

          <FadeInSection>
            <div className="max-w-3xl mx-auto">
              {reviews.length > 0 ? (
                <>
                  <div className="relative bg-white p-10 sm:p-12 rounded-md border border-gray-100 shadow-lg">
                    <svg className="absolute top-8 left-8 w-12 h-12 text-primary/8" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                    </svg>
                    <div className="relative z-10">
                      <div className="flex justify-center mb-6">
                        {[...Array(reviews[currentTestimonial]?.rating || 0)].map((_, i) => (
                          <Star key={i} className="w-5 h-5 text-amber-400 fill-amber-400" />
                        ))}
                      </div>
                      <p className="text-2xl text-text-primary mb-8 text-center leading-relaxed italic font-light">
                        &ldquo;{reviews[currentTestimonial]?.review_text}&rdquo;
                      </p>
                      <div className="text-center">
                        <p className="text-xl font-semibold text-text-primary">
                          {reviews[currentTestimonial]?.reviewer_name}
                        </p>
                        {reviews[currentTestimonial]?.review_link && (
                          <a
                            href={reviews[currentTestimonial].review_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline text-lg mt-2 inline-block font-light"
                          >
                            See original review
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  {reviews.length > 1 && (
                    <div className="flex justify-center mt-8 gap-2">
                      {reviews.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentTestimonial(index)}
                          className={`h-2.5 rounded-full transition-all duration-500 ${
                            index === currentTestimonial
                              ? "bg-primary w-10"
                              : "bg-gray-300 hover:bg-gray-400 w-2.5"
                          }`}
                          aria-label={`Go to testimonial ${index + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-center text-lg text-text-secondary font-light">Momentan nu sunt recenzii afisate.</p>
              )}
            </div>
          </FadeInSection>
        </div>
      </section>

      {/* ===== CARRIERS ===== */}
      <section id="home_carriers" className="py-16 lg:py-20 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeInSection>
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-semibold text-text-primary mb-3">{t("carriersTitle")}</h2>
              <p className="text-lg text-text-secondary font-light">{t("carriersSubtitle")}</p>
            </div>
          </FadeInSection>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 items-center justify-items-center">
            {carriers.map((carrier, i) => (
              <FadeInSection key={i} delay={i * 80}>
                <div className="flex flex-col justify-center items-center h-24 opacity-50 hover:opacity-100 transition-all duration-500 group">
                  <img
                    src={carrier.logo}
                    alt={`${carrier.name} logo`}
                    className="h-12 max-w-full object-contain grayscale group-hover:grayscale-0 transition-all duration-500"
                  />
                  <p className="text-lg font-medium text-text-secondary mt-2 group-hover:text-text-primary transition-colors duration-300">{carrier.name}</p>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRIVATE LABEL ===== */}
      <section id="home_private_label" className="py-20 lg:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeInSection>
            <div className="text-center mb-16">
              <p className="text-lg font-semibold text-primary mb-4 uppercase tracking-widest">Solutions</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-text-primary mb-5">{t("privateLabelTitle")}</h2>
              <p className="text-xl text-text-secondary max-w-2xl mx-auto font-light">{t("privateLabelSubtitle")}</p>
            </div>
          </FadeInSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            <FadeInSection delay={0}>
              <div className="group bg-white p-8 rounded-md border border-gray-100 hover:border-blue-200 hover:shadow-xl transition-all duration-500 h-full">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-md bg-blue-600 mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Package className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-semibold text-text-primary mb-6">{t("privateLabelPartnershipTitle")}</h3>
                <div className="space-y-4">
                  {[t("customPackaging"), t("productSourcing"), t("qualityCompliance"), t("endToEndFulfillment")].map((txt, i) => (
                    <div className="flex items-start gap-3" key={i}>
                      <CheckCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <span className="text-lg text-text-secondary font-light">{txt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeInSection>

            <FadeInSection delay={150}>
              <div className="group bg-white p-8 rounded-md border border-gray-100 hover:border-emerald-200 hover:shadow-xl transition-all duration-500 h-full">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-md bg-emerald-600 mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Globe className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-semibold text-text-primary mb-6">{t("multiPlatformTitle")}</h3>
                <div className="space-y-4">
                  {[t("amazonFbmFulfillment"), t("ebayProcessing"), t("shopifyIntegration"), t("customWebsiteFulfillment")].map((txt, i) => (
                    <div className="flex items-start gap-3" key={i}>
                      <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-lg text-text-secondary font-light">{txt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeInSection>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section id="home_cta" className="relative overflow-hidden py-20 lg:py-28 bg-[#060d19]">
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-500/8 rounded-full blur-[120px]" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeInSection>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-7 leading-tight" style={{ textWrap: "balance" }}>
              {t("ctaTitle")}
            </h2>
            <p className="text-xl text-white/40 mb-12 max-w-2xl mx-auto leading-relaxed font-light">
              {t("ctaSubtitle")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href="/contact"
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-[#060d19] px-10 py-4 rounded-md font-semibold text-lg hover:bg-gray-100 transition-all duration-300 shadow-lg"
              >
                {t("getQuote")}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
              </a>
              <a
                href="https://wa.me/33675116218"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#25D366] text-white px-10 py-4 rounded-md font-semibold text-lg hover:bg-[#1ebe5d] transition-all duration-300 shadow-lg shadow-[#25D366]/20"
              >
                {t("chatWhatsApp")}
              </a>
            </div>
          </FadeInSection>
        </div>
      </section>
    </div>
  );
}

export default Home;

import React, { useState, useEffect, useRef } from "react";
import { useAboutTranslation } from "../translations/about";
import { useLanguage } from "../contexts/LanguageContext";
import {
  Users, Clock, Shield, MapPin, ArrowRight, ChevronLeft, ChevronRight,
  Building2, Globe, Zap, CheckCircle, Package
} from "lucide-react";
import { usePublicStats } from "@/hooks/usePublicStats";

function FadeIn({ children, className = "", delay = 0 }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
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

const IMAGES = [
  "https://i.postimg.cc/J7SVPbtc/3-BD91-B45-0354-4-BEF-85-B7-5-F6949-F4-C814.png",
  "https://i.postimg.cc/Qd3LrhQF/3-DB7-A80-F-CAC3-45-AF-A046-C4-D29-C6329-CF.png",
  "https://i.postimg.cc/W4NQh8fj/718-D0-B72-E1-E0-48-E3-A153-6-CFC579-F91-E5.png",
  "https://i.postimg.cc/xTHr7czr/85-CF0738-B8-EF-4-F58-8627-9-A51605760-D9.png",
  "https://i.postimg.cc/jSQpxmcZ/89-B2118-F-C99-C-4-F59-B273-5-AF174-E636-D8.png",
  "https://i.postimg.cc/RFqyTFBD/B9-A03935-9-EB2-4472-8-CA0-77-F6-F2699311.png",
  "https://i.postimg.cc/XvstF5T5/E26783-CD-7-EF7-4-C38-B3-DE-88-C0-E136-EBE9.png",
  "https://i.postimg.cc/hjwwZB4P/F2-EDC678-330-B-4905-AC01-ABBB971-A5-C44.png",
  "https://i.postimg.cc/rsrHvPzG/rn-image-picker-lib-temp-77215b1c-8d60-4042-9db0-7f13a590c647.jpg",
  "https://i.postimg.cc/Y027zQWp/ED3-D0320-0-A71-4-C30-97-FF-74-E4-D0709-B5-E.png",
  "https://i.postimg.cc/GtMC79Fv/A0493481-C674-44-B5-B071-AEF8-D7-F295-A3.png",
  "https://content-studio.biela.dev/i/content-studio/68a9b2648cd1ba15f2ff2bbc/1755951730702-68a9b2648cd1ba15f2ff2bbc/1756508278444.png/a0493481-c674-44b5-b071-aef8d7f295a3.webp",
  "https://content-studio.biela.dev/i/content-studio/68a9b2648cd1ba15f2ff2bbc/1755951730702-68a9b2648cd1ba15f2ff2bbc/1756508278969.png/ed3d0320-0a71-4c30-97ff-74e4d0709b5e.webp"
];

function About() {
  const { currentLanguage } = useLanguage();
  const { t } = useAboutTranslation(currentLanguage);
  const { happyClientsTotal, experienceDisplay } = usePublicStats();

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imgFade, setImgFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setImgFade(false);
      setTimeout(() => {
        setCurrentImageIndex((prev) => (prev + 1) % IMAGES.length);
        setImgFade(true);
      }, 400);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const goToPrev = () => {
    setImgFade(false);
    setTimeout(() => {
      setCurrentImageIndex((prev) => (prev - 1 + IMAGES.length) % IMAGES.length);
      setImgFade(true);
    }, 300);
  };

  const goToNext = () => {
    setImgFade(false);
    setTimeout(() => {
      setCurrentImageIndex((prev) => (prev + 1) % IMAGES.length);
      setImgFade(true);
    }, 300);
  };

  const stats = [
    { number: experienceDisplay, label: t("yearsExperience"), icon: Clock, animated: false },
    { number: "700K+", label: t("ordersProcessed"), icon: Package },
    { number: String(happyClientsTotal), label: t("happyClients"), icon: Users },
    { number: "24h", label: t("averageTurnaround"), icon: Zap }
  ];

  const values = [
    {
      icon: Clock,
      title: t("speedEfficiency"),
      description: t("speedEfficiencyDesc"),
      color: "bg-blue-600",
      border: "border-blue-100",
      hoverBorder: "hover:border-blue-300"
    },
    {
      icon: Shield,
      title: t("qualityCompliance"),
      description: t("qualityComplianceDesc"),
      color: "bg-emerald-600",
      border: "border-emerald-100",
      hoverBorder: "hover:border-emerald-300"
    },
    {
      icon: Users,
      title: t("partnershipSupport"),
      description: t("partnershipSupportDesc"),
      color: "bg-violet-600",
      border: "border-violet-100",
      hoverBorder: "hover:border-violet-300"
    }
  ];

  return (
    <div id="about_root" className="min-h-screen">
      {/* ===== HERO ===== */}
      <section id="about_hero" className="relative overflow-hidden bg-[#060d19] pt-28 pb-20 lg:pt-36 lg:pb-28">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-blue-600/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-violet-600/8 rounded-full blur-[120px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-primary/3 rounded-full blur-[150px]" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 mb-8 backdrop-blur-md">
              <Building2 className="w-4 h-4 text-blue-400" />
              <span className="text-lg text-white/60 font-medium">{t("ourStory")}</span>
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-white mb-6 leading-[1.08] tracking-tight"
              style={{ textWrap: "balance" }}
            >
              {t("pageTitle")}
            </h1>
            <p className="text-xl text-white/45 mb-10 max-w-2xl leading-relaxed font-light">
              {t("pageSubtitle")}
            </p>
            <div className="flex flex-wrap gap-3">
              {stats.map((stat, i) => (
                <span
                  key={i}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-lg text-white/50 font-light backdrop-blur-sm"
                >
                  <span className="font-semibold text-white/80">{stat.number}</span>{" "}
                  {stat.label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
      </section>

      {/* ===== STATS MOBILE ===== */}
      <section id="about_stats_mobile" className="lg:hidden py-12 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-2 gap-4">
            {stats.map((stat, i) => (
              <FadeIn key={i} delay={i * 100}>
                <div className="text-center p-5 bg-gray-50 rounded-md">
                  <div className="text-3xl font-bold text-text-primary mb-1">
                    {stat.animated === false ? stat.number : <AnimatedCounter target={stat.number} />}
                  </div>
                  <div className="text-lg text-text-secondary font-light">{stat.label}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ===== OUR STORY + GALLERY ===== */}
      <section id="about_story" className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            <FadeIn>
              <div>
                <p className="text-lg font-semibold text-primary mb-4 uppercase tracking-widest">{t("ourStory")}</p>
                <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-8 leading-tight" style={{ textWrap: "balance" }}>
                  {t("ourStory")}
                </h2>
                <div className="space-y-5 text-lg text-text-secondary leading-relaxed font-light">
                  <p>{t("ourStoryParagraph1")}</p>
                  <p>{t("ourStoryParagraph2")}</p>
                  <p>{t("ourStoryParagraph3")}</p>
                </div>
                <div className="flex items-center gap-3 mt-8 text-lg text-text-secondary font-light">
                  <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
                  <span><strong className="font-semibold text-text-primary">Main warehouse:</strong> 5 Rue des Enclos, 35350 La Gouesniere, France</span>
                </div>
              </div>
            </FadeIn>

            <FadeIn delay={200}>
              <div className="relative">
                <div className="absolute -inset-3 bg-gradient-to-tr from-primary/10 to-violet-500/10 rounded-md blur-2xl" />
                <div className="relative rounded-md overflow-hidden bg-black aspect-video">
                  <img
                    src={IMAGES[currentImageIndex]}
                    alt={t("warehouseFacilityAlt")}
                    className="w-full h-full object-contain transition-opacity duration-500 ease-in-out"
                    style={{ opacity: imgFade ? 1 : 0 }}
                  />
                  <button
                    onClick={goToPrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white/80 hover:bg-black/70 hover:text-white transition-all duration-300"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={goToNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white/80 hover:bg-black/70 hover:text-white transition-all duration-300"
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                    {IMAGES.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => { setImgFade(false); setTimeout(() => { setCurrentImageIndex(i); setImgFade(true); }, 300); }}
                        className={`h-2 rounded-full transition-all duration-500 ${i === currentImageIndex ? "bg-white w-6" : "bg-white/40 w-2 hover:bg-white/60"}`}
                        aria-label={`Go to image ${i + 1}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex justify-center">
                  <a
                    href="https://www.tiktok.com/@prepcenterfrance?lang=ro-RO"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-lg text-text-secondary hover:text-text-primary font-medium transition-colors duration-300"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46 6.28 6.28 0 001.82-4.46V8.77a8.18 8.18 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.2z" />
                    </svg>
                    Follow us on TikTok
                  </a>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ===== WHY IT MATTERS (DARK) ===== */}
      <section id="about_why_matters" className="py-20 lg:py-28 bg-[#060d19] relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <FadeIn>
              <div>
                <p className="text-lg font-semibold text-blue-400 mb-4 uppercase tracking-widest">Why Us</p>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-6 leading-tight" style={{ textWrap: "balance" }}>
                  {t("whyMattersTitle")}
                </h2>
                <p className="text-xl text-white/45 leading-relaxed font-light">
                  {t("whyMattersParagraph")}
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={200}>
              <div className="hidden lg:grid grid-cols-2 gap-4">
                {stats.map((stat, i) => (
                  <div key={i} className="group bg-white/5 border border-white/10 rounded-md p-6 hover:bg-white/10 hover:border-primary/20 transition-all duration-500">
                    <div className="w-12 h-12 rounded-md bg-white/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors duration-300">
                      <stat.icon className="w-6 h-6 text-white/80" />
                    </div>
                    <div className="text-3xl font-bold text-white mb-1">
                      <AnimatedCounter target={stat.number} />
                    </div>
                    <div className="text-lg text-white/40 font-light">{stat.label}</div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ===== VALUES ===== */}
      <section id="about_values" className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn>
            <div className="text-center mb-16">
              <p className="text-lg font-semibold text-primary mb-4 uppercase tracking-widest">Values</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-text-primary mb-5">{t("ourValues")}</h2>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {values.map((value, i) => (
              <FadeIn key={i} delay={i * 150}>
                <div className={`group relative bg-white rounded-md border ${value.border} ${value.hoverBorder} hover:shadow-xl transition-all duration-500 overflow-hidden h-full flex flex-col`}>
                  <div className={`h-1 ${value.color}`} />
                  <div className="p-8 flex flex-col flex-1">
                    <div className={`inline-flex items-center justify-center w-14 h-14 rounded-md ${value.color} mb-6 group-hover:scale-110 transition-transform duration-300`}>
                      <value.icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-text-primary mb-3">{value.title}</h3>
                    <p className="text-lg text-text-secondary leading-relaxed font-light">{value.description}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section id="about_cta" className="relative overflow-hidden py-20 lg:py-28 bg-[#060d19]">
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-500/8 rounded-full blur-[120px]" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-7 leading-tight" style={{ textWrap: "balance" }}>
              {t("readyPartner")}
            </h2>
            <p className="text-xl text-white/40 mb-12 max-w-2xl mx-auto leading-relaxed font-light">
              {t("joinCommunity")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href="/contact"
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-[#060d19] px-10 py-4 rounded-md font-semibold text-lg hover:bg-gray-100 transition-all duration-300 shadow-lg"
              >
                {t("getStartedToday")}
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
          </FadeIn>
        </div>
      </section>
    </div>
  );
}

export default About;

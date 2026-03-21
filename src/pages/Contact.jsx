import React, { useState, useEffect, useRef } from "react";
import {
  MapPin, Phone, Mail, MessageCircle, Calendar, ArrowRight,
  Clock, Send, Building2, Globe
} from "lucide-react";
import { useContactTranslation } from "../translations/contact";
import { useLanguage } from "../contexts/LanguageContext";

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

function Contact() {
  const { currentLanguage } = useLanguage();
  const { t } = useContactTranslation(currentLanguage);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    reason: "",
    otherDetails: "",
    message: "",
    phone: ""
  });
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg("");

    try {
      const response = await fetch("https://formspree.io/f/xandwobv", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setStatusMsg(t("successMessage"));
        setFormData({ name: "", email: "", company: "", reason: "", otherDetails: "", phone: "", message: "" });
      } else {
        const data = await response.json();
        if (Object.hasOwn(data, "errors")) {
          setStatusMsg(data["errors"].map(error => error["message"]).join(", "));
        } else {
          setStatusMsg(t("errorMessage"));
        }
      }
    } catch (error) {
      setStatusMsg(error.message || t("errorMessage"));
    }

    setLoading(false);
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const warehouses = [
    {
      id: "fr",
      title: t("contactFranceLabel"),
      address: t("contactFranceAddress"),
      phone: t("contactFrancePhone"),
      email: t("contactFranceEmail"),
      mapSrc: "https://www.google.com/maps?q=5+Rue+des+Enclos+35350+La+Gouesniere+France&output=embed",
      mapTitle: t("mapTitleFrance"),
      locationName: t("locationNameFrance"),
      locationAddress: t("locationAddressFrance"),
      locationDescription: t("locationDescriptionFrance")
    },
    {
      id: "de",
      title: t("contactGermanyLabel"),
      address: t("contactGermanyAddress"),
      phone: t("contactGermanyPhone"),
      email: t("contactGermanyEmail"),
      mapSrc: "https://www.google.com/maps?q=Zienestrasse+12+77709+Wolfach+Germany&output=embed",
      mapTitle: t("mapTitleGermany"),
      locationName: t("locationNameGermany"),
      locationAddress: t("locationAddressGermany"),
      locationDescription: t("locationDescriptionGermany")
    }
  ];

  const inputStyles = "w-full px-4 py-3.5 bg-white border border-gray-200 rounded-md text-lg text-text-primary placeholder:text-text-light focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-300 outline-none";
  const labelStyles = "block text-lg font-medium text-text-primary mb-2";

  return (
    <div id="contact_root" className="min-h-screen">
      {/* ===== HERO ===== */}
      <section id="contact_hero" className="relative overflow-hidden bg-[#060d19] pt-28 pb-20 lg:pt-36 lg:pb-28">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-blue-600/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-violet-600/8 rounded-full blur-[120px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-primary/3 rounded-full blur-[150px]" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 mb-8 backdrop-blur-md">
              <Mail className="w-4 h-4 text-blue-400" />
              <span className="text-lg text-white/60 font-medium">{t("quickContact")}</span>
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
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="https://wa.me/33675116218"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center gap-2 bg-[#25D366] text-white px-8 py-4 rounded-md font-semibold text-lg hover:bg-[#1ebe5d] transition-all duration-300 shadow-lg shadow-[#25D366]/20"
              >
                <MessageCircle className="w-5 h-5" />
                {t("chatWhatsApp")}
              </a>
              <a
                href="https://calendly.com/adrian-bucur/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-white/10 border border-white/20 text-white px-8 py-4 rounded-md font-semibold text-lg hover:bg-white/20 hover:border-white/30 transition-all duration-300 backdrop-blur-sm"
              >
                <Calendar className="w-5 h-5" />
                {t("bookZoomMeeting")}
              </a>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
      </section>

      {/* ===== FORM + CONTACT INFO ===== */}
      <section id="contact_form_section" className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            {/* Contact Form */}
            <FadeIn>
              <div>
                <p className="text-lg font-semibold text-primary mb-4 uppercase tracking-widest">Message</p>
                <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-8" style={{ textWrap: "balance" }}>
                  {t("sendMessage")}
                </h2>

                {statusMsg && (
                  <div className={`mb-8 px-5 py-4 rounded-md text-lg font-light ${
                    statusMsg.includes("succes") || statusMsg === t("successMessage")
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                      : "bg-red-50 border border-red-200 text-red-700"
                  }`}>
                    {statusMsg}
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="name" className={labelStyles}>{t("nameLabel")}</label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        className={inputStyles}
                        placeholder={t("namePlaceholder")}
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className={labelStyles}>{t("emailLabel")}</label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className={inputStyles}
                        placeholder={t("emailPlaceholder")}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="company" className={labelStyles}>{t("companyLabel")}</label>
                      <input
                        type="text"
                        id="company"
                        name="company"
                        value={formData.company}
                        onChange={handleChange}
                        className={inputStyles}
                        placeholder={t("companyPlaceholder")}
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className={labelStyles}>{t("phoneLabel")}</label>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className={inputStyles}
                        placeholder={t("phonePlaceholder")}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reason" className={labelStyles}>{t("reasonLabel")}</label>
                    <select
                      id="reason"
                      name="reason"
                      required
                      value={formData.reason}
                      onChange={handleChange}
                      className={inputStyles}
                    >
                      <option value="">{t("reasonPlaceholder")}</option>
                      <option value="Request a Quote">{t("reasonOptions")?.requestQuote || "Request a Quote"}</option>
                      <option value="General Inquiry">{t("reasonOptions")?.generalInquiry || "General Inquiry"}</option>
                      <option value="Technical Issue">{t("reasonOptions")?.technicalIssue || "Technical Issue"}</option>
                      <option value="Partnership Request">{t("reasonOptions")?.partnershipRequest || "Partnership Request"}</option>
                      <option value="Other">{t("reasonOptions")?.other || "Other"}</option>
                    </select>
                  </div>

                  {formData.reason === "Other" && (
                    <div>
                      <label htmlFor="otherDetails" className={labelStyles}>{t("otherDetailsLabel")}</label>
                      <input
                        type="text"
                        id="otherDetails"
                        name="otherDetails"
                        required
                        value={formData.otherDetails}
                        onChange={handleChange}
                        className={inputStyles}
                        placeholder={t("otherDetailsPlaceholder")}
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="message" className={labelStyles}>{t("messageLabel")}</label>
                    <textarea
                      id="message"
                      name="message"
                      required
                      rows={5}
                      value={formData.message}
                      onChange={handleChange}
                      className={inputStyles + " resize-none"}
                      placeholder={t("messagePlaceholder")}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="group w-full inline-flex items-center justify-center gap-2 bg-primary text-white py-4 px-8 rounded-md font-semibold text-lg hover:bg-primary-dark transition-all duration-300 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      t("sendingButton")
                    ) : (
                      <>
                        {t("sendButton")}
                        <Send className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </FadeIn>

            {/* Contact Info Side */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <FadeIn delay={100}>
                <div className="bg-[#060d19] rounded-md p-8 relative overflow-hidden">
                  <div className="absolute inset-0">
                    <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/8 rounded-full blur-[80px]" />
                    <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-violet-500/8 rounded-full blur-[80px]" />
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-2xl font-semibold text-white mb-6">{t("quickContact")}</h3>
                    <div className="space-y-4">
                      <a
                        href="https://wa.me/33675116218"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center w-full bg-[#25D366] text-white py-4 px-6 rounded-md font-semibold text-lg hover:bg-[#1ebe5d] transition-all duration-300 shadow-lg shadow-[#25D366]/20"
                      >
                        <MessageCircle className="w-5 h-5 mr-2" />
                        {t("chatWhatsApp")}
                      </a>
                      <a
                        href="https://calendly.com/adrian-bucur/30min"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center w-full bg-white/10 border border-white/20 text-white py-4 px-6 rounded-md font-semibold text-lg hover:bg-white/20 hover:border-white/30 transition-all duration-300"
                      >
                        <Calendar className="w-5 h-5 mr-2" />
                        {t("bookZoomMeeting")}
                      </a>
                    </div>
                  </div>
                </div>
              </FadeIn>

              {/* Warehouse Cards */}
              {warehouses.map((entry, i) => (
                <FadeIn key={entry.id} delay={200 + i * 100}>
                  <div className="group bg-white rounded-md border border-gray-100 hover:border-gray-200 hover:shadow-xl transition-all duration-500 overflow-hidden">
                    <div className="h-1 bg-blue-600" />
                    <div className="p-6">
                      <p className="text-lg uppercase tracking-[0.12em] text-primary font-semibold mb-4">
                        {entry.title}
                      </p>
                      <div className="space-y-4">
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                            <MapPin className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-lg font-medium text-text-primary">{t("addressLabel")}</p>
                            <p className="text-lg text-text-secondary font-light whitespace-pre-line">{entry.address}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                            <Phone className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-lg font-medium text-text-primary">{t("phoneLabel")}</p>
                            <p className="text-lg text-text-secondary font-light">{entry.phone}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                            <Mail className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-lg font-medium text-text-primary">{t("emailLabel")}</p>
                            <p className="text-lg text-text-secondary font-light">{entry.email}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </FadeIn>
              ))}

              {/* Business Hours */}
              <FadeIn delay={450}>
                <div className="bg-gray-50 rounded-md border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-text-primary">{t("businessHours")}</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg text-text-secondary font-light">{t("mondayFriday")}</span>
                      <span className="text-lg text-text-primary font-semibold">{t("mondayFridayHours")}</span>
                    </div>
                    <div className="h-px bg-gray-200" />
                    <div className="flex justify-between items-center">
                      <span className="text-lg text-text-secondary font-light">{t("saturday")}</span>
                      <span className="text-lg text-text-primary font-semibold">{t("saturdayHours")}</span>
                    </div>
                    <div className="h-px bg-gray-200" />
                    <div className="flex justify-between items-center">
                      <span className="text-lg text-text-secondary font-light">{t("sunday")}</span>
                      <span className="text-lg text-text-primary font-semibold">{t("sundayHours")}</span>
                    </div>
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      {/* ===== MAP SECTION (DARK) ===== */}
      <section id="contact_maps" className="py-20 lg:py-28 bg-[#060d19] relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn>
            <div className="text-center mb-16">
              <p className="text-lg font-semibold text-blue-400 mb-4 uppercase tracking-widest">Locations</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-5">
                {t("ourLocations") || t("ourLocation")}
              </h2>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {warehouses.map((loc, i) => (
              <FadeIn key={loc.id} delay={i * 150}>
                <div className="group rounded-md overflow-hidden bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/8 transition-all duration-500">
                  <div className="aspect-video w-full">
                    <iframe
                      src={loc.mapSrc}
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      allowFullScreen=""
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      title={loc.mapTitle}
                      className="w-full h-full"
                    ></iframe>
                  </div>
                  <div className="flex items-start gap-4 px-6 py-5">
                    <div className="flex-shrink-0 w-10 h-10 rounded-md bg-white/10 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white">{loc.locationName}</p>
                      <p className="text-lg text-white/50 font-light">{loc.locationAddress}</p>
                      <p className="text-lg text-white/35 font-light">{loc.locationDescription}</p>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section id="contact_cta" className="relative overflow-hidden py-20 lg:py-28 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <p className="text-lg font-semibold text-primary mb-4 uppercase tracking-widest">Get Started</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-text-primary mb-7 leading-tight" style={{ textWrap: "balance" }}>
              {t("pageTitle")}
            </h2>
            <p className="text-xl text-text-secondary mb-12 max-w-2xl mx-auto leading-relaxed font-light">
              {t("pageSubtitle")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href="https://wa.me/33675116218"
                target="_blank"
                rel="noopener noreferrer"
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#25D366] text-white px-10 py-4 rounded-md font-semibold text-lg hover:bg-[#1ebe5d] transition-all duration-300 shadow-lg shadow-[#25D366]/20"
              >
                <MessageCircle className="w-5 h-5" />
                {t("chatWhatsApp")}
              </a>
              <a
                href="https://calendly.com/adrian-bucur/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-white px-10 py-4 rounded-md font-semibold text-lg hover:bg-primary-dark transition-all duration-300 shadow-lg shadow-primary/20"
              >
                <Calendar className="w-5 h-5" />
                {t("bookZoomMeeting")}
              </a>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}

export default Contact;

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate, Link } from "react-router-dom";
import { Globe, Package, FileText, CreditCard, Truck, Smartphone, Check, Zap, Shield, Sparkles, User, Building2, Heart, ArrowRight, Clock, Settings } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { cn } from "@/lib/utils";

export default function Landing() {
  const [language, setLanguage] = useState<"en" | "ro">("ro");
  const [businessType, setBusinessType] = useState<"pf" | "srl">("pf");
  const navigate = useNavigate();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      navigate("/auth", { replace: true });
    }
  }, [navigate]);

  const content = {
    en: {
      hero: {
        title: "Sell Online.",
        titleHighlight: "Zero Hassle.",
        subtitle: "No contracts. No tech skills needed. Just your products and customers. We handle everything else.",
        cta: "Get Started Free",
        ctaSecondary: "See How It Works"
      },
      features: {
        title: "Why SpeedVendors?",
        cards: [
          { icon: Truck, title: "No Delivery Contracts", desc: "Compare prices & choose the cheapest courier each time. Works for everyone!", color: "from-orange-500 to-amber-500" },
          { icon: Zap, title: "We Build It For You", desc: "One-time setup fee. You don't touch any code. Ever.", color: "from-violet-500 to-purple-500" },
          { icon: Smartphone, title: "Manage From Your Phone", desc: "Orders, products, deliveries - all from one simple app", color: "from-cyan-500 to-blue-500" },
          { icon: Shield, title: "Made for Romania", desc: "Local payments, local invoicing, local couriers", color: "from-emerald-500 to-green-500" }
        ]
      },
      comparison: {
        title: "Individual or Company?",
        subtitle: "SpeedVendors works for both!",
        pf: {
          title: "Without a Company",
          subtitle: "Perfect for individuals selling locally",
          features: [
            "Your own online store",
            "Organized order management",
            "Compare & choose cheapest courier",
            "No delivery contracts needed",
            "Cash on delivery"
          ]
        },
        srl: {
          title: "With a Company",
          subtitle: "Full business features unlocked",
          features: [
            "Everything from Individual plan",
            "Netopia online card payments",
            "Oblio.eu invoicing (FREE first 365 days!)",
            "Automatic VAT handling",
            "Professional receipts & documents"
          ]
        }
      },
      noTech: {
        title: "Zero Tech Knowledge Required",
        subtitle: "We do everything for you",
        points: [
          { icon: Settings, text: "We build your entire store" },
          { icon: Sparkles, text: "We set up your products" },
          { icon: Heart, text: "We configure payments & delivery" },
          { icon: Clock, text: "One-time setup, then you're ready" }
        ],
        conclusion: "You just manage your orders. That's it."
      },
      pricing: {
        title: "Simple, Transparent Pricing",
        subtitle: "No hidden fees. No sales commission.",
        pf: {
          title: "Individual",
          subtitle: "No company needed",
          setup: "100–150 €",
          setupLabel: "One-time setup",
          monthly: "25 €",
          monthlyLabel: "/month",
          features: ["Complete store setup", "Hosting included", "Delivery integration", "Order management app"]
        },
        srl: {
          title: "Company",
          subtitle: "LLC / Sole Proprietor",
          setup: "250–400 €",
          setupLabel: "One-time setup",
          monthly: "29–39 €",
          monthlyLabel: "/month",
          features: ["Everything in Individual", "Netopia payments", "Oblio invoicing", "VAT automation"],
          badge: "Most Popular"
        }
      },
      cta: {
        title: "Ready to Start Selling?",
        subtitle: "No tech skills. No contracts. Just you and your customers.",
        button: "Request a Demo"
      },
      footer: {
        rights: "All rights reserved."
      }
    },
    ro: {
      hero: {
        title: "Vinde Online.",
        titleHighlight: "Fără Bătăi de Cap.",
        subtitle: "Fără contracte. Fără cunoștințe tehnice. Tu ai produsele și clienții. Noi facem restul.",
        cta: "Începe Gratuit",
        ctaSecondary: "Vezi Cum Funcționează"
      },
      features: {
        title: "De Ce SpeedVendors?",
        cards: [
          { icon: Truck, title: "Fără Contracte Curier", desc: "Compară prețuri și alege cel mai ieftin curier de fiecare dată!", color: "from-orange-500 to-amber-500" },
          { icon: Zap, title: "Noi Construim Totul", desc: "O singură taxă de setup. Tu nu atingi niciun cod. Niciodată.", color: "from-violet-500 to-purple-500" },
          { icon: Smartphone, title: "Gestionezi de pe Telefon", desc: "Comenzi, produse, livrări - totul dintr-o aplicație simplă", color: "from-cyan-500 to-blue-500" },
          { icon: Shield, title: "Făcut pentru România", desc: "Plăți locale, facturare locală, curieri locali", color: "from-emerald-500 to-green-500" }
        ]
      },
      comparison: {
        title: "Persoană Fizică sau Firmă?",
        subtitle: "SpeedVendors funcționează pentru ambele!",
        pf: {
          title: "Fără Firmă",
          subtitle: "Perfect pentru vânzători locali",
          features: [
            "Magazinul tău online propriu",
            "Gestionare comenzi organizată",
            "Compară & alege cel mai ieftin curier",
            "Fără contracte de livrare",
            "Plată la livrare (ramburs)"
          ]
        },
        srl: {
          title: "Cu Firmă",
          subtitle: "Toate funcțiile de business deblocate",
          features: [
            "Tot ce e în pachetul Individual",
            "Plăți online cu cardul Netopia",
            "Facturare Oblio.eu (GRATIS primul an!)",
            "Gestionare automată TVA",
            "Facturi și documente profesionale"
          ]
        }
      },
      noTech: {
        title: "Zero Cunoștințe Tehnice Necesare",
        subtitle: "Noi facem totul pentru tine",
        points: [
          { icon: Settings, text: "Noi construim tot magazinul" },
          { icon: Sparkles, text: "Noi configurăm produsele tale" },
          { icon: Heart, text: "Noi setăm plățile și livrarea" },
          { icon: Clock, text: "Un singur setup, apoi ești gata" }
        ],
        conclusion: "Tu doar gestionezi comenzile. Atât."
      },
      pricing: {
        title: "Prețuri Simple și Transparente",
        subtitle: "Fără costuri ascunse. Fără comision pe vânzări.",
        pf: {
          title: "Individual",
          subtitle: "Fără firmă necesară",
          setup: "100–150 €",
          setupLabel: "Setup unic",
          monthly: "25 €",
          monthlyLabel: "/lună",
          features: ["Setup complet magazin", "Hosting inclus", "Integrare livrare", "Aplicație gestionare comenzi"]
        },
        srl: {
          title: "Firmă",
          subtitle: "SRL / PFA",
          setup: "250–400 €",
          setupLabel: "Setup unic",
          monthly: "29–39 €",
          monthlyLabel: "/lună",
          features: ["Tot din Individual", "Plăți Netopia", "Facturare Oblio", "Automatizare TVA"],
          badge: "Cel Mai Popular"
        }
      },
      cta: {
        title: "Gata să Începi să Vinzi?",
        subtitle: "Fără cunoștințe tehnice. Fără contracte. Doar tu și clienții tăi.",
        button: "Cere un Demo"
      },
      footer: {
        rights: "Toate drepturile rezervate."
      }
    }
  };

  const t = content[language];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Decorative background elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br from-violet-500/20 to-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-0 w-80 h-80 bg-gradient-to-bl from-cyan-500/15 to-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-0 w-72 h-72 bg-gradient-to-tr from-orange-500/15 to-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-tl from-emerald-500/15 to-green-500/10 rounded-full blur-3xl" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <span className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
            SpeedVendors
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLanguage(language === "en" ? "ro" : "en")}
            className="gap-2 hover:bg-primary/10"
          >
            <Globe className="h-4 w-4" />
            {language === "en" ? "RO" : "EN"}
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-4">
        <div className="container mx-auto max-w-5xl text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 text-sm font-medium text-violet-600 dark:text-violet-400 animate-fade-in">
            <Sparkles className="h-4 w-4" />
            {language === "ro" ? "Platforma #1 pentru vânzători din România" : "#1 Platform for Romanian Sellers"}
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold leading-tight animate-fade-in [animation-delay:100ms]">
            {t.hero.title}
            <span className="block bg-gradient-to-r from-violet-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
              {t.hero.titleHighlight}
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto animate-fade-in [animation-delay:200ms]">
            {t.hero.subtitle}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6 animate-fade-in [animation-delay:300ms]">
            <Button 
              size="lg" 
              onClick={() => navigate("/auth")} 
              className="text-lg px-8 py-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/25"
            >
              {t.hero.cta}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={() => navigate("/auth")} 
              className="text-lg px-8 py-6 border-2 hover:bg-primary/5"
            >
              {t.hero.ctaSecondary}
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-24 px-4">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16 animate-fade-in">
            {t.features.title}
          </h2>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {t.features.cards.map((card, i) => (
              <div 
                key={i} 
                className="group relative p-6 bg-card/50 backdrop-blur-sm rounded-3xl border border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 animate-fade-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className={cn(
                  "h-14 w-14 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white mb-5 shadow-lg",
                  card.color
                )}>
                  <card.icon className="h-7 w-7" />
                </div>
                <h3 className="font-bold text-xl mb-2">{card.title}</h3>
                <p className="text-muted-foreground">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Individual vs Company Comparison */}
      <section className="relative py-24 px-4 bg-gradient-to-b from-muted/30 to-transparent">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 animate-fade-in">{t.comparison.title}</h2>
            <p className="text-xl text-muted-foreground animate-fade-in [animation-delay:100ms]">{t.comparison.subtitle}</p>
          </div>
          
          {/* Toggle */}
          <div className="flex justify-center mb-10 animate-fade-in [animation-delay:200ms]">
            <div className="inline-flex bg-muted/50 backdrop-blur-sm rounded-full p-1.5 border border-border/50">
              <button
                onClick={() => setBusinessType("pf")}
                className={cn(
                  "px-6 py-3 rounded-full text-sm font-semibold transition-all duration-300",
                  businessType === "pf" 
                    ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <User className="h-4 w-4 inline mr-2" />
                {language === "ro" ? "Persoană Fizică" : "Individual"}
              </button>
              <button
                onClick={() => setBusinessType("srl")}
                className={cn(
                  "px-6 py-3 rounded-full text-sm font-semibold transition-all duration-300",
                  businessType === "srl" 
                    ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/25" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Building2 className="h-4 w-4 inline mr-2" />
                {language === "ro" ? "Firmă" : "Company"}
              </button>
            </div>
          </div>

          {/* Comparison Card */}
          <div className="max-w-lg mx-auto animate-fade-in [animation-delay:300ms]">
            <div className={cn(
              "relative rounded-3xl p-8 border-2 transition-all duration-500",
              businessType === "pf" 
                ? "bg-gradient-to-br from-orange-500/5 to-amber-500/5 border-orange-500/30" 
                : "bg-gradient-to-br from-violet-500/5 to-purple-500/5 border-violet-500/30"
            )}>
              <div className="text-center mb-8">
                <div className={cn(
                  "inline-flex h-16 w-16 rounded-2xl items-center justify-center text-white mb-4 shadow-lg",
                  businessType === "pf" 
                    ? "bg-gradient-to-br from-orange-500 to-amber-500" 
                    : "bg-gradient-to-br from-violet-500 to-purple-500"
                )}>
                  {businessType === "pf" ? <User className="h-8 w-8" /> : <Building2 className="h-8 w-8" />}
                </div>
                <h3 className="text-2xl font-bold">
                  {businessType === "pf" ? t.comparison.pf.title : t.comparison.srl.title}
                </h3>
                <p className="text-muted-foreground">
                  {businessType === "pf" ? t.comparison.pf.subtitle : t.comparison.srl.subtitle}
                </p>
              </div>
              
              <ul className="space-y-4">
                {(businessType === "pf" ? t.comparison.pf.features : t.comparison.srl.features).map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                      businessType === "pf" 
                        ? "bg-orange-500/20 text-orange-600" 
                        : "bg-violet-500/20 text-violet-600"
                    )}>
                      <Check className="h-4 w-4" />
                    </div>
                    <span className="text-lg">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* No Tech Section */}
      <section className="relative py-24 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 animate-fade-in">
              <span className="bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
                {t.noTech.title}
              </span>
            </h2>
            <p className="text-xl text-muted-foreground animate-fade-in [animation-delay:100ms]">{t.noTech.subtitle}</p>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-6 mb-12">
            {t.noTech.points.map((point, i) => (
              <div 
                key={i} 
                className="flex items-center gap-4 p-5 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 rounded-2xl border border-cyan-500/20 animate-fade-in"
                style={{ animationDelay: `${(i + 2) * 100}ms` }}
              >
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25 shrink-0">
                  <point.icon className="h-6 w-6" />
                </div>
                <span className="font-medium text-lg">{point.text}</span>
              </div>
            ))}
          </div>
          
          <p className="text-center text-2xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent animate-fade-in [animation-delay:600ms]">
            {t.noTech.conclusion}
          </p>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="relative py-24 px-4 bg-gradient-to-b from-muted/30 to-transparent">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 animate-fade-in">{t.pricing.title}</h2>
            <p className="text-xl text-muted-foreground animate-fade-in [animation-delay:100ms]">{t.pricing.subtitle}</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Individual Package */}
            <div className="relative bg-card/50 backdrop-blur-sm rounded-3xl border border-border/50 p-8 animate-fade-in [animation-delay:200ms] hover:shadow-xl transition-all duration-300">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white mb-6 shadow-lg shadow-orange-500/25">
                <User className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold mb-1">{t.pricing.pf.title}</h3>
              <p className="text-muted-foreground mb-6">{t.pricing.pf.subtitle}</p>
              
              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-4xl font-bold">{t.pricing.pf.setup}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t.pricing.pf.setupLabel}</p>
              </div>
              
              <div className="flex items-baseline gap-1 mb-8 p-4 bg-muted/50 rounded-xl">
                <span className="text-2xl font-bold">{t.pricing.pf.monthly}</span>
                <span className="text-muted-foreground">{t.pricing.pf.monthlyLabel}</span>
              </div>
              
              <ul className="space-y-3">
                {t.pricing.pf.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <div className="h-5 w-5 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-600">
                      <Check className="h-3 w-3" />
                    </div>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company Package */}
            <div className="relative bg-card/50 backdrop-blur-sm rounded-3xl border-2 border-violet-500/50 p-8 animate-fade-in [animation-delay:300ms] hover:shadow-xl transition-all duration-300 shadow-lg shadow-violet-500/10">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white text-sm font-semibold rounded-full shadow-lg">
                {t.pricing.srl.badge}
              </div>
              
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white mb-6 shadow-lg shadow-violet-500/25">
                <Building2 className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold mb-1">{t.pricing.srl.title}</h3>
              <p className="text-muted-foreground mb-6">{t.pricing.srl.subtitle}</p>
              
              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-4xl font-bold">{t.pricing.srl.setup}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t.pricing.srl.setupLabel}</p>
              </div>
              
              <div className="flex items-baseline gap-1 mb-8 p-4 bg-violet-500/10 rounded-xl border border-violet-500/20">
                <span className="text-2xl font-bold">{t.pricing.srl.monthly}</span>
                <span className="text-muted-foreground">{t.pricing.srl.monthlyLabel}</span>
              </div>
              
              <ul className="space-y-3">
                {t.pricing.srl.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <div className="h-5 w-5 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-600">
                      <Check className="h-3 w-3" />
                    </div>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="relative rounded-3xl p-12 bg-gradient-to-r from-violet-600 via-purple-600 to-cyan-600 text-white text-center overflow-hidden shadow-2xl shadow-violet-500/30">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiIHN0cm9rZS13aWR0aD0iMiIvPjwvZz48L3N2Zz4=')] opacity-30" />
            
            <div className="relative z-10 space-y-6">
              <h2 className="text-4xl md:text-5xl font-bold">{t.cta.title}</h2>
              <p className="text-xl text-white/80 max-w-xl mx-auto">{t.cta.subtitle}</p>
              <Button
                size="lg"
                onClick={() => navigate("/auth")}
                className="text-lg px-10 py-6 bg-white text-violet-600 hover:bg-white/90 shadow-xl font-semibold"
              >
                {t.cta.button}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 bg-muted/20">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground">SpeedVendors</p>
          <p>© 2025 SpeedVendors. {t.footer.rights}</p>
          <Link to="/privacy-policy" className="text-primary hover:underline">
            {language === "ro" ? "Politica de Confidențialitate" : "Privacy Policy"}
          </Link>
        </div>
      </footer>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Globe, Package, FileText, CreditCard, Truck, Smartphone, Check, X, MessageSquare, Clock, MapPin, ShoppingBag, Flower2, Instagram, Building2, User } from "lucide-react";
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
        title: "A simple online store for local sellers in Romania",
        subtitle: "Receive orders in one place, deliver easily, and enable card payments & invoices when you have a company.",
        cta: "Request a demo",
        ctaSecondary: "See how it works"
      },
      problem: {
        title: "The Problem",
        points: [
          { icon: MessageSquare, text: "Take orders via Instagram or WhatsApp" },
          { icon: X, text: "Lose messages and make mistakes" },
          { icon: Clock, text: "Don't have a clear delivery flow" },
          { icon: Package, text: "Are overwhelmed by complex platforms" }
        ],
        intro: "Most small sellers:"
      },
      solution: {
        title: "The Solution",
        subtitle: "SpeedVendors brings your entire selling process into one simple dashboard.",
        cards: [
          { icon: FileText, title: "Organized orders", desc: "All orders in one place" },
          { icon: Truck, title: "Personal delivery or courier", desc: "No contract required" },
          { icon: CreditCard, title: "Card payments", desc: "For companies" },
          { icon: Smartphone, title: "Mobile & web app", desc: "Work from anywhere" }
        ]
      },
      audience: {
        title: "Who is SpeedVendors for",
        items: [
          { icon: Flower2, text: "Local flower shops" },
          { icon: Instagram, text: "Instagram / TikTok sellers" },
          { icon: MapPin, text: "Individuals delivering locally" },
          { icon: Building2, text: "Small companies needing invoices & card payments" }
        ]
      },
      comparison: {
        title: "Individual vs Company",
        pf: {
          title: "Without a company (Individual)",
          features: ["Online store", "Order management", "Personal delivery / eAWB", "Cash on delivery"]
        },
        srl: {
          title: "With a company (LLC / Sole Prop)",
          features: ["Everything above", "Online card payments", "Automatic invoicing", "VAT (if applicable)"]
        }
      },
      whyNot: {
        title: "Why not Shopify?",
        subtitle: "Shopify is not built for Romania:",
        points: ["No local invoicing", "No local payments", "No local couriers"],
        conclusion: "SpeedVendors is designed specifically for the Romanian market."
      },
      pricing: {
        title: "Simple Pricing",
        pf: {
          title: "Individual Package",
          setup: "Setup: 100–150 €",
          monthly: "Monthly: 25 €"
        },
        srl: {
          title: "Company Package",
          setup: "Setup: 250–400 €",
          monthly: "Monthly: 29–39 €"
        },
        notes: ["Hosting included", "No sales commission"]
      },
      cta: {
        title: "Ready to sell in a simpler way?",
        button: "Request a demo"
      },
      footer: {
        rights: "All rights reserved."
      }
    },
    ro: {
      hero: {
        title: "Magazin online simplu pentru vânzători din România",
        subtitle: "Primești comenzi organizat, livrezi ușor și poți activa plăți cu cardul și facturi atunci când ai firmă.",
        cta: "Cere un demo",
        ctaSecondary: "Vezi cum funcționează"
      },
      problem: {
        title: "Problema",
        points: [
          { icon: MessageSquare, text: "Iau comenzi în DM sau WhatsApp" },
          { icon: X, text: "Pierd mesaje și greșesc comenzi" },
          { icon: Clock, text: "Nu au livrare organizată" },
          { icon: Package, text: "Sunt blocați de platforme complicate" }
        ],
        intro: "Majoritatea vânzătorilor mici din România:"
      },
      solution: {
        title: "Soluția",
        subtitle: "SpeedVendors adună tot procesul de vânzare într-un singur loc.",
        cards: [
          { icon: FileText, title: "Comenzi organizate", desc: "Totul într-un singur loc" },
          { icon: Truck, title: "Livrare personală sau curier", desc: "Fără contract" },
          { icon: CreditCard, title: "Plăți cu cardul", desc: "Pentru firme" },
          { icon: Smartphone, title: "Aplicație mobil + web", desc: "Lucrezi de oriunde" }
        ]
      },
      audience: {
        title: "Pentru cine este SpeedVendors",
        items: [
          { icon: Flower2, text: "Florării locale" },
          { icon: Instagram, text: "Vânzători Instagram / TikTok" },
          { icon: MapPin, text: "Persoane fizice care livrează local" },
          { icon: Building2, text: "Firme mici care vor facturi și card" }
        ]
      },
      comparison: {
        title: "Persoană Fizică vs Firmă",
        pf: {
          title: "Fără firmă (PF)",
          features: ["Magazin online", "Preluare comenzi", "Livrare personală / eAWB", "Plată la livrare"]
        },
        srl: {
          title: "Cu firmă (SRL / PFA)",
          features: ["Tot ce este mai sus", "Plată online cu cardul", "Facturare automată", "TVA (dacă e cazul)"]
        }
      },
      whyNot: {
        title: "De ce nu Shopify?",
        subtitle: "Shopify nu este făcut pentru România:",
        points: ["Fără facturi RO", "Fără plăți locale", "Fără curieri integrați"],
        conclusion: "SpeedVendors este construit special pentru piața locală."
      },
      pricing: {
        title: "Prețuri Simple",
        pf: {
          title: "Pachet PF",
          setup: "Setup: 100–150 €",
          monthly: "Lunar: 25 €"
        },
        srl: {
          title: "Pachet SRL / PFA",
          setup: "Setup: 250–400 €",
          monthly: "Lunar: 29–39 €"
        },
        notes: ["Hosting inclus", "Fără comision pe vânzări"]
      },
      cta: {
        title: "Gata să vinzi mai organizat?",
        button: "Cere un demo"
      },
      footer: {
        rights: "Toate drepturile rezervate."
      }
    }
  };

  const t = content[language];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Language Toggle */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-primary">SpeedVendors</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLanguage(language === "en" ? "ro" : "en")}
            className="gap-2"
          >
            <Globe className="h-4 w-4" />
            {language === "en" ? "RO" : "EN"}
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-4xl text-center space-y-8">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight animate-fade-in">
            {t.hero.title}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in [animation-delay:100ms]">
            {t.hero.subtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4 animate-fade-in [animation-delay:200ms]">
            <Button size="lg" onClick={() => navigate("/auth")} className="text-lg px-8 py-6">
              {t.hero.cta}
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/auth")} className="text-lg px-8 py-6">
              {t.hero.ctaSecondary}
            </Button>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">{t.problem.title}</h2>
          <p className="text-center text-muted-foreground mb-12">{t.problem.intro}</p>
          <div className="grid md:grid-cols-2 gap-6">
            {t.problem.points.map((point, i) => (
              <div 
                key={i} 
                className="flex items-center gap-4 p-4 bg-background rounded-xl border border-border animate-fade-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
                  <point.icon className="h-5 w-5" />
                </div>
                <span className="text-foreground">{point.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">{t.solution.title}</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">{t.solution.subtitle}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {t.solution.cards.map((card, i) => (
              <div 
                key={i} 
                className="p-6 bg-card rounded-2xl border border-border hover:shadow-lg hover:scale-105 transition-all duration-200 animate-fade-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                  <card.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-lg mb-1">{card.title}</h3>
                <p className="text-sm text-muted-foreground">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audience Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">{t.audience.title}</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {t.audience.items.map((item, i) => (
              <div 
                key={i} 
                className="flex items-center gap-4 p-5 bg-background rounded-xl border border-border animate-fade-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <item.icon className="h-6 w-6" />
                </div>
                <span className="font-medium">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PF vs SRL Comparison */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">{t.comparison.title}</h2>
          
          {/* Toggle */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex bg-muted rounded-full p-1">
              <button
                onClick={() => setBusinessType("pf")}
                className={cn(
                  "px-6 py-2 rounded-full text-sm font-medium transition-all",
                  businessType === "pf" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <User className="h-4 w-4 inline mr-2" />
                {language === "ro" ? "Persoană Fizică" : "Individual"}
              </button>
              <button
                onClick={() => setBusinessType("srl")}
                className={cn(
                  "px-6 py-2 rounded-full text-sm font-medium transition-all",
                  businessType === "srl" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Building2 className="h-4 w-4 inline mr-2" />
                {language === "ro" ? "Firmă" : "Company"}
              </button>
            </div>
          </div>

          {/* Comparison Cards */}
          <div className="max-w-md mx-auto">
            <div className="bg-card rounded-2xl border border-border p-8 animate-fade-in">
              <h3 className="text-xl font-bold mb-6 text-center">
                {businessType === "pf" ? t.comparison.pf.title : t.comparison.srl.title}
              </h3>
              <ul className="space-y-4">
                {(businessType === "pf" ? t.comparison.pf.features : t.comparison.srl.features).map((feature, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <Check className="h-4 w-4" />
                    </div>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Why Not Shopify */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.whyNot.title}</h2>
          <p className="text-muted-foreground mb-8">{t.whyNot.subtitle}</p>
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            {t.whyNot.points.map((point, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-full text-sm">
                <X className="h-4 w-4" />
                <span>{point}</span>
              </div>
            ))}
          </div>
          <p className="text-lg font-medium text-primary">{t.whyNot.conclusion}</p>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">{t.pricing.title}</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {/* PF Package */}
            <div className="bg-card rounded-2xl border border-border p-8 animate-fade-in">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-6">{t.pricing.pf.title}</h3>
              <div className="space-y-2 mb-6">
                <p className="text-2xl font-bold">{t.pricing.pf.setup}</p>
                <p className="text-lg text-muted-foreground">{t.pricing.pf.monthly}</p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                {t.pricing.notes.map((note, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SRL Package */}
            <div className="bg-card rounded-2xl border-2 border-primary p-8 relative animate-fade-in [animation-delay:100ms]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-medium">
                {language === "ro" ? "Recomandat" : "Recommended"}
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-6">{t.pricing.srl.title}</h3>
              <div className="space-y-2 mb-6">
                <p className="text-2xl font-bold">{t.pricing.srl.setup}</p>
                <p className="text-lg text-muted-foreground">{t.pricing.srl.monthly}</p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                {t.pricing.notes.map((note, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 bg-primary text-primary-foreground">
        <div className="container mx-auto max-w-3xl text-center space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold">{t.cta.title}</h2>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => navigate("/auth")}
            className="text-lg px-12 py-6 animate-pulse"
          >
            {t.cta.button}
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground">SpeedVendors</p>
          <p>© 2025 SpeedVendors. {t.footer.rights}</p>
          <button 
            onClick={() => navigate("/privacy")}
            className="text-primary hover:underline"
          >
            {language === "en" ? "Privacy Policy" : "Politica de Confidențialitate"}
          </button>
        </div>
      </footer>
    </div>
  );
}

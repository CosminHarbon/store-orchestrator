import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Globe, Package, FileText, CreditCard, TrendingUp, Shield } from "lucide-react";
import { Capacitor } from "@capacitor/core";

export default function Landing() {
  const [language, setLanguage] = useState<"en" | "ro">("en");
  const navigate = useNavigate();

  // Redirect to auth page on native iOS/Android apps (skip landing page)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      navigate("/auth", { replace: true });
    }
  }, [navigate]);

  const content = {
    en: {
      hero: {
        title: "Simplify Your E-Commerce Business",
        subtitle: "All-in-one platform for small to mid-sized online stores",
        mission: "Our mission is to empower store owners with professional tools without complexity. Manage products, orders, shipping, invoicing, and payments in one place - no contracts, no hidden fees, just simple pricing.",
        cta: "Access Platform",
        login: "Log In"
      },
      features: {
        title: "Everything You Need to Succeed",
        delivery: {
          title: "Smart Delivery",
          desc: "Integrated eAWB.ro - no contracts, instant AWB generation"
        },
        invoicing: {
          title: "Free Invoicing",
          desc: "Oblio.eu integration - FREE for first 365 days"
        },
        payments: {
          title: "Low Payment Fees",
          desc: "Netopia processor - 0.9% or lower based on volume"
        },
        pricing: {
          title: "Transparent Pricing",
          desc: "€12/month - no hidden fees, no surprises"
        },
        simple: {
          title: "No Hassle Setup",
          desc: "Get started in minutes, not days"
        },
        support: {
          title: "Dedicated Support",
          desc: "We're here to help your business grow"
        }
      },
      pricing: {
        title: "Simple, Transparent Pricing",
        monthly: "€12/month",
        features: [
          "Full platform access",
          "Unlimited products",
          "eAWB.ro integration",
          "365 days FREE Oblio invoicing",
          "Netopia payments (0.9%)",
          "No hidden fees",
          "24/7 support"
        ]
      },
      footer: {
        ready: "Ready to grow your business?",
        cta: "Get Started Today"
      }
    },
    ro: {
      hero: {
        title: "Simplifică-ți Afacerea Online",
        subtitle: "Platformă all-in-one pentru magazine online mici și medii",
        mission: "Misiunea noastră este să oferim proprietarilor de magazine instrumente profesionale fără complexitate. Gestionează produse, comenzi, livrări, facturare și plăți într-un singur loc - fără contracte, fără taxe ascunse, doar prețuri simple.",
        cta: "Acces Platformă",
        login: "Autentificare"
      },
      features: {
        title: "Tot Ce Ai Nevoie Pentru Succes",
        delivery: {
          title: "Livrare Inteligentă",
          desc: "Integrare eAWB.ro - fără contracte, generare AWB instantă"
        },
        invoicing: {
          title: "Facturare Gratuită",
          desc: "Integrare Oblio.eu - GRATUIT primele 365 de zile"
        },
        payments: {
          title: "Comisioane Mici",
          desc: "Procesor Netopia - 0.9% sau mai puțin în funcție de volum"
        },
        pricing: {
          title: "Prețuri Transparente",
          desc: "€12/lună - fără taxe ascunse, fără surprize"
        },
        simple: {
          title: "Configurare Rapidă",
          desc: "Pornește în câteva minute, nu zile"
        },
        support: {
          title: "Suport Dedicat",
          desc: "Suntem aici să te ajutăm să crești"
        }
      },
      pricing: {
        title: "Prețuri Simple și Transparente",
        monthly: "€12/lună",
        features: [
          "Acces complet platformă",
          "Produse nelimitate",
          "Integrare eAWB.ro",
          "365 zile facturare Oblio GRATUIT",
          "Plăți Netopia (0.9%)",
          "Fără taxe ascunse",
          "Suport 24/7"
        ]
      },
      footer: {
        ready: "Pregătit să-ți crești afacerea?",
        cta: "Începe Astăzi"
      }
    }
  };

  const t = content[language];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Language Toggle */}
      <div className="fixed top-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLanguage(language === "en" ? "ro" : "en")}
          className="gap-2"
        >
          <Globe className="h-4 w-4" />
          {language === "en" ? "RO" : "EN"}
        </Button>
      </div>

      {/* Hero Section */}
      <section className="container mx-auto px-4 pt-20 pb-16 text-center">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
            {t.hero.title}
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground">
            {t.hero.subtitle}
          </p>
          <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
            {t.hero.mission}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="text-lg px-8 py-6"
            >
              {t.hero.cta}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/auth")}
              className="text-lg px-8 py-6"
            >
              {t.hero.login}
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-4xl font-bold text-center mb-12">{t.features.title}</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <FeatureCard
            icon={<Package />}
            title={t.features.delivery.title}
            description={t.features.delivery.desc}
          />
          <FeatureCard
            icon={<FileText />}
            title={t.features.invoicing.title}
            description={t.features.invoicing.desc}
          />
          <FeatureCard
            icon={<CreditCard />}
            title={t.features.payments.title}
            description={t.features.payments.desc}
          />
          <FeatureCard
            icon={<TrendingUp />}
            title={t.features.pricing.title}
            description={t.features.pricing.desc}
          />
          <FeatureCard
            icon={<Shield />}
            title={t.features.simple.title}
            description={t.features.simple.desc}
          />
          <FeatureCard
            icon={<Globe />}
            title={t.features.support.title}
            description={t.features.support.desc}
          />
        </div>
      </section>

      {/* Pricing Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-8">{t.pricing.title}</h2>
          <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
            <div className="text-center mb-6">
              <div className="text-5xl font-bold text-primary mb-2">{t.pricing.monthly}</div>
              <p className="text-muted-foreground">{language === "en" ? "per store" : "per magazin"}</p>
            </div>
            <ul className="space-y-4">
              {t.pricing.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container mx-auto px-4 py-16 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-4xl font-bold">{t.footer.ready}</h2>
          <Button
            size="lg"
            onClick={() => navigate("/auth")}
            className="text-lg px-12 py-6"
          >
            {t.footer.cta}
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © 2025 STORE VENDORS. {language === "en" ? "All rights reserved." : "Toate drepturile rezervate."}
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow">
      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, Truck, Smartphone, Check, Zap, Shield, Sparkles, User, Building2, Heart, ArrowRight, Clock, Settings } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { AppLanguage } from "@/i18n/types";

const FEATURE_CARD_META = [
  { icon: Truck, color: "from-orange-500 to-amber-500" },
  { icon: Zap, color: "from-violet-500 to-purple-500" },
  { icon: Smartphone, color: "from-cyan-500 to-blue-500" },
  { icon: Shield, color: "from-emerald-500 to-green-500" },
] as const;

const NO_TECH_POINT_ICONS = [Settings, Sparkles, Heart, Clock] as const;

type FeatureCard = { title: string; desc: string };
type ComparisonPlan = { title: string; subtitle: string; features: string[] };
type PricingPlan = {
  title: string;
  subtitle: string;
  setup: string;
  setupLabel: string;
  monthly: string;
  monthlyLabel: string;
  features: string[];
  badge?: string;
};

export default function Landing() {
  const { t, ready } = useTranslation("auth");
  const { language, setLanguage } = useLanguage();
  const [businessType, setBusinessType] = useState<"pf" | "srl">("pf");
  const navigate = useNavigate();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      navigate("/welcome", { replace: true });
    }
  }, [navigate]);

  const featureCards = t("landing.featureCards", { returnObjects: true });
  const comparisonPf = t("landing.comparison.pf", { returnObjects: true });
  const comparisonSrl = t("landing.comparison.srl", { returnObjects: true });
  const noTechPoints = t("landing.noTech.points", { returnObjects: true });
  const pricingPf = t("landing.pricing.pf", { returnObjects: true });
  const pricingSrl = t("landing.pricing.srl", { returnObjects: true });

  // Guard: returnObjects yields the key string until the auth bundle is present
  if (
    !ready ||
    !Array.isArray(featureCards) ||
    !Array.isArray(noTechPoints) ||
    typeof comparisonPf !== "object" ||
    comparisonPf === null ||
    !Array.isArray((comparisonPf as ComparisonPlan).features) ||
    typeof comparisonSrl !== "object" ||
    comparisonSrl === null ||
    !Array.isArray((comparisonSrl as ComparisonPlan).features) ||
    typeof pricingPf !== "object" ||
    pricingPf === null ||
    !Array.isArray((pricingPf as PricingPlan).features) ||
    typeof pricingSrl !== "object" ||
    pricingSrl === null ||
    !Array.isArray((pricingSrl as PricingPlan).features)
  ) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const cards = featureCards as FeatureCard[];
  const points = noTechPoints as string[];
  const pfPlan = comparisonPf as ComparisonPlan;
  const srlPlan = comparisonSrl as ComparisonPlan;
  const pricingIndividual = pricingPf as PricingPlan;
  const pricingCompany = pricingSrl as PricingPlan;

  const activeComparison = businessType === "pf" ? pfPlan : srlPlan;

  const toggleLanguage = () => {
    const next: AppLanguage = language === "en" ? "ro" : "en";
    void setLanguage(next);
  };

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
            {t("title")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLanguage}
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
            {t("landing.badge")}
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold leading-tight animate-fade-in [animation-delay:100ms]">
            {t("landing.heroTitle")}
            <span className="block bg-gradient-to-r from-violet-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
              {t("landing.heroHighlight")}
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto animate-fade-in [animation-delay:200ms]">
            {t("landing.heroSubtitle")}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6 animate-fade-in [animation-delay:300ms]">
            <Button 
              size="lg" 
              onClick={() => navigate("/auth")} 
              className="text-lg px-8 py-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/25"
            >
              {t("landing.cta")}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={() => navigate("/auth")} 
              className="text-lg px-8 py-6 border-2 hover:bg-primary/5"
            >
              {t("landing.ctaSecondary")}
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-24 px-4">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16 animate-fade-in">
            {t("landing.featuresTitle")}
          </h2>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((card, i) => {
              const meta = FEATURE_CARD_META[i];
              const Icon = meta.icon;
              return (
                <div 
                  key={card.title} 
                  className="group relative p-6 bg-card/50 backdrop-blur-sm rounded-3xl border border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 animate-fade-in"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className={cn(
                    "h-14 w-14 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white mb-5 shadow-lg",
                    meta.color
                  )}>
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="font-bold text-xl mb-2">{card.title}</h3>
                  <p className="text-muted-foreground">{card.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Individual vs Company Comparison */}
      <section className="relative py-24 px-4 bg-gradient-to-b from-muted/30 to-transparent">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 animate-fade-in">{t("landing.comparison.title")}</h2>
            <p className="text-xl text-muted-foreground animate-fade-in [animation-delay:100ms]">{t("landing.comparison.subtitle")}</p>
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
                {t("landing.toggle.individual")}
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
                {t("landing.toggle.company")}
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
                <h3 className="text-2xl font-bold">{activeComparison.title}</h3>
                <p className="text-muted-foreground">{activeComparison.subtitle}</p>
              </div>
              
              <ul className="space-y-4">
                {activeComparison.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
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
                {t("landing.noTech.title")}
              </span>
            </h2>
            <p className="text-xl text-muted-foreground animate-fade-in [animation-delay:100ms]">{t("landing.noTech.subtitle")}</p>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-6 mb-12">
            {points.map((point, i) => {
              const Icon = NO_TECH_POINT_ICONS[i];
              return (
                <div 
                  key={point} 
                  className="flex items-center gap-4 p-5 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 rounded-2xl border border-cyan-500/20 animate-fade-in"
                  style={{ animationDelay: `${(i + 2) * 100}ms` }}
                >
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25 shrink-0">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="font-medium text-lg">{point}</span>
                </div>
              );
            })}
          </div>
          
          <p className="text-center text-2xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent animate-fade-in [animation-delay:600ms]">
            {t("landing.noTech.conclusion")}
          </p>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="relative py-24 px-4 bg-gradient-to-b from-muted/30 to-transparent">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 animate-fade-in">{t("landing.pricing.title")}</h2>
            <p className="text-xl text-muted-foreground animate-fade-in [animation-delay:100ms]">{t("landing.pricing.subtitle")}</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Individual Package */}
            <div className="relative bg-card/50 backdrop-blur-sm rounded-3xl border border-border/50 p-8 animate-fade-in [animation-delay:200ms] hover:shadow-xl transition-all duration-300">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white mb-6 shadow-lg shadow-orange-500/25">
                <User className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold mb-1">{pricingIndividual.title}</h3>
              <p className="text-muted-foreground mb-6">{pricingIndividual.subtitle}</p>
              
              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-4xl font-bold">{pricingIndividual.setup}</span>
                </div>
                <p className="text-sm text-muted-foreground">{pricingIndividual.setupLabel}</p>
              </div>
              
              <div className="flex items-baseline gap-1 mb-8 p-4 bg-muted/50 rounded-xl">
                <span className="text-2xl font-bold">{pricingIndividual.monthly}</span>
                <span className="text-muted-foreground">{pricingIndividual.monthlyLabel}</span>
              </div>
              
              <ul className="space-y-3">
                {pricingIndividual.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
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
                {pricingCompany.badge}
              </div>
              
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white mb-6 shadow-lg shadow-violet-500/25">
                <Building2 className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold mb-1">{pricingCompany.title}</h3>
              <p className="text-muted-foreground mb-6">{pricingCompany.subtitle}</p>
              
              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-4xl font-bold">{pricingCompany.setup}</span>
                </div>
                <p className="text-sm text-muted-foreground">{pricingCompany.setupLabel}</p>
              </div>
              
              <div className="flex items-baseline gap-1 mb-8 p-4 bg-violet-500/10 rounded-xl border border-violet-500/20">
                <span className="text-2xl font-bold">{pricingCompany.monthly}</span>
                <span className="text-muted-foreground">{pricingCompany.monthlyLabel}</span>
              </div>
              
              <ul className="space-y-3">
                {pricingCompany.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
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
              <h2 className="text-4xl md:text-5xl font-bold">{t("landing.ctaFinalTitle")}</h2>
              <p className="text-xl text-white/80 max-w-xl mx-auto">{t("landing.ctaFinalSubtitle")}</p>
              <Button
                size="lg"
                onClick={() => navigate("/auth")}
                className="text-lg px-10 py-6 bg-white text-violet-600 hover:bg-white/90 shadow-xl font-semibold"
              >
                {t("landing.ctaFinalButton")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 bg-muted/20">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground">{t("title")}</p>
          <p>© 2025 Speed Vendors. {t("landing.rights")}</p>
          <Link to="/privacy-policy" className="text-primary hover:underline">
            {t("landing.privacy")}
          </Link>
        </div>
      </footer>
    </div>
  );
}

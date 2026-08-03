import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, Package, Truck, Smartphone, Globe } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { AppLanguage } from "@/i18n/types";

const WELCOME_FEATURES = [
  { icon: Truck, color: "orange", titleKey: "welcome.feature1Title", descKey: "welcome.feature1Desc" },
  { icon: Package, color: "violet", titleKey: "welcome.feature2Title", descKey: "welcome.feature2Desc" },
  { icon: Smartphone, color: "cyan", titleKey: "welcome.feature3Title", descKey: "welcome.feature3Desc" },
] as const;

export default function Welcome() {
  const { t } = useTranslation("auth");
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const toggleLanguage = () => {
    const next: AppLanguage = language === "ro" ? "en" : "ro";
    void setLanguage(next);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex flex-col">
      {/* Language Toggle */}
      <div className="flex justify-end p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLanguage}
          className="gap-2"
        >
          <Globe className="w-4 h-4" />
          {language === "ro" ? "EN" : "RO"}
        </Button>
      </div>

      {/* Logo & Branding */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mb-6 shadow-lg">
          <Sparkles className="w-10 h-10 text-primary-foreground" />
        </div>
        
        <h1 className="text-3xl font-bold text-foreground text-center mb-2">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-center text-lg mb-8">
          {t("welcome.tagline")}
        </p>

        {/* Feature highlights */}
        <div className="w-full max-w-sm space-y-4 mb-12">
          {WELCOME_FEATURES.map(({ icon: Icon, color, titleKey, descKey }) => (
            <div key={titleKey} className="flex items-center gap-4 p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50">
              <div className={`w-12 h-12 rounded-xl bg-${color}-500/10 flex items-center justify-center`}>
                <Icon className={`w-6 h-6 text-${color}-500`} />
              </div>
              <div>
                <h3 className="font-medium text-foreground">{t(titleKey)}</h3>
                <p className="text-sm text-muted-foreground">{t(descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-6 pb-8 space-y-3">
        <Button 
          className="w-full h-14 text-lg font-semibold"
          onClick={() => {
            localStorage.setItem('hasSeenWelcome', 'true');
            navigate("/auth?tab=signup");
          }}
        >
          {t("welcome.cta")}
        </Button>
        <Button 
          variant="outline"
          className="w-full h-14 text-lg"
          onClick={() => {
            localStorage.setItem('hasSeenWelcome', 'true');
            navigate("/auth?tab=signin");
          }}
        >
          {t("welcome.login")}
        </Button>
      </div>
    </div>
  );
}

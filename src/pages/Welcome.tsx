import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Sparkles, Package, Truck, Smartphone, Globe } from "lucide-react";

export default function Welcome() {
  const [language, setLanguage] = useState<"en" | "ro">("ro");
  const navigate = useNavigate();

  const content = {
    en: {
      tagline: "Sell online. Simple and fast.",
      features: [
        { icon: Truck, title: "No delivery contracts", desc: "Choose the cheapest courier", color: "orange" },
        { icon: Package, title: "Manage products", desc: "Stock, prices, images", color: "violet" },
        { icon: Smartphone, title: "From your phone", desc: "Orders, deliveries, invoices", color: "cyan" }
      ],
      cta: "Get Started",
      login: "I already have an account"
    },
    ro: {
      tagline: "Vinde online. Simplu și rapid.",
      features: [
        { icon: Truck, title: "Fără contracte de livrare", desc: "Alege cel mai ieftin curier", color: "orange" },
        { icon: Package, title: "Gestionează produsele", desc: "Stocuri, prețuri, imagini", color: "violet" },
        { icon: Smartphone, title: "Direct din telefon", desc: "Comenzi, livrări, facturi", color: "cyan" }
      ],
      cta: "Începe acum",
      login: "Am deja cont"
    }
  };

  const t = content[language];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex flex-col">
      {/* Language Toggle */}
      <div className="flex justify-end p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLanguage(language === "ro" ? "en" : "ro")}
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
          SpeedVendors
        </h1>
        <p className="text-muted-foreground text-center text-lg mb-8">
          {t.tagline}
        </p>

        {/* Feature highlights */}
        <div className="w-full max-w-sm space-y-4 mb-12">
          {t.features.map((feature, index) => (
            <div key={index} className="flex items-center gap-4 p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50">
              <div className={`w-12 h-12 rounded-xl bg-${feature.color}-500/10 flex items-center justify-center`}>
                <feature.icon className={`w-6 h-6 text-${feature.color}-500`} />
              </div>
              <div>
                <h3 className="font-medium text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
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
            navigate("/auth");
          }}
        >
          {t.cta}
        </Button>
        <Button 
          variant="outline"
          className="w-full h-14 text-lg"
          onClick={() => {
            localStorage.setItem('hasSeenWelcome', 'true');
            navigate("/auth");
          }}
        >
          {t.login}
        </Button>
      </div>
    </div>
  );
}

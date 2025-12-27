import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Sparkles, Package, Truck, Smartphone } from "lucide-react";

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex flex-col">
      {/* Logo & Branding */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mb-6 shadow-lg">
          <Sparkles className="w-10 h-10 text-primary-foreground" />
        </div>
        
        <h1 className="text-3xl font-bold text-foreground text-center mb-2">
          SpeedVendors
        </h1>
        <p className="text-muted-foreground text-center text-lg mb-8">
          Vinde online. Simplu și rapid.
        </p>

        {/* Feature highlights */}
        <div className="w-full max-w-sm space-y-4 mb-12">
          <div className="flex items-center gap-4 p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50">
            <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Truck className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Fără contracte de livrare</h3>
              <p className="text-sm text-muted-foreground">Alege cel mai ieftin curier</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50">
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Package className="w-6 h-6 text-violet-500" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Gestionează produsele</h3>
              <p className="text-sm text-muted-foreground">Stocuri, prețuri, imagini</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
              <Smartphone className="w-6 h-6 text-cyan-500" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Direct din telefon</h3>
              <p className="text-sm text-muted-foreground">Comenzi, livrări, facturi</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-6 pb-8 space-y-3">
        <Button 
          className="w-full h-14 text-lg font-semibold"
          onClick={() => navigate("/auth")}
        >
          Începe acum
        </Button>
        <Button 
          variant="outline"
          className="w-full h-14 text-lg"
          onClick={() => navigate("/auth")}
        >
          Am deja cont
        </Button>
      </div>
    </div>
  );
}

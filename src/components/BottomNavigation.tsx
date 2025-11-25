import { Package, ShoppingCart, Users, BarChart3, Home, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  const navItems = [
    { id: 'dashboard', icon: Home, label: 'Home' },
    { id: 'products', icon: Package, label: 'Products' },
    { id: 'orders', icon: ShoppingCart, label: 'Orders' },
    { id: 'customers', icon: Users, label: 'Customers' },
    { id: 'payments', icon: BarChart3, label: 'Analytics' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-xl border-t border-border/50 md:hidden safe-area-bottom">
      <div className="grid grid-cols-5 px-2 py-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          
          return (
            <Button
              key={item.id}
              variant="ghost"
              size="sm"
              className={cn(
                "flex flex-col gap-1 h-12 px-1 rounded-xl transition-colors duration-200 relative touch-manipulation",
                "focus:outline-none focus-visible:ring-0 active:scale-95",
                "will-change-[color,background-color]",
                isActive 
                  ? "text-primary bg-transparent" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 active:bg-muted/30"
              )}
              onClick={() => onTabChange(item.id)}
            >
              {isActive && (
                <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary rounded-full animate-scale-in" />
              )}
              <Icon 
                className={cn(
                  "h-5 w-5 transition-colors duration-200",
                  isActive && "text-primary"
                )} 
              />
              <span className={cn(
                "text-xs font-medium leading-none transition-colors duration-200",
                isActive && "text-primary"
              )}>
                {item.label}
              </span>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
import { Home, Package, ShoppingCart, Users, BarChart3, CreditCard, Layout, Star } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useTranslation } from "react-i18next";

interface AppSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function AppSidebar({ activeTab, onTabChange }: AppSidebarProps) {
  const { t } = useTranslation('common');
  const { state, setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();
  const collapsed = state === "collapsed";

  const navigationItems = [
    { titleKey: "nav.dashboard", url: "/", icon: Home, tab: "dashboard" },
    { titleKey: "nav.products", url: "/products", icon: Package, tab: "products" },
    { titleKey: "nav.stock", url: "/stock", icon: BarChart3, tab: "stock" },
    { titleKey: "nav.orders", url: "/orders", icon: ShoppingCart, tab: "orders" },
    { titleKey: "nav.customers", url: "/customers", icon: Users, tab: "customers" },
    { titleKey: "nav.reviews", url: "/reviews", icon: Star, tab: "reviews" },
    { titleKey: "nav.payments", url: "/payments", icon: CreditCard, tab: "payments" },
    { titleKey: "nav.templates", url: "/templates", icon: Layout, tab: "templates" },
  ];

  const getTabClass = (tab: string) => {
    return activeTab === tab
      ? "bg-primary text-primary-foreground font-medium"
      : "hover:bg-muted/50 text-muted-foreground hover:text-foreground";
  };

  const handleTabChange = (tab: string) => {
    onTabChange(tab);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar className={`${collapsed ? "w-14" : "w-64"}`} collapsible="icon">
      <SidebarContent className="pt-[env(safe-area-inset-top)]">
        <SidebarGroup>
          <div className="px-3 py-3 mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {collapsed ? (
                <BrandLogo variant="mark" imgClassName="h-9 w-9" />
              ) : (
                <BrandLogo variant="horizontal" imgClassName="h-9 w-auto max-w-[168px]" />
              )}
            </div>
          </div>

          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.tab}>
                  <SidebarMenuButton asChild className={getTabClass(item.tab)}>
                    <button
                      onClick={() => handleTabChange(item.tab)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md transition-colors"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{t(item.titleKey)}</span>}
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between px-1"}`}>
          {!collapsed && <span className="text-xs text-muted-foreground">{t('theme')}</span>}
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

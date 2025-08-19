import { Home, Package, ShoppingCart, Settings, Store, Users, BarChart3, CreditCard } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

const navigationItems = [
  { title: "Dashboard", url: "/", icon: Home, tab: "dashboard" },
  { title: "Products", url: "/products", icon: Package, tab: "products" },
  { title: "Stock", url: "/stock", icon: BarChart3, tab: "stock" },
  { title: "Orders", url: "/orders", icon: ShoppingCart, tab: "orders" },
  { title: "Customers", url: "/customers", icon: Users, tab: "customers" },
  { title: "Payments", url: "/payments", icon: CreditCard, tab: "payments" },
  { title: "Settings", url: "/settings", icon: Settings, tab: "settings" },
];

interface AppSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function AppSidebar({ activeTab, onTabChange }: AppSidebarProps) {
  const { state, setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();
  const collapsed = state === "collapsed";

  const getTabClass = (tab: string) => {
    return activeTab === tab 
      ? "bg-primary text-primary-foreground font-medium" 
      : "hover:bg-muted/50 text-muted-foreground hover:text-foreground";
  };

  const handleTabChange = (tab: string) => {
    onTabChange(tab);
    // Auto-close sidebar on mobile after tab selection
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar className={`${collapsed ? "w-14" : "w-64"} ${isMobile ? "top-16" : ""}`} collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-2">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              {!collapsed && <span className="font-semibold">Store Admin</span>}
            </div>
          </SidebarGroupLabel>
          
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild
                    className={getTabClass(item.tab)}
                  >
                    <button
                      onClick={() => handleTabChange(item.tab)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md transition-colors"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
import { LogOut, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface MobileHeaderProps {
  userEmail?: string;
  storeName?: string;
  onTabChange: (tab: string) => void;
}

export function MobileHeader({ userEmail, storeName, onTabChange }: MobileHeaderProps) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "?";

  return (
    <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-xl border-b border-border/50 safe-area-top">
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="md:hidden p-2 hover:bg-muted/50 rounded-lg transition-colors" />
          <div className="flex items-center gap-3">
            <BrandLogo variant="mark" imgClassName="h-10 w-10" />
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
                {storeName || t("brand")}
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-muted/50">
                <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                  <AvatarFallback className="bg-gradient-primary text-white font-semibold text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-64 bg-popover/95 backdrop-blur-xl border border-border/50 shadow-elegant"
              align="end"
            >
              <div className="flex items-center gap-3 p-4 border-b border-border/50">
                <Avatar className="h-12 w-12 ring-2 ring-primary/20">
                  <AvatarFallback className="bg-gradient-primary text-white font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <p className="text-sm font-medium">{t("user.storeManager")}</p>
                  {userEmail && (
                    <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                  )}
                </div>
              </div>
              <div className="p-2">
                <DropdownMenuItem
                  onClick={() => onTabChange("settings")}
                  className="hover:bg-muted/50 rounded-lg cursor-pointer"
                >
                  <Settings className="mr-3 h-4 w-4" />
                  <span>{t("nav.settings")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
                >
                  <LogOut className="mr-3 h-4 w-4" />
                  <span>{t("user.signOut")}</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

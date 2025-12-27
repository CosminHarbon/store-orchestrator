import { Menu, Store, LogOut, User, Settings } from "lucide-react";
import logoImg from "@/assets/logo.png";
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
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface MobileHeaderProps {
  userEmail?: string;
  storeName?: string;
  onTabChange: (tab: string) => void;
}

export function MobileHeader({ userEmail, storeName, onTabChange }: MobileHeaderProps) {
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
              <img src={logoImg} alt="Speed Vendors Logo" className="h-12 w-12 object-contain" />
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
                  {storeName || "Speed Vendors"}
                </h1>
              </div>
            </div>
          </div>

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
            <DropdownMenuContent className="w-64 bg-background/95 backdrop-blur-xl border border-border/50 shadow-elegant" align="end">
              <div className="flex items-center gap-3 p-4 border-b border-border/50">
                <Avatar className="h-12 w-12 ring-2 ring-primary/20">
                  <AvatarFallback className="bg-gradient-primary text-white font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <p className="text-sm font-medium">Store Manager</p>
                  {userEmail && (
                    <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                  )}
                </div>
              </div>
            <div className="p-2">
              <DropdownMenuItem 
                onClick={() => onTabChange('settings')} 
                className="hover:bg-muted/50 rounded-lg cursor-pointer"
              >
                <Settings className="mr-3 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={handleSignOut} 
                className="text-destructive hover:text-destructive hover:bg-destructive/5 rounded-lg cursor-pointer"
              >
                <LogOut className="mr-3 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
    </header>
  );
}
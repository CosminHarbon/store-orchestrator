import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layout, ExternalLink, Copy, Check, Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TemplateCustomizer } from "./TemplateCustomizer";

const TemplatesManagement = () => {
  const [copiedKey, setCopiedKey] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .select("store_api_key, store_name")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const handleCopyApiKey = () => {
    if (profile?.store_api_key) {
      navigator.clipboard.writeText(profile.store_api_key);
      setCopiedKey(true);
      toast.success("API key copied to clipboard!");
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const templates = [
    {
      id: "elementar",
      name: "ELEMENTAR",
      description: "A modern, minimalist ecommerce storefront with beautiful animations and smooth user experience. Features product browsing, cart, checkout with delivery options, and payment integration.",
      features: [
        "Product catalog with collections",
        "Product detail views with image gallery",
        "Shopping cart with live updates",
        "Checkout with home/locker delivery",
        "Payment integration (Netopia)",
        "Discount support",
        "Responsive design",
        "Modern animations"
      ],
      status: "active",
      preview: `${window.location.origin}/templates/elementar`,
    }
  ];

  const getTemplateUrl = (templateId: string, editMode: boolean = false) => {
    const baseUrl = `${window.location.origin}/templates/${templateId}?api_key=${profile?.store_api_key || 'YOUR_API_KEY'}`;
    return editMode ? `${baseUrl}&edit=true` : baseUrl;
  };

  return (
    <Tabs defaultValue="browse" className="space-y-6 w-full overflow-hidden">
      <TabsList className="w-full max-w-full">
        <TabsTrigger value="browse" className="flex-1">Browse Templates</TabsTrigger>
        <TabsTrigger value="customize" className="flex-1 flex items-center gap-2">
          <Palette className="h-4 w-4" />
          <span className="hidden sm:inline">Customize</span>
          <span className="sm:hidden">Custom</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="browse" className="space-y-6 w-full overflow-hidden">
        {/* Header */}
        <div className="px-1">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Store Templates</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Pre-built storefront templates that connect to your products, orders, and payment systems.
          </p>
        </div>

      {/* API Key Card */}
      <Card className="border-primary/20 bg-gradient-card w-full overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
            <Layout className="h-5 w-5 flex-shrink-0" />
            Your Store API Key
          </CardTitle>
          <CardDescription className="text-sm">
            Use this API key to connect templates to your store data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
            <code className="flex-1 px-3 py-2 bg-muted rounded-lg text-xs font-mono break-all overflow-hidden">
              {profile?.store_api_key || "Loading..."}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyApiKey}
              disabled={!profile?.store_api_key}
              className="w-full sm:w-auto"
            >
              {copiedKey ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 w-full">
        {templates.map((template) => (
          <Card key={template.id} className="hover:shadow-elegant transition-shadow w-full overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg md:text-xl break-words">{template.name}</CardTitle>
                  <Badge variant="secondary" className="mt-2">
                    {template.status === "active" ? "Active" : "Coming Soon"}
                  </Badge>
                </div>
                <Layout className="h-6 w-6 md:h-8 md:w-8 text-primary flex-shrink-0" />
              </div>
              <CardDescription className="mt-3 text-sm">
                {template.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Features:</h4>
                <ul className="space-y-1">
                  {template.features.map((feature, idx) => (
                    <li key={idx} className="text-xs md:text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1 flex-shrink-0">•</span>
                      <span className="break-words">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="default"
                  className="flex-1"
                  onClick={() => window.open(getTemplateUrl(template.id), '_blank')}
                  disabled={!profile?.store_api_key}
                >
                  <ExternalLink className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Preview</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(getTemplateUrl(template.id, true), '_blank')}
                  disabled={!profile?.store_api_key}
                >
                  <Palette className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Edit Live</span>
                </Button>
              </div>

              {profile?.store_api_key && (
                <div className="pt-2 w-full overflow-hidden">
                  <p className="text-xs text-muted-foreground mb-2">Template URL:</p>
                  <div className="bg-muted px-2 py-1.5 rounded max-w-full overflow-x-auto">
                    <code className="text-xs break-all whitespace-pre-wrap">
                      {getTemplateUrl(template.id)}
                    </code>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900 w-full overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base md:text-lg">How to Use Templates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs md:text-sm text-muted-foreground">
          <p>1. Copy your Store API Key from above</p>
          <p>2. Click "Open Template" to view the storefront</p>
          <p>3. The template will automatically load your products, collections, and settings</p>
          <p>4. Customers can browse products, add to cart, and complete purchases</p>
          <p>5. All orders will appear in your Orders tab</p>
          <p className="pt-2 font-medium text-foreground break-words">
            💡 You can share the template URL with customers or embed it on your website
          </p>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="customize">
        <TemplateCustomizer />
      </TabsContent>
    </Tabs>
  );
};

export default TemplatesManagement;

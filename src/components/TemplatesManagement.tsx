import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layout, ExternalLink, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

  const getTemplateUrl = (templateId: string) => {
    return `${window.location.origin}/templates/${templateId}?api_key=${profile?.store_api_key || 'YOUR_API_KEY'}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Store Templates</h1>
        <p className="text-muted-foreground">
          Pre-built storefront templates that connect to your products, orders, and payment systems.
        </p>
      </div>

      {/* API Key Card */}
      <Card className="border-primary/20 bg-gradient-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layout className="h-5 w-5" />
            Your Store API Key
          </CardTitle>
          <CardDescription>
            Use this API key to connect templates to your store data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-4 py-2 bg-muted rounded-lg text-sm font-mono">
              {profile?.store_api_key || "Loading..."}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyApiKey}
              disabled={!profile?.store_api_key}
            >
              {copiedKey ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id} className="hover:shadow-elegant transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{template.name}</CardTitle>
                  <Badge variant="secondary" className="mt-2">
                    {template.status === "active" ? "Active" : "Coming Soon"}
                  </Badge>
                </div>
                <Layout className="h-8 w-8 text-primary" />
              </div>
              <CardDescription className="mt-3">
                {template.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Features:</h4>
                <ul className="space-y-1">
                  {template.features.map((feature, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{feature}</span>
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
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Template
                </Button>
              </div>

              {profile?.store_api_key && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-2">Template URL:</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto">
                    {getTemplateUrl(template.id)}
                  </code>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="text-lg">How to Use Templates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Copy your Store API Key from above</p>
          <p>2. Click "Open Template" to view the storefront</p>
          <p>3. The template will automatically load your products, collections, and settings</p>
          <p>4. Customers can browse products, add to cart, and complete purchases</p>
          <p>5. All orders will appear in your Orders tab</p>
          <p className="pt-2 font-medium text-foreground">
            💡 You can share the template URL with customers or embed it on your website
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TemplatesManagement;

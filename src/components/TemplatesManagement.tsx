import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layout, ExternalLink, Copy, Check, Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TemplateCustomizer } from "./TemplateCustomizer";

const TemplatesManagement = () => {
  const { t: tTemplates } = useTranslation("templates");
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const [copiedKey, setCopiedKey] = useState(false);

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
      toast.success(tTemplates("toast.apiKeyCopied"));
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const templates = [
    {
      id: "elementar",
      nameKey: "editable.name",
      descriptionKey: "editable.description",
      featureKeys: [
        "editable.features.liveEditor",
        "editable.features.customBlocks",
        "editable.features.catalog",
        "editable.features.cartCheckout",
        "editable.features.payments",
        "editable.features.discount",
        "editable.features.responsive",
      ],
      status: "active",
      editable: true,
      badgeKey: "editable.badge",
      preview: `${window.location.origin}/templates/elementar`,
    },
    {
      id: "premium",
      nameKey: "premium.name",
      descriptionKey: "premium.description",
      featureKeys: [
        "premium.features.homepage",
        "premium.features.catalog",
        "premium.features.productPages",
        "premium.features.sideCart",
        "premium.features.checkout",
        "premium.features.mobileFirst",
        "premium.features.publishGo",
      ],
      status: "active",
      editable: false,
      badgeKey: "premium.badge",
      preview: `${window.location.origin}/templates/premium`,
    },
  ] as const;

  const getTemplateUrl = (templateId: string, editMode: boolean = false) => {
    const baseUrl = `${window.location.origin}/templates/${templateId}?api_key=${profile?.store_api_key || 'YOUR_API_KEY'}`;
    return editMode ? `${baseUrl}&edit=true` : baseUrl;
  };

  return (
    <Tabs defaultValue="browse" className="space-y-6 w-full overflow-hidden">
      <TabsList className="w-full max-w-full">
        <TabsTrigger value="browse" className="flex-1">{tTemplates("browseTemplates")}</TabsTrigger>
        <TabsTrigger value="customize" className="flex-1 flex items-center gap-2">
          <Palette className="h-4 w-4" />
          <span className="hidden sm:inline">{tTemplates("customize")}</span>
          <span className="sm:hidden">{tTemplates("customizeShort")}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="browse" className="space-y-6 w-full overflow-hidden">
        {/* Header */}
        <div className="px-1">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">{tTemplates("storeTemplatesTitle")}</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {tTemplates("storeTemplatesDesc")}
          </p>
        </div>

      {/* API Key Card */}
      <Card className="border-primary/20 bg-gradient-card w-full overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
            <Layout className="h-5 w-5 flex-shrink-0" />
            {tTemplates("apiKeyTitle")}
          </CardTitle>
          <CardDescription className="text-sm">
            {tTemplates("apiKeyDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
            <code className="flex-1 px-3 py-2 bg-muted rounded-lg text-xs font-mono break-all overflow-hidden">
              {profile?.store_api_key || tCommon("loading")}
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
                  <span>{tTemplates("copied")}</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  <span>{tCommon("copy")}</span>
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
            <div
              className={`h-36 w-full ${
                template.id === 'premium'
                  ? 'bg-gradient-to-br from-[#1c2b24] via-[#2a3d34] to-[#0f1612]'
                  : 'bg-gradient-to-br from-stone-200 via-stone-100 to-white'
              } relative overflow-hidden`}
            >
              <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_30%_20%,#ffffff55,transparent_50%)]" />
              <div className="absolute bottom-4 left-4 right-4">
                <p className={`text-xs uppercase tracking-[0.2em] ${template.id === 'premium' ? 'text-white/70' : 'text-stone-500'}`}>
                  {tTemplates(template.badgeKey)}
                </p>
                <p className={`text-2xl font-serif ${template.id === 'premium' ? 'text-white' : 'text-stone-800'}`}>
                  {tTemplates(template.nameKey)}
                </p>
              </div>
            </div>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg md:text-xl break-words">{tTemplates(template.nameKey)}</CardTitle>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="secondary">
                      {template.status === "active" ? tTemplates("status.active") : tTemplates("status.comingSoon")}
                    </Badge>
                    <Badge variant={template.editable ? "outline" : "default"}>
                      {template.editable ? tTemplates("badge.editable") : tTemplates("badge.predesigned")}
                    </Badge>
                  </div>
                </div>
                <Layout className="h-6 w-6 md:h-8 md:w-8 text-primary flex-shrink-0" />
              </div>
              <CardDescription className="mt-3 text-sm">
                {tTemplates(template.descriptionKey)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium text-sm mb-2">{tTemplates("featuresLabel")}</h4>
                <ul className="space-y-1">
                  {template.featureKeys.map((featureKey) => (
                    <li key={featureKey} className="text-xs md:text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1 flex-shrink-0">•</span>
                      <span className="break-words">{tTemplates(featureKey)}</span>
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
                  <span className="truncate">{template.editable ? tTemplates("action.preview") : tTemplates("action.openPublish")}</span>
                </Button>
                {template.editable ? (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate(`/templates/${template.id}?api_key=${profile?.store_api_key}&edit=true`)}
                    disabled={!profile?.store_api_key}
                  >
                    <Palette className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{tTemplates("editLive")}</span>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      navigator.clipboard.writeText(getTemplateUrl(template.id));
                      toast.success(tTemplates('toast.premiumUrlCopied'));
                    }}
                    disabled={!profile?.store_api_key}
                  >
                    <Copy className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{tTemplates("copyUrl")}</span>
                  </Button>
                )}
              </div>

              {profile?.store_api_key && (
                <div className="pt-2 w-full overflow-hidden">
                  <p className="text-xs text-muted-foreground mb-2">{tTemplates("templateUrl")}</p>
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
          <CardTitle className="text-base md:text-lg">{tTemplates("howToUse")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs md:text-sm text-muted-foreground">
          <p>{tTemplates("help.step1")}</p>
          <p>{tTemplates("help.openTemplate")}</p>
          <p>{tTemplates("help.step3")}</p>
          <p>{tTemplates("help.step4")}</p>
          <p>{tTemplates("help.step5")}</p>
          <p className="pt-2 font-medium text-foreground break-words">
            {tTemplates("help.tip")}
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

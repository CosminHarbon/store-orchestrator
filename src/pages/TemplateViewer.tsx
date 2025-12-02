import { useSearchParams, useParams } from "react-router-dom";
import EnhancedElementarTemplate from "@/components/templates/EnhancedElementarTemplate";

const TemplateViewer = () => {
  const [searchParams] = useSearchParams();
  const { templateId: routeTemplateId } = useParams();
  const apiKey = searchParams.get("api_key");
  const editMode = searchParams.get("edit") === "true";
  const templateKey = (routeTemplateId || "").split("?")[0].toLowerCase();

  if (!apiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-2xl font-bold text-destructive">Missing API Key</h1>
          <p className="text-muted-foreground">
            This template requires a valid API key to function.
          </p>
          <p className="text-sm text-muted-foreground">
            Please access this template through your admin panel.
          </p>
        </div>
      </div>
    );
  }

  if (templateKey === "elementar") {
    return <EnhancedElementarTemplate apiKey={apiKey} editMode={editMode} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        <h1 className="text-2xl font-bold">Template Not Found</h1>
        <p className="text-muted-foreground">
          The template "{routeTemplateId || templateKey}" does not exist.
        </p>
      </div>
    </div>
  );
};

export default TemplateViewer;

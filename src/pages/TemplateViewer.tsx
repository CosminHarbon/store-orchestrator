import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ElementarTemplate from "@/components/templates/ElementarTemplate";

const TemplateViewer = () => {
  const [searchParams] = useSearchParams();
  const templateId = window.location.pathname.split("/templates/")[1];
  const apiKey = searchParams.get("api_key");

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

  if (templateId === "elementar") {
    return <ElementarTemplate apiKey={apiKey} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        <h1 className="text-2xl font-bold">Template Not Found</h1>
        <p className="text-muted-foreground">
          The template "{templateId}" does not exist.
        </p>
      </div>
    </div>
  );
};

export default TemplateViewer;

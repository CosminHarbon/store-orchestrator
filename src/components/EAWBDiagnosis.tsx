import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, Zap } from 'lucide-react';

export const EAWBDiagnosis = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const { toast } = useToast();

  const runDiagnosis = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('diagnose-eawb', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (error) {
        throw error;
      }

      setResults(data);
      
      if (data.success && data.workingConfig) {
        toast({
          title: "🎉 Working eAWB endpoint found!",
          description: `Success: ${data.workingConfig.url}`,
        });
      } else {
        toast({
          title: "No working endpoints",
          description: `Tested ${data.totalAttempts} combinations, ${data.successfulAttempts} worked`,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Diagnosis error:', error);
      toast({
        title: "Diagnosis failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            eAWB Direct API Diagnosis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Skip carrier listings and test calculate-prices directly with carrier_id=0, service_id=0
          </p>
          
          <Button 
            onClick={runDiagnosis} 
            disabled={isLoading}
            className="mb-4"
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Run Direct API Test
          </Button>

          {results && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>API Key: {results.apiKeyPresent ? '✓ Present' : '✗ Missing'}</div>
                    <div>Key Prefix: {results.apiKeyPrefix}</div>
                    <div>Attempts: {results.totalAttempts}</div>
                    <div>Successful: {results.successfulAttempts}</div>
                  </div>
                  
                  {results.workingConfig && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
                      <div className="text-sm text-green-800">
                        <div className="font-medium">✓ Working Configuration Found!</div>
                        <div className="mt-1">URL: {results.workingConfig.url}</div>
                        <div>Base: {results.workingConfig.baseUrl}</div>
                        <div>Auth: {results.workingConfig.authHeader}</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Test Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {results.testResults?.map((test: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          {test.success ? 
                            <CheckCircle className="w-4 h-4 text-green-500" /> : 
                            <XCircle className="w-4 h-4 text-red-500" />
                          }
                          <span className="text-xs font-mono max-w-md truncate">{test.url}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={test.success ? "default" : "destructive"}>
                            {test.status}
                          </Badge>
                          {test.success && test.hasQuotes && (
                            <Badge variant="secondary">{test.quoteCount} quotes</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Raw Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-64">
                    {JSON.stringify(results, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
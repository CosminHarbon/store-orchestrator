import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export const EAWBConnectionTest = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const { toast } = useToast();

  const runConnectionTest = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-eawb-connection', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (error) {
        throw error;
      }

      setResults(data);
      
      if (data.success) {
        toast({
          title: "Connection test completed",
          description: data.workingEndpoint ? 
            `Found working endpoint: ${data.workingEndpoint}` : 
            "No working endpoints found",
        });
      } else {
        toast({
          title: "Connection test failed",
          description: data.error,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Connection test error:', error);
      toast({
        title: "Test failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (success: boolean) => {
    return success ? 
      <CheckCircle className="w-4 h-4 text-green-500" /> : 
      <XCircle className="w-4 h-4 text-red-500" />;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            eAWB API Connection Test
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Test your eAWB API configuration and connection endpoints.
          </p>
          
          <Button 
            onClick={runConnectionTest} 
            disabled={isLoading}
            className="mb-4"
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Run Connection Test
          </Button>

          {results && (
            <div className="space-y-4">
              {/* Profile Status */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">API Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(results.profile.hasApiKey)}
                      <span>API Key: {results.profile.hasApiKey ? 'Configured' : 'Missing'}</span>
                    </div>
                    {results.profile.hasApiKey && (
                      <div>Key Length: {results.profile.apiKeyLength}</div>
                    )}
                    <div className="flex items-center gap-2">
                      {getStatusIcon(results.profile.hasDefaults)}
                      <span>Default Carrier/Service: {results.profile.hasDefaults ? 'Set' : 'Not Set'}</span>
                    </div>
                    <div>Billing Address ID: {results.profile.billingAddressId || 'Not Set'}</div>
                  </div>
                </CardContent>
              </Card>

              {/* Connection Tests */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Endpoint Tests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {results.connectionTests?.map((test: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(test.success)}
                          <span className="text-sm font-mono">{test.baseUrl}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={test.success ? "default" : "destructive"}>
                            {test.status}
                          </Badge>
                          {test.success && test.dataLength > 0 && (
                            <Badge variant="secondary">{test.dataLength} carriers</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {results.workingEndpoint && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-green-800">
                          Working Endpoint: {results.workingEndpoint}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quote Test */}
              {results.quoteTest && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Quote Test (0,0 - All Carriers/Services)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(results.quoteTest.success)}
                        <span className="text-sm">Calculate Prices Endpoint</span>
                      </div>
                      <Badge variant={results.quoteTest.success ? "default" : "destructive"}>
                        {results.quoteTest.status}
                      </Badge>
                    </div>
                    
                    {results.quoteTest.success && results.quoteTest.data && (
                      <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded">
                        <div className="text-sm text-green-800">
                          <div>✓ Quote request successful!</div>
                          {results.quoteTest.data.data && Array.isArray(results.quoteTest.data.data) && (
                            <div>Found {results.quoteTest.data.data.length} quotes</div>
                          )}
                        </div>
                      </div>
                    )}

                    {!results.quoteTest.success && (
                      <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded">
                        <div className="text-sm text-red-800">
                          Error: {results.quoteTest.error}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Raw Data (for debugging) */}
              {results.connectionTests?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Debug Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-64">
                      {JSON.stringify(results, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
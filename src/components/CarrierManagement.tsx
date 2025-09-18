import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Truck, Globe, Settings } from 'lucide-react';

interface Carrier {
  id: number;
  name: string;
  code: string;
  logo_url: string | null;
  is_active: boolean;
  carrier_services: {
    id: number;
    name: string;
    service_code: string;
    description: string | null;
    is_active: boolean;
  }[];
}

export const CarrierManagement = () => {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCarriers();
  }, []);

  const fetchCarriers = async () => {
    try {
      const { data, error } = await supabase
        .from('carriers')
        .select(`
          id,
          name,
          code,
          logo_url,
          is_active,
          carrier_services(
            id,
            name,
            service_code,
            description,
            is_active
          )
        `)
        .order('name');

      if (error) throw error;
      setCarriers(data || []);
    } catch (error: any) {
      console.error('Error fetching carriers:', error);
      toast.error('Failed to load carriers');
    } finally {
      setLoading(false);
    }
  };

  const getCarrierStatus = (carrier: Carrier) => {
    if (!carrier.is_active) return { label: 'Disabled', color: 'destructive' };
    if (carrier.code === 'dpd') return { label: 'Active', color: 'success' };
    return { label: 'Coming Soon', color: 'secondary' };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Delivery Carriers
          </CardTitle>
          <CardDescription>Loading carriers...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Delivery Carriers
        </CardTitle>
        <CardDescription>
          Manage available delivery carriers and their services for AWB creation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {carriers.map((carrier) => {
          const status = getCarrierStatus(carrier);
          const activeServices = carrier.carrier_services.filter(s => s.is_active).length;
          
          return (
            <div key={carrier.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {carrier.logo_url ? (
                    <img 
                      src={carrier.logo_url} 
                      alt={carrier.name}
                      className="h-10 w-auto object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
                      <Truck className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-medium">{carrier.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Code: {carrier.code.toUpperCase()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge variant={status.color as any}>
                    {status.label}
                  </Badge>
                  {carrier.code === 'dpd' && (
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-1" />
                      Configure
                    </Button>
                  )}
                </div>
              </div>

              <div className="text-sm text-muted-foreground mb-2">
                <div className="flex items-center gap-4">
                  <span>{activeServices} active service{activeServices !== 1 ? 's' : ''}</span>
                  {carrier.code !== 'dpd' && (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      API integration pending
                    </span>
                  )}
                </div>
              </div>

              {carrier.carrier_services.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                  {carrier.carrier_services.map((service) => (
                    <div 
                      key={service.id}
                      className={`text-xs p-2 rounded border ${
                        service.is_active ? 'bg-muted/50' : 'bg-muted/20 opacity-60'
                      }`}
                    >
                      <div className="font-medium">{service.name}</div>
                      {service.description && (
                        <div className="text-muted-foreground mt-1">
                          {service.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {carrier.code !== 'dpd' && (
                <div className="mt-3 p-3 bg-muted/30 rounded text-sm text-muted-foreground">
                  <p>
                    <strong>{carrier.name}</strong> integration is planned for future updates. 
                    Currently, only DPD is fully functional for AWB creation.
                  </p>
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            Multi-Carrier Pricing Active
          </h4>
          <p className="text-sm text-blue-700 dark:text-blue-200">
            When creating AWBs, you'll now see pricing options from all available carriers. 
            The system automatically compares prices and shows you the best options for each shipment.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
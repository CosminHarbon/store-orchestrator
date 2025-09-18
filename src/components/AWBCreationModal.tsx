import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  total: number;
}

interface CarrierOption {
  carrier_id: number | string;
  carrier_name: string;
  service_id: number;
  service_name: string;
  price: number;
  currency: string;
  delivery_time: string;
  cod_available: boolean;
}

interface AWBCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  onSuccess: () => void;
}

export const AWBCreationModal = ({ isOpen, onClose, order, onSuccess }: AWBCreationModalProps) => {
  const [step, setStep] = useState<'package' | 'pricing' | 'creating'>('package');
  const [loading, setLoading] = useState(false);
  const [carrierOptions, setCarrierOptions] = useState<any[]>([]);
  const [selectedCarrierOption, setSelectedCarrierOption] = useState<any | null>(null);
  
  const [packageDetails, setPackageDetails] = useState({
    weight: 1,
    parcels: 1, 
    length: 30,
    width: 20,
    height: 10,
    contents: '',
    declared_value: order.total,
    cod_amount: null as number | null
  });

  const handleCalculatePrices = async () => {
    if (!packageDetails.contents.trim()) {
      toast.error('Please describe the package contents');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('eawb-delivery', {
        body: {
          action: 'calculate_prices',
          order_id: order.id,
          package_details: packageDetails
        }
      });

      if (error) throw error;

      if (data.success && data.carrier_options) {
        setCarrierOptions(data.carrier_options);
        setStep('pricing');
      } else {
        console.error('Price calc failed:', data);
        const apiResponse = data?.api_response || data?.details;
        const errors = apiResponse?.errors || apiResponse?.details || [];
        
        let errorMessage = data?.error || data?.message || 'Unknown error';
        if (Array.isArray(errors) && errors.length > 0) {
          const errorDetails = errors.map((e: any) => {
            if (typeof e === 'string') return e;
            return e.message || e.error || JSON.stringify(e);
          }).join('; ');
          errorMessage = `${errorMessage}: ${errorDetails}`;
        } else if (typeof errors === 'object' && errors !== null) {
          errorMessage = `${errorMessage}: ${JSON.stringify(errors)}`;
        }
        
        console.log('Full API response:', JSON.stringify(data, null, 2));
        toast.error(`Validation failed: ${errorMessage}`);
        return;
      }
    } catch (error: any) {
      console.error('Error calculating prices:', error);
      toast.error(error.message || 'Failed to calculate shipping prices');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedCarrierOption) {
      toast.error('Please select a carrier option');
      return;
    }

    setStep('creating');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('eawb-delivery', {
        body: {
          action: 'create_order',
          order_id: order.id,
          package_details: packageDetails,
          selected_carrier: selectedCarrierOption?.carrier_id || selectedCarrierOption,
          selected_service: selectedCarrierOption?.service_id || 1
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`AWB created successfully! Tracking: ${data.awb_number}`);
        onSuccess();
        onClose();
        // Reset state
        setStep('package');
        setCarrierOptions([]);
        setSelectedCarrierOption(null);
      } else {
        console.error('Create order failed:', data);
        const apiResponse = data?.api_response || data?.details;
        const errors = apiResponse?.errors || apiResponse?.details || [];
        
        let errorMessage = data?.error || data?.message || 'Unknown error';
        if (Array.isArray(errors) && errors.length > 0) {
          const errorDetails = errors.map((e: any) => {
            if (typeof e === 'string') return e;
            return e.message || e.error || JSON.stringify(e);
          }).join('; ');
          errorMessage = `${errorMessage}: ${errorDetails}`;
        } else if (typeof errors === 'object' && errors !== null) {
          errorMessage = `${errorMessage}: ${JSON.stringify(errors)}`;
        }
        
        console.log('Full API response:', JSON.stringify(data, null, 2));
        toast.error(`AWB creation failed: ${errorMessage}`);
        setStep('pricing');
        return;
      }
    } catch (error: any) {
      console.error('Error creating AWB:', error);
      toast.error(error.message || 'Failed to create AWB');
      setStep('pricing'); // Go back to pricing step
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
      setStep('package');
      setCarrierOptions([]);
      setSelectedCarrierOption(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Create AWB - Order #{order.id.slice(-8)}
          </DialogTitle>
          <DialogDescription>Enter package details, get quotes from multiple carriers, then create your shipping label.</DialogDescription>
        </DialogHeader>

        {step === 'package' && (
          <div className="space-y-6">
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Delivery Details</h4>
              <div className="text-sm space-y-1">
                <p><strong>Customer:</strong> {order.customer_name}</p>
                <p><strong>Address:</strong> {order.customer_address}</p>
                <p><strong>Phone:</strong> {order.customer_phone}</p>
                <p><strong>Email:</strong> {order.customer_email}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium">Package Details</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={packageDetails.weight}
                    onChange={(e) => setPackageDetails(prev => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))}
                    placeholder="1.0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parcels">Number of Parcels</Label>
                  <Input
                    id="parcels"
                    type="number"
                    value={packageDetails.parcels}
                    onChange={(e) => setPackageDetails(prev => ({ ...prev, parcels: parseInt(e.target.value) || 1 }))}
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="length">Length (cm)</Label>
                  <Input
                    id="length"
                    type="number"
                    min="1"
                    value={packageDetails.length}
                    onChange={(e) => setPackageDetails(prev => ({ ...prev, length: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="width">Width (cm)</Label>
                  <Input
                    id="width"
                    type="number"
                    min="1"
                    value={packageDetails.width}
                    onChange={(e) => setPackageDetails(prev => ({ ...prev, width: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    min="1"
                    value={packageDetails.height}
                    onChange={(e) => setPackageDetails(prev => ({ ...prev, height: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contents">Package Contents *</Label>
                <Textarea
                  id="contents"
                  value={packageDetails.contents}
                  onChange={(e) => setPackageDetails(prev => ({ ...prev, contents: e.target.value }))}
                  placeholder="Describe what's inside the package (required for shipping)"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cod_amount">Cash on Delivery (RON)</Label>
                <Input
                  id="cod_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={packageDetails.cod_amount || ''}
                  onChange={(e) => setPackageDetails(prev => ({ 
                    ...prev, 
                    cod_amount: e.target.value ? parseFloat(e.target.value) : null 
                  }))}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Set to order total if payment is still pending
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="declared_value">Declared Value (RON)</Label>
                <Input
                  id="declared_value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={packageDetails.declared_value}
                  onChange={(e) => setPackageDetails(prev => ({ ...prev, declared_value: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleCalculatePrices} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  'Get Shipping Quotes'
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 'pricing' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Choose Delivery Option</h3>
              <p className="text-sm text-muted-foreground">{carrierOptions.length} option(s) available</p>
            </div>
            
            <div className="grid gap-3 max-h-96 overflow-y-auto">
              {carrierOptions.map((option, index) => (
                <div 
                  key={index}
                  className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                    selectedCarrierOption === option 
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedCarrierOption(option)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {option.carrier_info?.logo_url && (
                          <img 
                            src={option.carrier_info.logo_url} 
                            alt={option.carrier_info.name}
                            className="h-8 w-auto object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                        <div>
                          <h4 className="font-medium text-foreground">
                            {option.carrier_info?.name || option.carrier}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {option.service_info?.name || option.service_name}
                          </p>
                        </div>
                      </div>
                      
                      {option.service_info?.description && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {option.service_info.description}
                        </p>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium">Pickup:</span> {option.estimated_pickup_date}
                        </div>
                        <div>
                          <span className="font-medium">Delivery:</span> {option.estimated_delivery_date}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right ml-4">
                      <p className="font-bold text-xl text-foreground">
                        {option.price.total.toFixed(2)} {option.price.currency}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {option.price.amount.toFixed(2)} + {option.price.vat.toFixed(2)} VAT
                      </p>
                    </div>
                  </div>
                  
                  {selectedCarrierOption === option && (
                    <div className="mt-3 pt-3 border-t border-primary/20">
                      <p className="text-xs text-primary font-medium">
                        ✓ Selected for AWB creation
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {carrierOptions.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No delivery options available</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Please check your package details and try again
                </p>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep('package')} disabled={loading}>
                Back
              </Button>
              <Button onClick={handleCreateOrder} disabled={!selectedCarrierOption || loading}>
                Create AWB
              </Button>
            </div>
          </div>
        )}

        {step === 'creating' && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p className="text-lg font-medium">Creating AWB...</p>
            <p className="text-sm text-muted-foreground mt-2">
              Please wait while we create your shipping label
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
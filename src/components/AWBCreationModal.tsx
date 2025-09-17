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
  const [carrierOptions, setCarrierOptions] = useState<CarrierOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<CarrierOption | null>(null);
  
  const [packageDetails, setPackageDetails] = useState({
    weight: '1',
    length: '30',
    width: '20',
    height: '10',
    contents: '',
    declared_value: order.total.toString(),
    cod_amount: '0'
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
          orderId: order.id,
          packageDetails: {
            ...packageDetails,
            weight: parseFloat(packageDetails.weight),
            length: parseInt(packageDetails.length),
            width: parseInt(packageDetails.width),
            height: parseInt(packageDetails.height),
            declared_value: parseFloat(packageDetails.declared_value),
            cod_amount: parseFloat(packageDetails.cod_amount)
          }
        }
      });

      if (error) throw error;

      if (data.success && data.carrier_options) {
        setCarrierOptions(data.carrier_options);
        setStep('pricing');
      } else {
        console.error('Price calc failed:', data);
        toast.error(`Validation failed: ${data?.error || 'Unknown error'}`);
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
    if (!selectedOption) {
      toast.error('Please select a carrier option');
      return;
    }

    setStep('creating');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('eawb-delivery', {
        body: {
          action: 'create_order',
          orderId: order.id,
          packageDetails: {
            ...packageDetails,
            weight: parseFloat(packageDetails.weight),
            length: parseInt(packageDetails.length),
            width: parseInt(packageDetails.width),
            height: parseInt(packageDetails.height),
            declared_value: parseFloat(packageDetails.declared_value),
            cod_amount: parseFloat(packageDetails.cod_amount)
          },
          selectedCarrier: selectedOption
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
        setSelectedOption(null);
      } else {
        console.error('Create order failed:', data);
        toast.error(`Validation failed: ${data?.error || 'Unknown error'}`);
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
      setSelectedOption(null);
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
          <DialogDescription>Enter package details, get quotes, then pick a courier.</DialogDescription>
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
                    onChange={(e) => setPackageDetails(prev => ({ ...prev, weight: e.target.value }))}
                    placeholder="1.0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="declared_value">Declared Value (RON)</Label>
                  <Input
                    id="declared_value"
                    type="number"
                    step="0.01"
                    min="0"
                    value={packageDetails.declared_value}
                    onChange={(e) => setPackageDetails(prev => ({ ...prev, declared_value: e.target.value }))}
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
                    onChange={(e) => setPackageDetails(prev => ({ ...prev, length: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="width">Width (cm)</Label>
                  <Input
                    id="width"
                    type="number"
                    min="1"
                    value={packageDetails.width}
                    onChange={(e) => setPackageDetails(prev => ({ ...prev, width: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    min="1"
                    value={packageDetails.height}
                    onChange={(e) => setPackageDetails(prev => ({ ...prev, height: e.target.value }))}
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
                  value={packageDetails.cod_amount}
                  onChange={(e) => setPackageDetails(prev => ({ ...prev, cod_amount: e.target.value }))}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Set to order total if payment is still pending
                </p>
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
          <div className="space-y-6">
            <div>
              <h4 className="font-medium mb-4">Available Shipping Options</h4>
              <div className="space-y-3">
                {carrierOptions.map((option, index) => (
                  <div
                    key={index}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                      selectedOption === option
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedOption(option)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h5 className="font-medium">{option.carrier_name}</h5>
                        <p className="text-sm text-muted-foreground">{option.service_name}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Estimated delivery: {option.delivery_time}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{option.price} {option.currency}</p>
                        {option.cod_available && packageDetails.cod_amount !== '0' && (
                          <p className="text-xs text-green-600">COD Available</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep('package')} disabled={loading}>
                Back
              </Button>
              <Button onClick={handleCreateOrder} disabled={!selectedOption || loading}>
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
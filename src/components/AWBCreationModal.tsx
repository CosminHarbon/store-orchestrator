import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { useEffect } from 'react';

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  total: number;
  payment_status?: string;
  delivery_type?: string | null;
  locker_name?: string | null;
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
  onSuccess: (result?: {
    awb_number?: string;
    tracking_url?: string;
    label_url?: string | null;
    locker_deposit_code?: string | null;
    cod_amount?: number | null;
    carrier_name?: string | null;
    service_name?: string | null;
    shipping_cost?: number | null;
    estimated_delivery_date?: string | null;
  }) => void;
}

function isOrderCod(order: Order) {
  return String(order.payment_status || '').toLowerCase() === 'cash';
}

export const AWBCreationModal = ({ isOpen, onClose, order, onSuccess }: AWBCreationModalProps) => {
  const { t: tShipping } = useTranslation('shipping');
  const { t: tCommon } = useTranslation('common');
  const { t: tOrders } = useTranslation('orders');
  const [step, setStep] = useState<'package' | 'pricing' | 'creating'>('package');
  const [loading, setLoading] = useState(false);
  const [carrierOptions, setCarrierOptions] = useState<any[]>([]);
  const [selectedCarrierOption, setSelectedCarrierOption] = useState<any | null>(null);
  const [showAddressOverride, setShowAddressOverride] = useState(false);
  const [addressOverride, setAddressOverride] = useState({
    city: '',
    county: '',
    postal_code: ''
  });
  const [progress, setProgress] = useState(0);
  
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

  const orderIsCod = isOrderCod(order);

  useEffect(() => {
    if (!isOpen) return;
    setPackageDetails((prev) => ({
      ...prev,
      declared_value: order.total,
      // COD amount is driven by order payment_status on the server; keep UI in sync for display
      cod_amount: orderIsCod ? order.total : prev.cod_amount,
    }));
  }, [isOpen, order.id, order.total, orderIsCod]);

  const handleCalculatePrices = async () => {
    if (!packageDetails.contents.trim()) {
      toast.error(tShipping('awb.toast.contentsRequired'));
      return;
    }

    setLoading(true);
    setProgress(0);
    
    // Animate progress while loading
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return 90;
        return prev + 10;
      });
    }, 300);
    
    try {
      const requestBody: any = {
        action: 'calculate_prices',
        order_id: order.id,
        package_details: packageDetails,
        address_override: (addressOverride.city || addressOverride.county || addressOverride.postal_code) ? {
          city: addressOverride.city || undefined,
          county: addressOverride.county || undefined,
          postal_code: addressOverride.postal_code || undefined
        } : undefined
      };

      // Pass delivery type and carrier code for filtering
      if ((order as any).delivery_type) {
        requestBody.delivery_type = (order as any).delivery_type;
      }
      if ((order as any).selected_carrier_code) {
        requestBody.selected_carrier_code = (order as any).selected_carrier_code;
      }

      const { data, error } = await supabase.functions.invoke('eawb-delivery', {
        body: requestBody
      });

      if (error) throw error;

      if (data.success && Array.isArray(data.quotes) && data.quotes.length > 0) {
        // Transform the response format to match the expected format
        const transformedOptions = data.quotes.map((quote: any) => ({
          carrier_info: {
            id: quote.carrier_id,
            name: quote.carrier_name,
            logo_url: quote.carrier_logo
          },
          service_info: {
            id: quote.service_id,
            name: quote.service_name,
            description: quote.service_description || ''
          },
          price: {
            amount: quote.price,
            vat: 0,
            total: quote.price,
            currency: quote.currency || 'RON'
          },
          estimated_pickup_date: quote.estimated_pickup_date || tShipping('awb.nextBusinessDay'),
          estimated_delivery_date: quote.estimated_delivery_date || '2-3 business days',
          carrier_id: quote.carrier_id,
          service_id: quote.service_id
        }));
        
        setCarrierOptions(transformedOptions);
        setStep('pricing');
      } else {
        console.error('Price calculation failed:', data);
        
        let errorMessage = data?.message || data?.error || tShipping('awb.toast.noQuotes');
        
        if (data?.error === 'NO_QUOTES') {
          errorMessage = tShipping('awb.toast.noQuotes');
        } else if (data?.error === 'MISSING_API_KEY') {
          errorMessage = tShipping('awb.toast.ibanRequired');
        }
        
        console.log('Debug info:', data?.debug_info);
        toast.error(errorMessage);
        return;
      }
    } catch (error: any) {
      console.error('Error calculating prices:', error);
      toast.error(error.message || tShipping('awb.toast.calcFailed'));
    } finally {
      clearInterval(progressInterval);
      setProgress(100);
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 200);
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedCarrierOption) {
      toast.error(tShipping('awb.toast.selectCarrier'));
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
          selected_carrier: selectedCarrierOption?.carrier_id,
          selected_service: selectedCarrierOption?.service_id,
          address_override: (addressOverride.city || addressOverride.county || addressOverride.postal_code) ? {
            city: addressOverride.city || undefined,
            county: addressOverride.county || undefined,
            postal_code: addressOverride.postal_code || undefined
          } : undefined
        }
      });

      if (error) throw error;

      if (data.success) {
        const bits = [`AWB ${data.awb_number}`];
        if (data.locker_deposit_code) bits.push(`Deposit code ${data.locker_deposit_code}`);
        if (data.cod_amount) bits.push(`COD ${Number(data.cod_amount).toFixed(2)} RON`);
        toast.success(tShipping('awb.toast.created', { details: bits.join(' · ') }));
        onSuccess({
          awb_number: data.awb_number,
          tracking_url: data.tracking_url,
          label_url: data.label_url,
          locker_deposit_code: data.locker_deposit_code,
          cod_amount: data.cod_amount,
          carrier_name: data.carrier_name,
          service_name: data.service_name,
          shipping_cost: data.shipping_cost,
          estimated_delivery_date: data.estimated_delivery_date,
        });
        onClose();
        // Reset state
        setStep('package');
        setCarrierOptions([]);
        setSelectedCarrierOption(null);
      } else {
        console.error('AWB creation failed:', data);
        
        let errorMessage = data?.message || data?.error || tShipping('awb.toast.createFailed');
        
        if (data?.error === 'MISSING_API_KEY') {
          errorMessage = tShipping('awb.toast.ibanRequired');
        } else if (data?.error === 'COD_IBAN_MISSING') {
          errorMessage = data.message;
        } else if (data?.error === 'COD_AMOUNT_INVALID') {
          errorMessage = data.message;
        } else if (data?.error === 'AWB_CREATION_FAILED') {
          errorMessage = data.message || tShipping('awb.toast.createFailed');
        }
        
        console.log('AWB creation response:', JSON.stringify(data, null, 2));
        toast.error(errorMessage, { duration: 8000 });
        setStep('pricing');
        return;
      }
    } catch (error: any) {
      console.error('Error creating AWB:', error);
      let message = error?.message || tShipping('awb.toast.createFailed');
      try {
        const body = await error?.context?.json?.();
        if (body?.message) message = body.message;
      } catch (_e) { /* ignore */ }
      toast.error(message);
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
      setShowAddressOverride(false);
      setAddressOverride({ city: '', county: '', postal_code: '' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.25rem)] max-h-[min(92dvh,880px)] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 px-4 sm:px-6 pt-5 pb-3 pr-12 border-b text-left space-y-1.5">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {tShipping('awb.createTitle', { id: order.id.slice(-8) })}
          </DialogTitle>
          <DialogDescription>
            {tShipping('awb.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4">
          {orderIsCod && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm space-y-0.5">
              <p className="font-medium text-amber-950 dark:text-amber-100">
                {tShipping('summary.cod')}{' '}
                <span className="font-mono font-semibold">{order.total.toFixed(2)} {tCommon('ron')}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {tShipping('awb.codBannerHint')}
              </p>
              {order.delivery_type === 'locker' && order.locker_name && (
                <p className="text-xs">{tShipping('summary.lockerLabel')} <strong>{order.locker_name}</strong></p>
              )}
            </div>
          )}

          {step === 'package' && loading && (
            <div className="space-y-6 py-8">
              <div className="text-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">{tShipping('awb.gettingQuotes')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {tShipping('awb.comparingPrices')}
                  </p>
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-muted-foreground">{tShipping('awb.progressComplete', { progress })}</p>
                </div>
              </div>
            </div>
          )}

          {step === 'package' && !loading && (
            <div className="space-y-5">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">{tShipping('awb.deliveryDetails')}</h4>
                <div className="text-sm space-y-1">
                  <p><strong>{tOrders('table.customer')}:</strong> {order.customer_name}</p>
                  <p><strong>{tCommon('address')}:</strong> {order.customer_address}</p>
                  <p><strong>{tCommon('phone')}:</strong> {order.customer_phone}</p>
                  <p><strong>{tCommon('email')}:</strong> {order.customer_email}</p>
                  {(order as any).delivery_type === 'locker' && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800">
                      <p className="font-medium text-blue-900 dark:text-blue-100">{tShipping('awb.lockerDeliveryLabel')}</p>
                      <p className="text-blue-800 dark:text-blue-200"><strong>{tShipping('summary.courier')}:</strong> {(order as any).selected_carrier_code}</p>
                      <p className="text-blue-800 dark:text-blue-200"><strong>{tOrders('locker')}:</strong> {(order as any).locker_name}</p>
                      {(order as any).locker_address && (
                        <p className="text-blue-800 dark:text-blue-200 text-xs mt-1">{(order as any).locker_address}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <Collapsible open={showAddressOverride} onOpenChange={setShowAddressOverride}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between">
                    {tShipping('awb.addressOverride')}
                    {showAddressOverride ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 mt-4 p-4 border rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    {tShipping('awb.addressOverrideHelp')}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="override_city">{tShipping('awb.field.city')}</Label>
                      <Input
                        id="override_city"
                        value={addressOverride.city}
                        onChange={(e) => setAddressOverride(prev => ({ ...prev, city: e.target.value }))}
                        placeholder={tShipping('awb.placeholder.city')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="override_county">{tShipping('awb.field.county')}</Label>
                      <Input
                        id="override_county"
                        value={addressOverride.county}
                        onChange={(e) => setAddressOverride(prev => ({ ...prev, county: e.target.value }))}
                        placeholder={tShipping('awb.placeholder.county')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="override_postal">{tShipping('awb.field.postal')}</Label>
                      <Input
                        id="override_postal"
                        value={addressOverride.postal_code}
                        onChange={(e) => setAddressOverride(prev => ({ ...prev, postal_code: e.target.value }))}
                        placeholder={tShipping('awb.placeholder.postal')}
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="space-y-4">
                <h4 className="font-medium">{tShipping('awb.packageDetails')}</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weight">{tShipping('awb.field.weight')}</Label>
                    <Input
                      id="weight"
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={packageDetails.weight}
                      onChange={(e) => setPackageDetails(prev => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))}
                      placeholder="1.0"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parcels">{tShipping('awb.field.parcels')}</Label>
                    <Input
                      id="parcels"
                      type="number"
                      value={packageDetails.parcels}
                      onChange={(e) => setPackageDetails(prev => ({ ...prev, parcels: parseInt(e.target.value) || 1 }))}
                      placeholder="1"
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="length">{tShipping('awb.field.length')}</Label>
                    <Input
                      id="length"
                      type="number"
                      min="1"
                      value={packageDetails.length}
                      onChange={(e) => setPackageDetails(prev => ({ ...prev, length: parseInt(e.target.value) || 0 }))}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="width">{tShipping('awb.field.width')}</Label>
                    <Input
                      id="width"
                      type="number"
                      min="1"
                      value={packageDetails.width}
                      onChange={(e) => setPackageDetails(prev => ({ ...prev, width: parseInt(e.target.value) || 0 }))}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height">{tShipping('awb.field.height')}</Label>
                    <Input
                      id="height"
                      type="number"
                      min="1"
                      value={packageDetails.height}
                      onChange={(e) => setPackageDetails(prev => ({ ...prev, height: parseInt(e.target.value) || 0 }))}
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contents">{tShipping('awb.field.contents')}</Label>
                  <Textarea
                    id="contents"
                    value={packageDetails.contents}
                    onChange={(e) => setPackageDetails(prev => ({ ...prev, contents: e.target.value }))}
                    placeholder={tShipping('awb.field.contentsPlaceholder')}
                    rows={2}
                  />
                </div>

                {orderIsCod ? (
                  <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <Label>{tShipping('awb.field.cod')}</Label>
                    <p className="font-mono text-lg font-semibold">{order.total.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      {tShipping('awb.codLockedHint')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="cod_amount">{tShipping('awb.field.codOptional')}</Label>
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
                      placeholder={tShipping('awb.field.codPlaceholder')}
                      inputMode="decimal"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="declared_value">{tShipping('awb.field.declaredValue')}</Label>
                  <Input
                    id="declared_value"
                    type="number"
                    step="0.01"
                    min="0"
                    value={packageDetails.declared_value}
                    onChange={(e) => setPackageDetails(prev => ({ ...prev, declared_value: parseFloat(e.target.value) || 0 }))}
                    inputMode="decimal"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'pricing' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{tShipping('awb.chooseOption')}</h3>
                <p className="text-sm text-muted-foreground shrink-0">{tShipping('awb.optionCount', { count: carrierOptions.length })}</p>
              </div>
              
              <div className="grid gap-3">
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
                      <div className="flex-1 min-w-0">
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
                            <span className="font-medium">{tShipping('awb.pickupLabel')}:</span> {option.estimated_pickup_date}
                          </div>
                          <div>
                            <span className="font-medium">{tShipping('awb.deliveryLabel')}:</span> {option.estimated_delivery_date}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right ml-4 shrink-0">
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
                          {tShipping('awb.selectedForAwb')}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {carrierOptions.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">{tShipping('awb.noOptions')}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tShipping('awb.noOptionsHint')}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 'creating' && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mb-4" />
              <p className="text-lg font-medium">{tShipping('awb.creatingAwb')}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {tShipping('awb.creatingAwbHint')}
              </p>
            </div>
          )}
        </div>

        {(step === 'package' && !loading) || step === 'pricing' ? (
          <div className="shrink-0 border-t bg-background px-4 sm:px-6 py-3 flex flex-col sm:flex-row gap-2 sm:justify-between">
            {step === 'package' && !loading && (
              <>
                <Button variant="outline" onClick={handleClose} disabled={loading} className="w-full sm:w-auto order-2 sm:order-1">
                  {tCommon('cancel')}
                </Button>
                <Button onClick={handleCalculatePrices} disabled={loading} className="w-full sm:w-auto order-1 sm:order-2">
                  {tShipping('awb.getShippingQuotes')}
                </Button>
              </>
            )}
            {step === 'pricing' && (
              <>
                <Button variant="outline" onClick={() => setStep('package')} disabled={loading} className="w-full sm:w-auto">
                  {tCommon('back')}
                </Button>
                <Button onClick={handleCreateOrder} disabled={!selectedCarrierOption || loading} className="w-full sm:w-auto">
                  {tShipping('awb.createButton')}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
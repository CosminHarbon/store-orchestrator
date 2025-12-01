import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Sparkles, 
  Store, 
  CreditCard, 
  Truck, 
  FileText, 
  Palette, 
  CheckCircle2,
  ExternalLink,
  Video,
  ChevronRight,
  ChevronLeft,
  X
} from 'lucide-react';

type Step = 'welcome' | 'store' | 'payment' | 'shipping' | 'invoicing' | 'template' | 'complete';

const SetupWizard = () => {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [profileData, setProfileData] = useState<any>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const steps: Step[] = ['welcome', 'store', 'payment', 'shipping', 'invoicing', 'template', 'complete'];
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (data) {
      setProfileData(data);
      setStoreName(data.store_name || '');
    }
  };

  const completeSetup = async () => {
    if (!user) return;
    
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ setup_completed: true })
      .eq('user_id', user.id);
    
    if (error) {
      toast.error('Failed to complete setup');
    } else {
      toast.success('Setup completed! Welcome to your store.');
      navigate('/app');
    }
    setLoading(false);
  };

  const skipSetup = async () => {
    if (!user) return;
    
    const { error } = await supabase
      .from('profiles')
      .update({ welcome_dismissed: true })
      .eq('user_id', user.id);
    
    if (!error) {
      navigate('/app');
    }
  };

  const updateStoreName = async () => {
    if (!user || !storeName.trim()) {
      toast.error('Please enter a store name');
      return;
    }
    
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ 
        store_name: storeName,
        setup_completed: true // Mark setup as complete once store name is added
      })
      .eq('user_id', user.id);
    
    if (error) {
      toast.error('Failed to save store name');
    } else {
      toast.success('Store name saved! Setup complete.');
      navigate('/app');
    }
    setLoading(false);
  };

  const nextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex]);
    }
  };

  const prevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex]);
    }
  };

  const getStepIcon = (step: Step) => {
    switch (step) {
      case 'welcome': return <Sparkles className="h-5 w-5" />;
      case 'store': return <Store className="h-5 w-5" />;
      case 'payment': return <CreditCard className="h-5 w-5" />;
      case 'shipping': return <Truck className="h-5 w-5" />;
      case 'invoicing': return <FileText className="h-5 w-5" />;
      case 'template': return <Palette className="h-5 w-5" />;
      case 'complete': return <CheckCircle2 className="h-5 w-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl shadow-xl">
        <CardHeader className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4"
            onClick={skipSetup}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3 mb-4">
            {getStepIcon(currentStep)}
            <CardTitle className="text-2xl">Store Setup Wizard</CardTitle>
          </div>
          <CardDescription>
            Let's get your store configured in just a few steps
          </CardDescription>
          <div className="mt-4">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Step {currentStepIndex + 1} of {steps.length}
            </p>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <Tabs value={currentStep}>
            {/* Welcome Step */}
            <TabsContent value="welcome" className="space-y-6">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <Sparkles className="h-10 w-10 text-primary" />
                </div>
                <h2 className="text-3xl font-bold">Welcome! 🎉</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  We're excited to help you set up your online store. This wizard will guide you through 
                  configuring payments, shipping, invoicing, and customizing your storefront.
                </p>
                
                {/* Video Tutorial Card */}
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Video className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Quick Start Video</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Watch this 5-minute tutorial to understand the setup process
                    </p>
                    <Button variant="outline" className="w-full" asChild>
                      <a href="https://www.youtube.com/watch?v=YOUR_VIDEO_ID" target="_blank" rel="noopener noreferrer">
                        <Video className="h-4 w-4 mr-2" />
                        Watch Setup Tutorial
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </a>
                    </Button>
                  </CardContent>
                </Card>

                <div className="flex gap-3 justify-center pt-4">
                  <Button variant="outline" onClick={skipSetup}>
                    Skip Setup
                  </Button>
                  <Button onClick={nextStep}>
                    Get Started
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Store Info Step */}
            <TabsContent value="store" className="space-y-6">
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold">Store Information</h2>
                  <p className="text-muted-foreground">
                    Let's start with your store name
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="store-name">Store Name</Label>
                  <Input
                    id="store-name"
                    placeholder="My Amazing Store"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    This will appear on your storefront and in customer communications
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button onClick={updateStoreName} disabled={loading} className="flex-1">
                    Save & Complete Setup
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Once you add your store name, you can configure other settings anytime from the dashboard
                </p>
              </div>
            </TabsContent>

            {/* Payment Setup Step */}
            <TabsContent value="payment" className="space-y-6">
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold">Payment Setup</h2>
                  <p className="text-muted-foreground">
                    Configure Netopia for card payments
                  </p>
                </div>

                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Netopia Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      To accept card payments, you'll need a Netopia merchant account. Follow these steps:
                    </p>
                    
                    <ol className="space-y-2 text-sm list-decimal list-inside">
                      <li>Create a Netopia merchant account at <a href="https://netopia-payments.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">netopia-payments.com</a></li>
                      <li>Get your API credentials (POS ID, API Key, Public Key, Signature)</li>
                      <li>Add them in Store Settings → Payment Provider</li>
                    </ol>

                    <div className="flex flex-col gap-2">
                      <Button variant="outline" asChild>
                        <a href="https://netopia-payments.com" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open Netopia Website
                        </a>
                      </Button>
                      <Button variant="outline" onClick={() => navigate('/app')}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Configure in Settings Now
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button variant="ghost" onClick={nextStep}>
                    Skip for Now
                  </Button>
                  <Button onClick={nextStep} className="flex-1">
                    Continue
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Shipping Setup Step */}
            <TabsContent value="shipping" className="space-y-6">
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold">Shipping Setup</h2>
                  <p className="text-muted-foreground">
                    Configure eAWB.ro for shipping
                  </p>
                </div>

                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      eAWB.ro Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      eAWB.ro provides integrated shipping with multiple carriers. Here's how to set it up:
                    </p>
                    
                    <ol className="space-y-2 text-sm list-decimal list-inside">
                      <li>Create an account at <a href="https://www.eawb.ro" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">eawb.ro</a></li>
                      <li>Get your API key from your account settings</li>
                      <li>Configure your billing address and default carrier</li>
                      <li>Add credentials in Store Settings → Shipping Provider</li>
                    </ol>

                    <div className="flex flex-col gap-2">
                      <Button variant="outline" asChild>
                        <a href="https://www.eawb.ro" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open eAWB Website
                        </a>
                      </Button>
                      <Button variant="outline" onClick={() => navigate('/app')}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Configure in Settings Now
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button variant="ghost" onClick={nextStep}>
                    Skip for Now
                  </Button>
                  <Button onClick={nextStep} className="flex-1">
                    Continue
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Invoicing Setup Step */}
            <TabsContent value="invoicing" className="space-y-6">
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold">Invoicing Setup</h2>
                  <p className="text-muted-foreground">
                    Configure Oblio.eu for automatic invoicing
                  </p>
                </div>

                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Oblio.eu Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Oblio.eu automates invoice generation for your orders. Setup steps:
                    </p>
                    
                    <ol className="space-y-2 text-sm list-decimal list-inside">
                      <li>Create an Oblio account at <a href="https://www.oblio.eu" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">oblio.eu</a></li>
                      <li>Get your API key from account settings</li>
                      <li>Configure your invoice series name and first number</li>
                      <li>Add credentials in Store Settings → Invoicing Provider</li>
                    </ol>

                    <div className="flex flex-col gap-2">
                      <Button variant="outline" asChild>
                        <a href="https://www.oblio.eu" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open Oblio Website
                        </a>
                      </Button>
                      <Button variant="outline" onClick={() => navigate('/app')}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Configure in Settings Now
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button variant="ghost" onClick={nextStep}>
                    Skip for Now
                  </Button>
                  <Button onClick={nextStep} className="flex-1">
                    Continue
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Template Customization Step */}
            <TabsContent value="template" className="space-y-6">
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold">Storefront Design</h2>
                  <p className="text-muted-foreground">
                    Customize your store's appearance
                  </p>
                </div>

                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Palette className="h-5 w-5" />
                      Template Customization
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Make your store unique by customizing:
                    </p>
                    
                    <ul className="space-y-2 text-sm list-disc list-inside">
                      <li>Colors, fonts, and branding</li>
                      <li>Hero section with custom images</li>
                      <li>Layout and product display styles</li>
                      <li>Logo and store identity</li>
                    </ul>

                    <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
                      <Palette className="h-4 w-4 mr-2" />
                      Open Template Designer
                    </Button>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button variant="ghost" onClick={nextStep}>
                    Skip for Now
                  </Button>
                  <Button onClick={nextStep} className="flex-1">
                    Continue
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Complete Step */}
            <TabsContent value="complete" className="space-y-6">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </div>
                <h2 className="text-3xl font-bold">You're All Set! 🎊</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Your store is ready to go! You can always update your settings later from the Store Settings page.
                </p>

                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-lg">Next Steps</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-left">
                    <p>✅ Add your first products</p>
                    <p>✅ Create collections to organize products</p>
                    <p>✅ Test your checkout process</p>
                    <p>✅ Share your store link with customers</p>
                  </CardContent>
                </Card>

                <div className="flex gap-3 justify-center pt-4">
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button onClick={completeSetup} disabled={loading} size="lg">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Complete Setup
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default SetupWizard;

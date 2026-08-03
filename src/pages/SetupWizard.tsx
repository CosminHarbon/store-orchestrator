import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
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
      toast.error(t('setup.toast.completeFailed'));
    } else {
      toast.success(t('setup.toast.completeSuccess'));
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
      toast.error(t('setup.toast.storeNameRequired'));
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
      toast.error(t('setup.toast.storeNameSaveFailed'));
    } else {
      toast.success(t('setup.toast.storeNameSaved'));
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
            <CardTitle className="text-2xl">{t('setup.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('setup.subtitle')}
          </CardDescription>
          <div className="mt-4">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {t('setup.stepOf', { current: currentStepIndex + 1, total: steps.length })}
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
                <h2 className="text-3xl font-bold">{t('setup.welcome.heading')}</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  {t('setup.welcome.description')}
                </p>
                
                {/* Video Tutorial Card */}
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Video className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{t('setup.welcome.videoTitle')}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t('setup.welcome.videoDesc')}
                    </p>
                    <Button variant="outline" className="w-full" asChild>
                      <a href="https://www.youtube.com/watch?v=YOUR_VIDEO_ID" target="_blank" rel="noopener noreferrer">
                        <Video className="h-4 w-4 mr-2" />
                        {t('setup.welcome.watchTutorial')}
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </a>
                    </Button>
                  </CardContent>
                </Card>

                <div className="flex gap-3 justify-center pt-4">
                  <Button variant="outline" onClick={skipSetup}>
                    {t('setup.buttons.skipSetup')}
                  </Button>
                  <Button onClick={nextStep}>
                    {t('setup.buttons.getStarted')}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Store Info Step */}
            <TabsContent value="store" className="space-y-6">
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold">{t('setup.store.title')}</h2>
                  <p className="text-muted-foreground">
                    {t('setup.store.subtitle')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="store-name">{t('setup.store.nameLabel')}</Label>
                  <Input
                    id="store-name"
                    placeholder={t('setup.store.namePlaceholder')}
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('setup.store.nameHelp')}
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    {tCommon('back')}
                  </Button>
                  <Button onClick={updateStoreName} disabled={loading} className="flex-1">
                    {t('setup.store.saveAndComplete')}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  {t('setup.store.footerNote')}
                </p>
              </div>
            </TabsContent>

            {/* Payment Setup Step */}
            <TabsContent value="payment" className="space-y-6">
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold">{t('setup.payment.title')}</h2>
                  <p className="text-muted-foreground">
                    {t('setup.payment.subtitle')}
                  </p>
                </div>

                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      {t('setup.payment.configTitle')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t('setup.payment.intro')}
                    </p>
                    
                    <ol className="space-y-2 text-sm list-decimal list-inside">
                      <li>{t('setup.payment.step1Prefix')} <a href="https://netopia-payments.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">netopia-payments.com</a></li>
                      <li>{t('setup.payment.step2')}</li>
                      <li>{t('setup.payment.step3')}</li>
                      <li>{t('setup.payment.step4')}</li>
                      <li>{t('setup.payment.step5')}</li>
                    </ol>

                    <div className="flex flex-col gap-2">
                      <Button variant="outline" asChild>
                        <a href="https://netopia-payments.com" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          {t('setup.payment.openWebsite')}
                        </a>
                      </Button>
                      <Button variant="outline" onClick={() => navigate('/app')}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {t('setup.buttons.configureInSettings')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    {tCommon('back')}
                  </Button>
                  <Button variant="ghost" onClick={nextStep}>
                    {t('setup.buttons.skipForNow')}
                  </Button>
                  <Button onClick={nextStep} className="flex-1">
                    {tCommon('continue')}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Shipping Setup Step */}
            <TabsContent value="shipping" className="space-y-6">
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold">{t('setup.shipping.title')}</h2>
                  <p className="text-muted-foreground">
                    {t('setup.shipping.subtitle')}
                  </p>
                </div>

                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      {t('setup.shipping.configTitle')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t('setup.shipping.intro')}
                    </p>
                    
                    <ol className="space-y-2 text-sm list-decimal list-inside">
                      <li>{t('setup.shipping.step1Prefix')} <a href="https://www.eawb.ro" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">eawb.ro</a></li>
                      <li>{t('setup.shipping.step2')}</li>
                      <li>{t('setup.shipping.step3')}</li>
                      <li>{t('setup.shipping.step4')}</li>
                    </ol>

                    <div className="flex flex-col gap-2">
                      <Button variant="outline" asChild>
                        <a href="https://www.eawb.ro" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          {t('setup.shipping.openWebsite')}
                        </a>
                      </Button>
                      <Button variant="outline" onClick={() => navigate('/app')}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {t('setup.buttons.configureInSettings')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    {tCommon('back')}
                  </Button>
                  <Button variant="ghost" onClick={nextStep}>
                    {t('setup.buttons.skipForNow')}
                  </Button>
                  <Button onClick={nextStep} className="flex-1">
                    {tCommon('continue')}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Invoicing Setup Step */}
            <TabsContent value="invoicing" className="space-y-6">
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold">{t('setup.invoicing.title')}</h2>
                  <p className="text-muted-foreground">
                    {t('setup.invoicing.subtitle')}
                  </p>
                </div>

                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {t('setup.invoicing.configTitle')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t('setup.invoicing.intro')}
                    </p>
                    
                    <ol className="space-y-2 text-sm list-decimal list-inside">
                      <li>{t('setup.invoicing.step1Prefix')} <a href="https://www.oblio.eu" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">oblio.eu</a></li>
                      <li>{t('setup.invoicing.step2')}</li>
                      <li>{t('setup.invoicing.step3')}</li>
                      <li>{t('setup.invoicing.step4')}</li>
                    </ol>

                    <div className="flex flex-col gap-2">
                      <Button variant="outline" asChild>
                        <a href="https://www.oblio.eu" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          {t('setup.invoicing.openWebsite')}
                        </a>
                      </Button>
                      <Button variant="outline" onClick={() => navigate('/app')}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {t('setup.buttons.configureInSettings')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    {tCommon('back')}
                  </Button>
                  <Button variant="ghost" onClick={nextStep}>
                    {t('setup.buttons.skipForNow')}
                  </Button>
                  <Button onClick={nextStep} className="flex-1">
                    {tCommon('continue')}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Template Customization Step */}
            <TabsContent value="template" className="space-y-6">
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold">{t('setup.template.title')}</h2>
                  <p className="text-muted-foreground">
                    {t('setup.template.subtitle')}
                  </p>
                </div>

                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Palette className="h-5 w-5" />
                      {t('setup.template.configTitle')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t('setup.template.intro')}
                    </p>
                    
                    <ul className="space-y-2 text-sm list-disc list-inside">
                      <li>{t('setup.template.item1')}</li>
                      <li>{t('setup.template.item2')}</li>
                      <li>{t('setup.template.item3')}</li>
                      <li>{t('setup.template.item4')}</li>
                    </ul>

                    <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
                      <Palette className="h-4 w-4 mr-2" />
                      {t('setup.template.openDesigner')}
                    </Button>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    {tCommon('back')}
                  </Button>
                  <Button variant="ghost" onClick={nextStep}>
                    {t('setup.buttons.skipForNow')}
                  </Button>
                  <Button onClick={nextStep} className="flex-1">
                    {tCommon('continue')}
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
                <h2 className="text-3xl font-bold">{t('setup.complete.heading')}</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  {t('setup.complete.description')}
                </p>

                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-lg">{t('setup.complete.nextStepsTitle')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-left">
                    <p>✅ {t('setup.complete.step1')}</p>
                    <p>✅ {t('setup.complete.step2')}</p>
                    <p>✅ {t('setup.complete.step3')}</p>
                    <p>✅ {t('setup.complete.step4')}</p>
                  </CardContent>
                </Card>

                <div className="flex gap-3 justify-center pt-4">
                  <Button variant="outline" onClick={prevStep}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    {tCommon('back')}
                  </Button>
                  <Button onClick={completeSetup} disabled={loading} size="lg">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {t('setup.buttons.completeSetup')}
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

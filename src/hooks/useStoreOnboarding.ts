import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  ONBOARDING_STEPS,
  PROGRESS_STEPS,
  OnboardingState,
  OnboardingStepId,
  StepStatus,
  emptyOnboardingState,
  isDefaultStoreName,
  parseOnboardingState,
} from '@/components/onboarding/onboardingTypes';

type ProfileRow = {
  store_name: string | null;
  setup_completed: boolean | null;
  welcome_dismissed: boolean | null;
  onboarding_state: unknown;
  netpopia_api_key: string | null;
  netpopia_signature: string | null;
  eawb_api_key: string | null;
  store_api_key: string;
  eawb_shipping_address_id?: number | null;
  eawb_billing_address_id?: number | null;
  eawb_pickup_locker_id?: string | null;
  eawb_pickup_locker_name?: string | null;
  eawb_pickup_locker_address?: string | null;
  eawb_pickup_locker_carrier_id?: number | null;
  eawb_pickup_locker_carrier_code?: string | null;
  eawb_pickup_locker_county?: string | null;
  eawb_pickup_locker_city?: string | null;
};

export function useStoreOnboarding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ['store-onboarding-profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'store_name, setup_completed, welcome_dismissed, onboarding_state, netpopia_api_key, netpopia_signature, eawb_api_key, store_api_key, eawb_shipping_address_id, eawb_billing_address_id, eawb_pickup_locker_id, eawb_pickup_locker_name, eawb_pickup_locker_address, eawb_pickup_locker_carrier_id, eawb_pickup_locker_carrier_code, eawb_pickup_locker_county, eawb_pickup_locker_city'
        )
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data as ProfileRow;
    },
  });

  const productsQuery = useQuery({
    queryKey: ['store-onboarding-products', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id);
      if (error) throw error;
      return count || 0;
    },
  });

  const customizationQuery = useQuery({
    queryKey: ['store-onboarding-customization', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_customization')
        .select('id, logo_url, store_name, template_id')
        .eq('user_id', user!.id)
        .eq('template_id', 'elementar')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const state = useMemo(
    () => parseOnboardingState(profileQuery.data?.onboarding_state),
    [profileQuery.data?.onboarding_state]
  );

  const derived = useMemo(() => {
    const storeDone = !isDefaultStoreName(profileQuery.data?.store_name);
    const paymentsDone = Boolean(
      profileQuery.data?.netpopia_api_key?.trim() &&
        profileQuery.data?.netpopia_signature?.trim()
    );
    const shippingDone = Boolean(profileQuery.data?.eawb_api_key?.trim());
    const productDone = (productsQuery.data || 0) > 0;
    const storefrontDone = Boolean(
      state.selected_template || customizationQuery.data?.id
    );
    const settingsDone = Boolean(customizationQuery.data?.logo_url?.trim());
    return {
      store: storeDone,
      storefront: storefrontDone,
      product: productDone,
      payments: paymentsDone,
      shipping: shippingDone,
      settings: settingsDone,
    };
  }, [profileQuery.data, productsQuery.data, customizationQuery.data, state.selected_template]);

  const effectiveStatus = useCallback(
    (step: OnboardingStepId): StepStatus => {
      const saved = state.steps[step];
      if (saved === 'skipped') return 'skipped';
      if (step === 'welcome') return saved === 'completed' ? 'completed' : saved || 'not_started';
      if (step === 'review' || step === 'ready') {
        return saved || 'not_started';
      }
      if (derived[step as keyof typeof derived]) return 'completed';
      return saved || 'not_started';
    },
    [derived, state.steps]
  );

  const progress = useMemo(() => {
    const items = PROGRESS_STEPS.map((step) => ({
      step,
      status: effectiveStatus(step),
    }));
    const done = items.filter(
      (item) => item.status === 'completed' || item.status === 'skipped'
    ).length;
    return { items, done, total: PROGRESS_STEPS.length };
  }, [effectiveStatus]);

  const resumeStep = useMemo(() => {
    if (state.current_step && state.current_step !== 'ready') {
      const status = effectiveStatus(state.current_step);
      if (status !== 'completed' && status !== 'skipped') {
        return state.current_step;
      }
    }
    for (const step of ONBOARDING_STEPS) {
      if (step === 'ready') continue;
      const status = effectiveStatus(step);
      if (status !== 'completed' && status !== 'skipped') return step;
    }
    return 'review' as OnboardingStepId;
  }, [effectiveStatus, state.current_step]);

  const persistMutation = useMutation({
    mutationFn: async (payload: {
      onboarding_state?: OnboardingState;
      store_name?: string;
      welcome_dismissed?: boolean;
      setup_completed?: boolean;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({
          ...(payload.onboarding_state
            ? { onboarding_state: payload.onboarding_state as never }
            : {}),
          ...(payload.store_name !== undefined ? { store_name: payload.store_name } : {}),
          ...(payload.welcome_dismissed !== undefined
            ? { welcome_dismissed: payload.welcome_dismissed }
            : {}),
          ...(payload.setup_completed !== undefined
            ? { setup_completed: payload.setup_completed }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-onboarding-profile'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-profile'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-command-center'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  const saveState = useCallback(
    async (next: OnboardingState, extras?: { welcome_dismissed?: boolean; setup_completed?: boolean }) => {
      await persistMutation.mutateAsync({
        onboarding_state: next,
        ...extras,
      });
    },
    [persistMutation]
  );

  const setStepStatus = useCallback(
    async (step: OnboardingStepId, status: StepStatus, goTo?: OnboardingStepId) => {
      const next: OnboardingState = {
        ...state,
        current_step: goTo || step,
        steps: {
          ...state.steps,
          [step]: status,
        },
      };
      await saveState(next);
      return next;
    },
    [saveState, state]
  );

  const goToStep = useCallback(
    async (step: OnboardingStepId) => {
      const next: OnboardingState = {
        ...state,
        current_step: step,
        steps: {
          ...state.steps,
          [step]:
            state.steps[step] === 'completed' || state.steps[step] === 'skipped'
              ? state.steps[step]
              : 'in_progress',
        },
      };
      await saveState(next);
    },
    [saveState, state]
  );

  const completeStep = useCallback(
    async (step: OnboardingStepId) => {
      const index = ONBOARDING_STEPS.indexOf(step);
      const nextStep = ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)];
      return setStepStatus(step, 'completed', nextStep);
    },
    [setStepStatus]
  );

  const skipStep = useCallback(
    async (step: OnboardingStepId) => {
      const index = ONBOARDING_STEPS.indexOf(step);
      const nextStep = ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)];
      return setStepStatus(step, 'skipped', nextStep);
    },
    [setStepStatus]
  );

  const exitSetup = useCallback(async () => {
    const next: OnboardingState = {
      ...state,
      current_step: resumeStep,
    };
    await saveState(next, { welcome_dismissed: true });
  }, [resumeStep, saveState, state]);

  const finishSetup = useCallback(async () => {
    const next: OnboardingState = {
      ...state,
      current_step: 'ready',
      steps: {
        ...state.steps,
        review: 'completed',
        ready: 'completed',
      },
    };
    await saveState(next, { setup_completed: true, welcome_dismissed: true });
  }, [saveState, state]);

  const saveStoreName = useCallback(
    async (name: string) => {
      if (!user) return;
      const advancingFromStore = state.current_step === 'store' || state.current_step === 'welcome';
      const next: OnboardingState = {
        ...state,
        current_step: advancingFromStore ? 'storefront' : state.current_step,
        steps: { ...state.steps, store: 'completed', welcome: 'completed' },
      };
      await persistMutation.mutateAsync({
        store_name: name.trim(),
        onboarding_state: next,
      });
      await supabase
        .from('template_customization')
        .upsert(
          {
            user_id: user.id,
            template_id: 'elementar',
            store_name: name.trim(),
          } as never,
          { onConflict: 'user_id,template_id' }
        );
      queryClient.invalidateQueries({ queryKey: ['store-onboarding-customization'] });
    },
    [persistMutation, queryClient, state, user]
  );

  const selectTemplate = useCallback(
    async (templateId: 'elementar' | 'premium' | 'floral') => {
      if (!user) return;
      if (templateId === 'elementar') {
        await supabase.from('template_customization').upsert(
          {
            user_id: user.id,
            template_id: 'elementar',
            store_name: profileQuery.data?.store_name || 'My Store',
          } as never,
          { onConflict: 'user_id,template_id' }
        );
      }
      const next: OnboardingState = {
        ...state,
        selected_template: templateId,
        current_step: 'product',
        steps: { ...state.steps, storefront: 'completed' },
      };
      await saveState(next);
      queryClient.invalidateQueries({ queryKey: ['store-onboarding-customization'] });
    },
    [profileQuery.data?.store_name, queryClient, saveState, state, user]
  );

  const nextRecommended = useMemo(() => {
    for (const step of PROGRESS_STEPS) {
      const status = effectiveStatus(step);
      if (status !== 'completed' && status !== 'skipped') return step;
    }
    return null;
  }, [effectiveStatus]);

  return {
    isLoading: profileQuery.isLoading || productsQuery.isLoading,
    profile: profileQuery.data,
    productCount: productsQuery.data || 0,
    customization: customizationQuery.data,
    state,
    derived,
    effectiveStatus,
    progress,
    resumeStep,
    nextRecommended,
    saving: persistMutation.isPending,
    goToStep,
    completeStep,
    skipStep,
    exitSetup,
    finishSetup,
    saveStoreName,
    selectTemplate,
    refreshProducts: () =>
      queryClient.invalidateQueries({ queryKey: ['store-onboarding-products'] }),
    refreshProfile: () =>
      queryClient.invalidateQueries({ queryKey: ['store-onboarding-profile'] }),
    refreshCustomization: () =>
      queryClient.invalidateQueries({ queryKey: ['store-onboarding-customization'] }),
    emptyOnboardingState,
  };
}

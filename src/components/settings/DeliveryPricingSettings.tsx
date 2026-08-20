import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AddressLocalityFields } from '@/components/address/AddressLocalityFields';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import {
  findOverlappingOrderValueRule,
  findOverlappingRule,
  validateOrderValueInput,
  validateRuleInput,
  type CoverageMode,
  type CoveredLocality,
  type DeliveryPricingRule,
  type DistanceCharge,
  type OrderValueRule,
  type PricingMode,
} from '@/lib/delivery/rules';
import { ROMANIA_COUNTIES } from '@/lib/romaniaLocations';

type SettingsRow = {
  user_id: string;
  enabled: boolean;
  coverage_mode: CoverageMode;
  covered_counties: string[];
  covered_localities: CoveredLocality[];
  pricing_mode: PricingMode;
  distance_charge: DistanceCharge;
  max_distance_km: number | null;
  origin_street: string;
  origin_street_number: string;
  origin_city: string;
  origin_county: string;
};

type RuleRow = DeliveryPricingRule & { id: string };
type OrderRuleRow = OrderValueRule & { id: string };

interface Props {
  userId: string;
  apiKey: string;
  originLabel: string;
  ownDelivery?: boolean;
}

const emptyRuleForm = {
  county: '',
  locality: '',
  min_distance_km: '0',
  max_distance_km: '30',
  price_per_unit: '20',
};

const emptyOrderForm = {
  min_order_value: '0',
  max_order_value: '',
  delivery_fee: '15',
};

export function DeliveryPricingSettings({ userId, apiKey, originLabel, ownDelivery = false }: Props) {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyRuleForm);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderForm, setOrderForm] = useState(emptyOrderForm);
  const [originDraft, setOriginDraft] = useState({
    street: '',
    number: '',
    county: '',
    city: '',
  });
  const [maxDistanceDraft, setMaxDistanceDraft] = useState('');
  const [localityDraftCounty, setLocalityDraftCounty] = useState('');
  const [localityDraftCity, setLocalityDraftCity] = useState('');

  const { data: settings } = useQuery({
    queryKey: ['delivery-pricing-settings', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_pricing_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const row = {
          ...data,
          covered_counties: data.covered_counties || [],
          covered_localities: (data.covered_localities || []) as CoveredLocality[],
          pricing_mode: (data.pricing_mode || 'distance') as PricingMode,
          distance_charge: (data.distance_charge || (ownDelivery ? 'flat' : 'per_unit')) as DistanceCharge,
          max_distance_km: data.max_distance_km == null ? null : Number(data.max_distance_km),
          origin_street: data.origin_street || '',
          origin_street_number: data.origin_street_number || '',
          origin_city: data.origin_city || '',
          origin_county: data.origin_county || '',
        } as SettingsRow;
        setOriginDraft({
          street: row.origin_street,
          number: row.origin_street_number,
          county: row.origin_county,
          city: row.origin_city,
        });
        setMaxDistanceDraft(row.max_distance_km == null ? '' : String(row.max_distance_km));
        return row;
      }
      return {
        user_id: userId,
        enabled: ownDelivery,
        coverage_mode: 'romania' as CoverageMode,
        covered_counties: [] as string[],
        covered_localities: [] as CoveredLocality[],
        pricing_mode: 'distance' as PricingMode,
        distance_charge: (ownDelivery ? 'flat' : 'per_unit') as DistanceCharge,
        max_distance_km: null,
        origin_street: '',
        origin_street_number: '',
        origin_city: '',
        origin_county: '',
      };
    },
    enabled: !!userId,
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['delivery-pricing-rules', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_pricing_rules')
        .select('*')
        .eq('user_id', userId)
        .order('county', { ascending: true });
      if (error) throw error;
      return (data || []) as RuleRow[];
    },
    enabled: !!userId,
  });

  const { data: orderRules = [] } = useQuery({
    queryKey: ['delivery-order-value-rules', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_order_value_rules')
        .select('*')
        .eq('user_id', userId)
        .order('min_order_value', { ascending: true });
      if (error) throw error;
      return (data || []) as OrderRuleRow[];
    },
    enabled: !!userId,
  });

  const upsertSettings = useMutation({
    mutationFn: async (patch: Partial<SettingsRow>) => {
      const next = {
        user_id: userId,
        enabled: ownDelivery ? true : (patch.enabled ?? settings?.enabled ?? false),
        coverage_mode: patch.coverage_mode ?? settings?.coverage_mode ?? 'romania',
        covered_counties: patch.covered_counties ?? settings?.covered_counties ?? [],
        covered_localities: patch.covered_localities ?? settings?.covered_localities ?? [],
        pricing_mode: patch.pricing_mode ?? settings?.pricing_mode ?? 'distance',
        distance_charge: patch.distance_charge ?? settings?.distance_charge ?? (ownDelivery ? 'flat' : 'per_unit'),
        max_distance_km: patch.max_distance_km === undefined ? settings?.max_distance_km ?? null : patch.max_distance_km,
        origin_street: patch.origin_street ?? settings?.origin_street ?? '',
        origin_street_number: patch.origin_street_number ?? settings?.origin_street_number ?? '',
        origin_city: patch.origin_city ?? settings?.origin_city ?? '',
        origin_county: patch.origin_county ?? settings?.origin_county ?? '',
      };
      const { error } = await supabase.from('delivery_pricing_settings').upsert(next, {
        onConflict: 'user_id',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-pricing-settings', userId] });
      toast.success(t('deliveryPricing.saved'));
    },
    onError: () => toast.error(t('deliveryPricing.saveFailed')),
  });

  const saveRule = useMutation({
    mutationFn: async () => {
      const min = Number(form.min_distance_km);
      const max = Number(form.max_distance_km);
      const price = Number(form.price_per_unit);
      const invalid = validateRuleInput({
        min_distance_km: min,
        max_distance_km: max,
        price_per_unit: price,
      });
      if (invalid) {
        throw new Error(invalid);
      }
      const payload: DeliveryPricingRule = {
        county: form.county.trim() || null,
        locality: form.locality.trim() || null,
        min_distance_km: min,
        max_distance_km: max,
        price_per_unit: price,
      };
      if (payload.locality && !payload.county) {
        throw new Error('county_required');
      }
      const overlap = findOverlappingRule(payload, rules, editingId || undefined);
      if (overlap) {
        throw new Error('overlap');
      }
      if (editingId) {
        const { error } = await supabase
          .from('delivery_pricing_rules')
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('delivery_pricing_rules').insert({
          ...payload,
          user_id: userId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-pricing-rules', userId] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyRuleForm);
      toast.success(t('deliveryPricing.ruleSaved'));
    },
    onError: (error: Error) => {
      if (error.message === 'min_distance') toast.error(t('deliveryPricing.errMin'));
      else if (error.message === 'max_distance') toast.error(t('deliveryPricing.errMax'));
      else if (error.message === 'price') toast.error(t('deliveryPricing.errPrice'));
      else if (error.message === 'overlap') toast.error(t('deliveryPricing.errOverlap'));
      else if (error.message === 'county_required') toast.error(t('deliveryPricing.errCounty'));
      else toast.error(t('deliveryPricing.saveFailed'));
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('delivery_pricing_rules')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-pricing-rules', userId] });
      toast.success(t('deliveryPricing.ruleDeleted'));
    },
    onError: () => toast.error(t('deliveryPricing.saveFailed')),
  });

  const saveOrderRule = useMutation({
    mutationFn: async () => {
      const min = Number(orderForm.min_order_value);
      const maxRaw = orderForm.max_order_value.trim();
      const max = maxRaw === '' ? null : Number(maxRaw);
      const fee = Number(orderForm.delivery_fee);
      const invalid = validateOrderValueInput({
        min_order_value: min,
        max_order_value: max,
        delivery_fee: fee,
      });
      if (invalid) throw new Error(invalid);
      const payload: OrderValueRule = {
        min_order_value: min,
        max_order_value: max,
        delivery_fee: fee,
      };
      const overlap = findOverlappingOrderValueRule(payload, orderRules, editingOrderId || undefined);
      if (overlap) throw new Error('order_overlap');
      if (editingOrderId) {
        const { error } = await supabase
          .from('delivery_order_value_rules')
          .update(payload)
          .eq('id', editingOrderId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('delivery_order_value_rules').insert({
          ...payload,
          user_id: userId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-order-value-rules', userId] });
      setOrderDialogOpen(false);
      setEditingOrderId(null);
      setOrderForm(emptyOrderForm);
      toast.success(t('deliveryPricing.ruleSaved'));
    },
    onError: (error: Error) => {
      if (error.message === 'min_order') toast.error(t('deliveryPricing.errMinOrder'));
      else if (error.message === 'max_order') toast.error(t('deliveryPricing.errMaxOrder'));
      else if (error.message === 'price') toast.error(t('deliveryPricing.errPrice'));
      else if (error.message === 'order_overlap') toast.error(t('deliveryPricing.errOrderOverlap'));
      else toast.error(t('deliveryPricing.saveFailed'));
    },
  });

  const deleteOrderRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('delivery_order_value_rules')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-order-value-rules', userId] });
      toast.success(t('deliveryPricing.ruleDeleted'));
    },
    onError: () => toast.error(t('deliveryPricing.saveFailed')),
  });

  const enabled = ownDelivery || !!settings?.enabled;
  const pricingMode = settings?.pricing_mode || 'distance';
  const chargeMode = settings?.distance_charge || (ownDelivery ? 'flat' : 'per_unit');
  const perItem = chargeMode === 'per_unit';
  const showDistanceRules = pricingMode === 'distance' || pricingMode === 'combined';
  const showOrderRules = pricingMode === 'order_value' || pricingMode === 'combined';
  const coverageMode = settings?.coverage_mode || 'romania';
  const coveredCounties = settings?.covered_counties || [];
  const coveredLocalities = settings?.covered_localities || [];

  const sortedRules = useMemo(
    () =>
      [...rules].sort((a, b) => {
        const ac = (a.county || '').localeCompare(b.county || '');
        if (ac) return ac;
        const al = (a.locality || '').localeCompare(b.locality || '');
        if (al) return al;
        return Number(a.min_distance_km) - Number(b.min_distance_km);
      }),
    [rules]
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyRuleForm);
    setDialogOpen(true);
  };

  const openEdit = (rule: RuleRow) => {
    setEditingId(rule.id);
    setForm({
      county: rule.county || '',
      locality: rule.locality || '',
      min_distance_km: String(rule.min_distance_km),
      max_distance_km: String(rule.max_distance_km),
      price_per_unit: String(rule.price_per_unit),
    });
    setDialogOpen(true);
  };

  const toggleCounty = (name: string, checked: boolean) => {
    const next = checked
      ? [...coveredCounties, name]
      : coveredCounties.filter((c) => c !== name);
    upsertSettings.mutate({ covered_counties: next });
  };

  const addCoveredLocality = () => {
    if (!localityDraftCounty || !localityDraftCity) return;
    const exists = coveredLocalities.some(
      (item) => item.county === localityDraftCounty && item.locality === localityDraftCity
    );
    if (exists) return;
    upsertSettings.mutate({
      covered_localities: [
        ...coveredLocalities,
        { county: localityDraftCounty, locality: localityDraftCity },
      ],
    });
    setLocalityDraftCity('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {ownDelivery ? t('deliveryPricing.ownTitle') : t('deliveryPricing.title')}
        </CardTitle>
        <CardDescription>
          {ownDelivery ? t('deliveryPricing.ownDesc') : t('deliveryPricing.desc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!ownDelivery && (
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label>{t('deliveryPricing.enable')}</Label>
              <p className="text-xs text-muted-foreground">{t('deliveryPricing.enableHelp')}</p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => upsertSettings.mutate({ enabled: checked })}
            />
          </div>
        )}

        {enabled && (
          <>
            <div className="rounded-md border bg-muted/20 p-3 space-y-3 text-sm">
              <p className="font-medium">{t('deliveryPricing.origin')}</p>
              {ownDelivery ? (
                <>
                  <p className="text-xs text-muted-foreground">{t('deliveryPricing.originOwnHelp')}</p>
                  <AddressLocalityFields
                    apiKey={apiKey}
                    county={originDraft.county}
                    city={originDraft.city}
                    onCountyChange={(county) => setOriginDraft((prev) => ({ ...prev, county, city: '' }))}
                    onLocalityChange={(loc) =>
                      setOriginDraft((prev) => ({
                        ...prev,
                        city: loc.name,
                        county: loc.county || prev.county,
                      }))
                    }
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t('deliveryPricing.originStreet')}</Label>
                      <Input
                        value={originDraft.street}
                        onChange={(e) => setOriginDraft((prev) => ({ ...prev, street: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('deliveryPricing.originNumber')}</Label>
                      <Input
                        value={originDraft.number}
                        onChange={(e) => setOriginDraft((prev) => ({ ...prev, number: e.target.value }))}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      upsertSettings.mutate({
                        origin_street: originDraft.street.trim(),
                        origin_street_number: originDraft.number.trim(),
                        origin_city: originDraft.city,
                        origin_county: originDraft.county,
                        enabled: true,
                      })
                    }
                  >
                    {t('deliveryPricing.originSave')}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    {originLabel || t('deliveryPricing.originMissing')}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('deliveryPricing.originHelp')}</p>
                </>
              )}
            </div>

            <div className="space-y-3">
              <Label>{t('deliveryPricing.pricingMode')}</Label>
              <RadioGroup
                value={pricingMode}
                onValueChange={(value) =>
                  upsertSettings.mutate({
                    pricing_mode: value as PricingMode,
                    enabled: true,
                  })
                }
              >
                <label className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value="distance" className="mt-0.5" />
                  <span>
                    <span className="font-medium">{t('deliveryPricing.modeDistance')}</span>
                    <span className="block text-xs text-muted-foreground">{t('deliveryPricing.modeDistanceHelp')}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value="order_value" className="mt-0.5" />
                  <span>
                    <span className="font-medium">{t('deliveryPricing.modeOrder')}</span>
                    <span className="block text-xs text-muted-foreground">{t('deliveryPricing.modeOrderHelp')}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value="combined" className="mt-0.5" />
                  <span>
                    <span className="font-medium">{t('deliveryPricing.modeCombined')}</span>
                    <span className="block text-xs text-muted-foreground">{t('deliveryPricing.modeCombinedHelp')}</span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label>{t('deliveryPricing.chargeMode')}</Label>
              <RadioGroup
                value={chargeMode}
                onValueChange={(value) =>
                  upsertSettings.mutate({
                    distance_charge: value as DistanceCharge,
                    enabled: true,
                  })
                }
              >
                <label className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value="flat" className="mt-0.5" />
                  <span>
                    <span className="font-medium">{t('deliveryPricing.chargeTransport')}</span>
                    <span className="block text-xs text-muted-foreground">{t('deliveryPricing.chargeTransportHelp')}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value="per_unit" className="mt-0.5" />
                  <span>
                    <span className="font-medium">{t('deliveryPricing.chargeItem')}</span>
                    <span className="block text-xs text-muted-foreground">{t('deliveryPricing.chargeItemHelp')}</span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label>{t('deliveryPricing.maxDistance')}</Label>
              <Input
                type="number"
                min={0}
                value={maxDistanceDraft}
                onChange={(e) => setMaxDistanceDraft(e.target.value)}
                onBlur={() => {
                  const raw = maxDistanceDraft.trim();
                  upsertSettings.mutate({
                    max_distance_km: raw === '' ? null : Number(raw),
                    enabled: true,
                  });
                }}
                placeholder="e.g. 25"
              />
              <p className="text-xs text-muted-foreground">{t('deliveryPricing.maxDistanceHelp')}</p>
            </div>

            <div className="space-y-3">
              <Label>{t('deliveryPricing.restrictTitle')}</Label>
              <RadioGroup
                value={coverageMode}
                onValueChange={(value) =>
                  upsertSettings.mutate({ coverage_mode: value as CoverageMode })
                }
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="romania" />
                  {t('deliveryPricing.coverageRomania')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="counties" />
                  {t('deliveryPricing.coverageCounties')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="localities" />
                  {t('deliveryPricing.coverageLocalities')}
                </label>
              </RadioGroup>
            </div>

            {coverageMode === 'counties' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto rounded-md border p-3">
                {ROMANIA_COUNTIES.map((name) => (
                  <label key={name} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={coveredCounties.includes(name)}
                      onCheckedChange={(checked) => toggleCounty(name, checked === true)}
                    />
                    {name}
                  </label>
                ))}
              </div>
            )}

            {coverageMode === 'localities' && (
              <div className="space-y-3">
                <AddressLocalityFields
                  apiKey={apiKey}
                  county={localityDraftCounty}
                  city={localityDraftCity}
                  onCountyChange={(county) => {
                    setLocalityDraftCounty(county);
                    setLocalityDraftCity('');
                  }}
                  onLocalityChange={(loc) => {
                    setLocalityDraftCity(loc.name);
                    setLocalityDraftCounty(loc.county || localityDraftCounty);
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addCoveredLocality}>
                  {t('deliveryPricing.addLocality')}
                </Button>
                <div className="flex flex-wrap gap-2">
                  {coveredLocalities.map((item) => (
                    <button
                      key={`${item.county}-${item.locality}`}
                      type="button"
                      className="text-xs rounded-full border px-3 py-1 hover:bg-muted"
                      onClick={() =>
                        upsertSettings.mutate({
                          covered_localities: coveredLocalities.filter(
                            (loc) =>
                              !(loc.county === item.county && loc.locality === item.locality)
                          ),
                        })
                      }
                    >
                      {item.locality}, {item.county} ×
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showDistanceRules && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>{t('deliveryPricing.rules')}</Label>
                <Button type="button" size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t('deliveryPricing.addRule')}
                </Button>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('deliveryPricing.colCounty')}</TableHead>
                      <TableHead>{t('deliveryPricing.colDistance')}</TableHead>
                      <TableHead>{perItem ? t('deliveryPricing.colFeeItem') : t('deliveryPricing.colFeeTransport')}</TableHead>
                      <TableHead className="w-[90px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRules.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-sm text-muted-foreground">
                          {t('deliveryPricing.noRules')}
                        </TableCell>
                      </TableRow>
                    )}
                    {sortedRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          {rule.locality
                            ? `${rule.locality}, ${rule.county}`
                            : rule.county || t('deliveryPricing.allRomania')}
                        </TableCell>
                        <TableCell>
                          {rule.min_distance_km}–{rule.max_distance_km} km
                        </TableCell>
                        <TableCell>{Number(rule.price_per_unit).toFixed(2)} RON</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteRule.mutate(rule.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">{t('deliveryPricing.rulesHelp')}</p>
            </div>
            )}

            {showOrderRules && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>{t('deliveryPricing.orderRules')}</Label>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setEditingOrderId(null);
                      setOrderForm(emptyOrderForm);
                      setOrderDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t('deliveryPricing.addOrderRule')}
                  </Button>
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('deliveryPricing.colOrderRange')}</TableHead>
                        <TableHead>{perItem ? t('deliveryPricing.colFeeItem') : t('deliveryPricing.colFeeTransport')}</TableHead>
                        <TableHead className="w-[90px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderRules.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-sm text-muted-foreground">
                            {t('deliveryPricing.noOrderRules')}
                          </TableCell>
                        </TableRow>
                      )}
                      {orderRules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell>
                            {Number(rule.min_order_value).toFixed(2)}
                            {rule.max_order_value == null
                              ? ` ${t('deliveryPricing.unlimited')}`
                              : `–${Number(rule.max_order_value).toFixed(2)}`}{' '}
                            RON
                          </TableCell>
                          <TableCell>{Number(rule.delivery_fee).toFixed(2)} RON</TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingOrderId(rule.id);
                                setOrderForm({
                                  min_order_value: String(rule.min_order_value),
                                  max_order_value: rule.max_order_value == null ? '' : String(rule.max_order_value),
                                  delivery_fee: String(rule.delivery_fee),
                                });
                                setOrderDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteOrderRule.mutate(rule.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? t('deliveryPricing.editRule') : t('deliveryPricing.addRule')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t('deliveryPricing.colCounty')}</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={form.county}
                  onChange={(e) => setForm({ ...form, county: e.target.value, locality: '' })}
                >
                  <option value="">{t('deliveryPricing.allRomania')}</option>
                  {ROMANIA_COUNTIES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              {form.county && (
                <div className="space-y-1.5">
                  <Label>{t('deliveryPricing.localityOptional')}</Label>
                  <Input
                    value={form.locality}
                    onChange={(e) => setForm({ ...form, locality: e.target.value })}
                    placeholder={t('deliveryPricing.localityPlaceholder')}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('deliveryPricing.minKm')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.min_distance_km}
                    onChange={(e) => setForm({ ...form, min_distance_km: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('deliveryPricing.maxKm')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.max_distance_km}
                    onChange={(e) => setForm({ ...form, max_distance_km: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{perItem ? t('deliveryPricing.feeItem') : t('deliveryPricing.feeTransport')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price_per_unit}
                  onChange={(e) => setForm({ ...form, price_per_unit: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {perItem ? t('deliveryPricing.feeItemHelp') : t('deliveryPricing.feeTransportHelp')}
                </p>
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() => saveRule.mutate()}
                disabled={saveRule.isPending}
              >
                {t('deliveryPricing.saveRule')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingOrderId ? t('deliveryPricing.editOrderRule') : t('deliveryPricing.addOrderRule')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('deliveryPricing.minOrder')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={orderForm.min_order_value}
                    onChange={(e) => setOrderForm({ ...orderForm, min_order_value: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('deliveryPricing.maxOrder')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={orderForm.max_order_value}
                    onChange={(e) => setOrderForm({ ...orderForm, max_order_value: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">{t('deliveryPricing.maxOrderHelp')}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{perItem ? t('deliveryPricing.feeItem') : t('deliveryPricing.feeTransport')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={orderForm.delivery_fee}
                  onChange={(e) => setOrderForm({ ...orderForm, delivery_fee: e.target.value })}
                />
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() => saveOrderRule.mutate()}
                disabled={saveOrderRule.isPending}
              >
                {t('deliveryPricing.saveRule')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

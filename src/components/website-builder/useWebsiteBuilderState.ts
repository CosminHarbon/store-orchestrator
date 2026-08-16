import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { TemplateBlock } from '@/components/templates/BlockEditor';
import {
  BuilderSection,
  BuilderSnapshot,
  DEFAULT_CUSTOMIZATION,
  SaveStatus,
  WebsiteCustomization,
  getDefaultBlockContent,
  parseBuilderConfig,
  syncCustomizationFlags,
  toBuilderConfig,
} from './types';

const HISTORY_LIMIT = 40;

function cloneSnapshot(snapshot: BuilderSnapshot): BuilderSnapshot {
  return {
    customization: { ...snapshot.customization },
    blocks: snapshot.blocks.map((b) => ({ ...b, content: { ...b.content } })),
    sections: snapshot.sections.map((s) => ({ ...s })),
  };
}

export function useWebsiteBuilderState() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [customization, setCustomization] = useState<WebsiteCustomization | null>(null);
  const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
  const [sections, setSections] = useState<BuilderSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>('hero');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [dirty, setDirty] = useState(false);

  const historyRef = useRef<BuilderSnapshot[]>([]);
  const futureRef = useRef<BuilderSnapshot[]>([]);
  const skipHistoryRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);

  const customizationQuery = useQuery({
    queryKey: ['template-customization', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_customization')
        .select('*')
        .eq('user_id', user!.id)
        .eq('template_id', 'elementar')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const blocksQuery = useQuery({
    queryKey: ['template-blocks', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_blocks')
        .select('*')
        .eq('user_id', user!.id)
        .eq('template_id', 'elementar')
        .order('block_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TemplateBlock[];
    },
  });

  const previewProductsQuery = useQuery({
    queryKey: ['builder-preview-products', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, price, image, stock')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) throw error;
      return data || [];
    },
  });

  const previewCollectionsQuery = useQuery({
    queryKey: ['builder-preview-collections', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collections')
        .select('id, name, image_url')
        .eq('user_id', user!.id)
        .order('name', { ascending: true })
        .limit(8);
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!user || customizationQuery.isLoading || blocksQuery.isLoading) return;
    if (hydratedRef.current) return;

    const loadedBlocks = blocksQuery.data || [];
    const base = DEFAULT_CUSTOMIZATION(user.id);
    const row = customizationQuery.data;
    const nextCustomization: WebsiteCustomization = row
      ? {
          ...base,
          ...(row as unknown as WebsiteCustomization),
          user_id: user.id,
          template_id: 'elementar',
        }
      : base;

    const nextSections = parseBuilderConfig(
      nextCustomization.builder_config,
      loadedBlocks,
      nextCustomization
    );

    setCustomization(syncCustomizationFlags(nextCustomization, nextSections));
    setBlocks(loadedBlocks);
    setSections(nextSections);
    hydratedRef.current = true;
    historyRef.current = [];
    futureRef.current = [];
  }, [user, customizationQuery.data, customizationQuery.isLoading, blocksQuery.data, blocksQuery.isLoading]);

  const [historyVersion, setHistoryVersion] = useState(0);

  const pushHistory = useCallback((snapshot: BuilderSnapshot) => {
    if (skipHistoryRef.current) return;
    historyRef.current = [...historyRef.current.slice(-(HISTORY_LIMIT - 1)), cloneSnapshot(snapshot)];
    futureRef.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const applySnapshot = useCallback((snapshot: BuilderSnapshot) => {
    skipHistoryRef.current = true;
    setCustomization(snapshot.customization);
    setBlocks(snapshot.blocks);
    setSections(snapshot.sections);
    setDirty(true);
    setHistoryVersion((v) => v + 1);
    queueMicrotask(() => {
      skipHistoryRef.current = false;
    });
  }, []);

  const commitChange = useCallback(
    (updater: (current: BuilderSnapshot) => BuilderSnapshot) => {
      if (!customization) return;
      const current: BuilderSnapshot = { customization, blocks, sections };
      pushHistory(current);
      const next = updater(current);
      const synced = {
        ...next,
        customization: syncCustomizationFlags(next.customization, next.sections),
      };
      setCustomization(synced.customization);
      setBlocks(synced.blocks);
      setSections(synced.sections);
      setDirty(true);
    },
    [blocks, customization, pushHistory, sections]
  );

  const undo = useCallback(() => {
    if (!customization || historyRef.current.length === 0) return;
    const previous = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    futureRef.current = [
      ...futureRef.current,
      cloneSnapshot({ customization, blocks, sections }),
    ];
    applySnapshot(previous);
  }, [applySnapshot, blocks, customization, sections]);

  const redo = useCallback(() => {
    if (!customization || futureRef.current.length === 0) return;
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    historyRef.current = [
      ...historyRef.current,
      cloneSnapshot({ customization, blocks, sections }),
    ];
    applySnapshot(next);
  }, [applySnapshot, blocks, customization, sections]);

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      customization: WebsiteCustomization;
      blocks: TemplateBlock[];
      sections: BuilderSection[];
    }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const synced = syncCustomizationFlags(payload.customization, payload.sections);
      const { id: _omitId, builder_config: _omitConfig, ...rest } = synced as WebsiteCustomization & {
        id?: string;
      };

      const upsertPayload = {
        ...rest,
        user_id: userId,
        template_id: 'elementar',
        builder_config: toBuilderConfig(payload.sections),
        updated_at: new Date().toISOString(),
      };

      const { error: customizationError } = await supabase
        .from('template_customization')
        .upsert(upsertPayload as never);
      if (customizationError) throw customizationError;

      const { error: deleteError } = await supabase
        .from('template_blocks')
        .delete()
        .eq('user_id', userId)
        .eq('template_id', 'elementar');
      if (deleteError) throw deleteError;

      const orderedBlockIds = payload.sections
        .filter((s) => s.type === 'block' && s.blockId)
        .map((s) => s.blockId!) ;

      const blockById = new Map(payload.blocks.map((b) => [b.id, b]));
      const rows = orderedBlockIds
        .map((id, index) => {
          const block = blockById.get(id);
          if (!block) return null;
          const section = payload.sections.find((s) => s.blockId === id);
          return {
            user_id: userId,
            template_id: 'elementar',
            block_type: block.block_type,
            block_order: index,
            title: block.title,
            content: JSON.parse(JSON.stringify(block.content)),
            is_visible: section ? section.visible : block.is_visible,
          };
        })
        .filter(Boolean);

      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('template_blocks').insert(rows as never);
        if (insertError) throw insertError;
      }

      return synced;
    },
    onMutate: () => setSaveStatus('saving'),
    onSuccess: (synced) => {
      setCustomization(synced);
      setDirty(false);
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['template-customization'] });
      queryClient.invalidateQueries({ queryKey: ['template-blocks'] });
    },
    onError: (error) => {
      console.error(error);
      setSaveStatus('error');
    },
  });

  const saveNow = useCallback(async () => {
    if (!customization) return;
    await saveMutation.mutateAsync({ customization, blocks, sections });
  }, [blocks, customization, saveMutation, sections]);

  useEffect(() => {
    if (!dirty || !customization) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void saveNow();
    }, 1200);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [dirty, customization, blocks, sections, saveNow]);

  const updateCustomization = useCallback(
    (updates: Partial<WebsiteCustomization>) => {
      commitChange((current) => ({
        ...current,
        customization: { ...current.customization, ...updates },
      }));
    },
    [commitChange]
  );

  const updateSections = useCallback(
    (nextSections: BuilderSection[]) => {
      commitChange((current) => ({
        ...current,
        sections: nextSections,
      }));
    },
    [commitChange]
  );

  const updateBlock = useCallback(
    (blockId: string, updates: Partial<TemplateBlock>) => {
      commitChange((current) => ({
        ...current,
        blocks: current.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                ...updates,
                content: updates.content ? { ...updates.content } : block.content,
              }
            : block
        ),
      }));
    },
    [commitChange]
  );

  const addSection = useCallback(
    (blockType: string, title: string) => {
      if (!user) return;
      const id = crypto.randomUUID();
      const newBlock: TemplateBlock = {
        id,
        user_id: user.id,
        template_id: 'elementar',
        block_type: blockType === 'newsletter' ? 'banner' : blockType,
        block_order: blocks.length,
        title,
        content: getDefaultBlockContent(blockType),
        is_visible: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      commitChange((current) => {
        const footerIndex = current.sections.findIndex((s) => s.type === 'footer');
        const insertAt = footerIndex === -1 ? current.sections.length : footerIndex;
        const nextSections = [...current.sections];
        nextSections.splice(insertAt, 0, {
          id: `block-${id}`,
          type: 'block',
          visible: true,
          blockId: id,
          blockType: newBlock.block_type,
        });
        return {
          customization: current.customization,
          blocks: [...current.blocks, newBlock],
          sections: nextSections,
        };
      });
      setSelectedSectionId(`block-${id}`);
    },
    [blocks.length, commitChange, user]
  );

  const duplicateSection = useCallback(
    (sectionId: string) => {
      const section = sections.find((s) => s.id === sectionId);
      if (!section || section.type !== 'block' || !section.blockId || !user) return;
      const source = blocks.find((b) => b.id === section.blockId);
      if (!source) return;
      const id = crypto.randomUUID();
      const clone: TemplateBlock = {
        ...source,
        id,
        title: `${source.title || 'Section'} copy`,
        content: { ...source.content },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      commitChange((current) => {
        const index = current.sections.findIndex((s) => s.id === sectionId);
        const nextSections = [...current.sections];
        nextSections.splice(index + 1, 0, {
          id: `block-${id}`,
          type: 'block',
          visible: true,
          blockId: id,
          blockType: clone.block_type,
        });
        return {
          customization: current.customization,
          blocks: [...current.blocks, clone],
          sections: nextSections,
        };
      });
      setSelectedSectionId(`block-${id}`);
    },
    [blocks, commitChange, sections, user]
  );

  const deleteSection = useCallback(
    (sectionId: string) => {
      const section = sections.find((s) => s.id === sectionId);
      if (!section) return;
      if (section.type !== 'block') {
        // System sections can only be hidden
        updateSections(
          sections.map((s) => (s.id === sectionId ? { ...s, visible: false } : s))
        );
        return;
      }
      commitChange((current) => ({
        customization: current.customization,
        blocks: current.blocks.filter((b) => b.id !== section.blockId),
        sections: current.sections.filter((s) => s.id !== sectionId),
      }));
      setSelectedSectionId('hero');
    },
    [commitChange, sections, updateSections]
  );

  const moveSection = useCallback(
    (sectionId: string, direction: -1 | 1) => {
      const index = sections.findIndex((s) => s.id === sectionId);
      if (index < 0) return;
      const section = sections[index];
      // System sections stay in a fixed relative order; only content blocks move.
      if (section.type !== 'block') return;
      const target = index + direction;
      if (target <= 0 || target >= sections.length - 1) return;
      if (sections[target]?.type === 'header' || sections[target]?.type === 'footer') return;
      const next = [...sections];
      next.splice(index, 1);
      next.splice(target, 0, section);
      updateSections(next);
    },
    [sections, updateSections]
  );

  const toggleSectionVisibility = useCallback(
    (sectionId: string) => {
      updateSections(
        sections.map((s) => (s.id === sectionId ? { ...s, visible: !s.visible } : s))
      );
    },
    [sections, updateSections]
  );

  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId) || null,
    [sections, selectedSectionId]
  );

  const selectedBlock = useMemo(() => {
    if (!selectedSection?.blockId) return null;
    return blocks.find((b) => b.id === selectedSection.blockId) || null;
  }, [blocks, selectedSection]);

  return {
    isLoading: !hydratedRef.current || customizationQuery.isLoading || blocksQuery.isLoading,
    customization,
    blocks,
    sections,
    selectedSectionId,
    setSelectedSectionId,
    selectedSection,
    selectedBlock,
    saveStatus,
    dirty,
    undo,
    redo,
    canUndo: historyRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    historyVersion,
    updateCustomization,
    updateSections,
    updateBlock,
    addSection,
    duplicateSection,
    deleteSection,
    moveSection,
    toggleSectionVisibility,
    saveNow,
    previewProducts: previewProductsQuery.data || [],
    previewCollections: previewCollectionsQuery.data || [],
  };
}

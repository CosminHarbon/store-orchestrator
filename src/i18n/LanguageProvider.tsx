import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isAppLanguage,
  type AppLanguage,
} from '@/i18n/types';

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  isReady: boolean;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function readStoredLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isAppLanguage(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const [language, setLanguageState] = useState<AppLanguage>(() => readStoredLanguage());
  const [isReady, setIsReady] = useState(false);

  const applyLanguage = useCallback(
    async (lang: AppLanguage) => {
      setLanguageState(lang);
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      } catch {
        /* ignore */
      }
      if (i18n.language !== lang) {
        await i18n.changeLanguage(lang);
      }
      document.documentElement.lang = lang;
    },
    [i18n]
  );

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      if (!user) {
        await applyLanguage(readStoredLanguage());
        if (!cancelled) setIsReady(true);
        return;
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('preferred_language')
          .eq('user_id', user.id)
          .maybeSingle();

        if (cancelled) return;

        if (isAppLanguage(profile?.preferred_language)) {
          await applyLanguage(profile.preferred_language);
        } else {
          const localLang = readStoredLanguage();
          await applyLanguage(localLang);
          await supabase
            .from('profiles')
            .update({ preferred_language: localLang })
            .eq('user_id', user.id);
        }
      } catch {
        await applyLanguage(readStoredLanguage());
      } finally {
        if (!cancelled) setIsReady(true);
      }
    };

    void sync();
    return () => {
      cancelled = true;
    };
  }, [user?.id, applyLanguage]);

  const setLanguage = useCallback(
    async (lang: AppLanguage) => {
      await applyLanguage(lang);

      if (user) {
        const { error } = await supabase
          .from('profiles')
          .update({ preferred_language: lang })
          .eq('user_id', user.id);
        if (error) throw error;
      }
    },
    [applyLanguage, user]
  );

  const value = useMemo(
    () => ({ language, setLanguage, isReady }),
    [language, setLanguage, isReady]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}

/** Apply merchant storefront locale from store config (no profile write). */
export async function applyStorefrontLanguage(lang: unknown) {
  const { default: i18n } = await import('@/i18n');
  const resolved = isAppLanguage(lang) ? lang : DEFAULT_LANGUAGE;
  if (i18n.language !== resolved) {
    await i18n.changeLanguage(resolved);
  }
  document.documentElement.lang = resolved;
  return resolved;
}

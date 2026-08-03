import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';
import {
  DEFAULT_LANGUAGE,
  I18N_NAMESPACES,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
} from './types';

// Eager bundles for first-paint routes (Landing / Auth). Without these,
// t(..., { returnObjects: true }) returns the key string before the async
// namespace loads — e.g. featureCards.map crashes on Landing.
import enCommon from './en/common.json';
import roCommon from './ro/common.json';
import enAuth from './en/auth.json';
import roAuth from './ro/auth.json';

const EAGER_NAMESPACES = new Set(['common', 'auth']);

void i18n
  .use(
    resourcesToBackend((language: string, namespace: string) => {
      // Already inlined above — avoid a redundant async fetch that races first paint
      if (EAGER_NAMESPACES.has(namespace)) {
        return Promise.resolve(
          language === 'en'
            ? namespace === 'auth'
              ? enAuth
              : enCommon
            : namespace === 'auth'
              ? roAuth
              : roCommon
        );
      }
      return import(`./${language}/${namespace}.json`);
    })
  )
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, auth: enAuth },
      ro: { common: roCommon, auth: roAuth },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    defaultNS: 'common',
    ns: [...I18N_NAMESPACES],
    partialBundledLanguages: true,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    react: {
      useSuspense: false,
      bindI18n: 'languageChanged loaded',
      bindI18nStore: 'added removed',
    },
  });

export default i18n;

import {
  ar,
  de,
  en_AU,
  en_CA,
  en_GB,
  en_IN,
  en_US,
  es,
  es_MX,
  fr,
  ja,
  nl,
  pl,
  pt_BR,
  zh_CN,
  type LocaleDefinition,
} from '@faker-js/faker';

/**
 * The faker locales used to name employees, so people in Germany get German
 * names and people in India Indian ones. The names are synthetic.
 *
 * Japan, the UAE and Singapore get names in their own script (Japanese,
 * Arabic and Chinese), which is what faker has for them. Switching a country
 * to a Latin-script locale is a one-line change in reference-data.ts.
 */
export type LocaleId =
  | 'en_US'
  | 'en_GB'
  | 'en_CA'
  | 'en_AU'
  | 'en_IN'
  | 'de'
  | 'fr'
  | 'nl'
  | 'es'
  | 'es_MX'
  | 'pt_BR'
  | 'pl'
  | 'ja'
  | 'ar'
  | 'zh_CN';

export const LOCALES: Record<LocaleId, LocaleDefinition> = {
  en_US,
  en_GB,
  en_CA,
  en_AU,
  en_IN,
  de,
  fr,
  nl,
  es,
  es_MX,
  pt_BR,
  pl,
  ja,
  ar,
  zh_CN,
};

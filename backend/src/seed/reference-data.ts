import type { LocaleId } from './locales.js';

/**
 * The reference data and the shape of the synthetic workforce.
 *
 * Weights are shares of the 10,000 employees and add up to 1. They are chosen
 * to look like a real multinational so the insights have something to show:
 * a few big offices and many small ones, engineering as the largest department,
 * and a pyramid of levels. Small groups are intentional too: the smallest
 * country/level combinations fall under the privacy threshold of 5 people, so
 * the "hide small groups" rule is visible in the demo.
 */

export interface CountrySeed {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  /** ISO 4217. */
  currencyCode: string;
  /** Share of employees based here. */
  weight: number;
  /** The faker locale that names the people based here. */
  locale: LocaleId;
}

export const COUNTRIES: readonly CountrySeed[] = [
  {
    code: 'US',
    name: 'United States',
    currencyCode: 'USD',
    weight: 0.24,
    locale: 'en_US',
  },
  {
    code: 'IN',
    name: 'India',
    currencyCode: 'INR',
    weight: 0.22,
    locale: 'en_IN',
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    currencyCode: 'GBP',
    weight: 0.09,
    locale: 'en_GB',
  },
  {
    code: 'DE',
    name: 'Germany',
    currencyCode: 'EUR',
    weight: 0.08,
    locale: 'de',
  },
  {
    code: 'CA',
    name: 'Canada',
    currencyCode: 'CAD',
    weight: 0.05,
    locale: 'en_CA',
  },
  {
    code: 'AU',
    name: 'Australia',
    currencyCode: 'AUD',
    weight: 0.04,
    locale: 'en_AU',
  },
  // Faker has no Singapore locale; Chinese names fit its majority.
  {
    code: 'SG',
    name: 'Singapore',
    currencyCode: 'SGD',
    weight: 0.04,
    locale: 'zh_CN',
  },
  {
    code: 'FR',
    name: 'France',
    currencyCode: 'EUR',
    weight: 0.04,
    locale: 'fr',
  },
  {
    code: 'BR',
    name: 'Brazil',
    currencyCode: 'BRL',
    weight: 0.04,
    locale: 'pt_BR',
  },
  {
    code: 'NL',
    name: 'Netherlands',
    currencyCode: 'EUR',
    weight: 0.03,
    locale: 'nl',
  },
  {
    code: 'ES',
    name: 'Spain',
    currencyCode: 'EUR',
    weight: 0.03,
    locale: 'es',
  },
  {
    code: 'MX',
    name: 'Mexico',
    currencyCode: 'MXN',
    weight: 0.03,
    locale: 'es_MX',
  },
  {
    code: 'PL',
    name: 'Poland',
    currencyCode: 'PLN',
    weight: 0.03,
    locale: 'pl',
  },
  {
    code: 'JP',
    name: 'Japan',
    currencyCode: 'JPY',
    weight: 0.03,
    locale: 'ja',
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    currencyCode: 'AED',
    weight: 0.01,
    locale: 'ar',
  },
];

export interface DepartmentSeed {
  name: string;
  /** Share of employees in this department. */
  weight: number;
  /**
   * Share of the department's people (before the top-of-the-pyramid effect) who
   * are women. It differs by department on purpose, as it does in real companies.
   */
  femaleShare: number;
  /** The job title at each level: index 0 is level 1, the most junior. */
  titles: readonly string[];
}

export const DEPARTMENTS: readonly DepartmentSeed[] = [
  {
    name: 'Engineering',
    weight: 0.34,
    femaleShare: 0.3,
    titles: [
      'Associate Software Engineer',
      'Software Engineer',
      'Senior Software Engineer',
      'Staff Engineer',
      'Principal Engineer',
      'Director of Engineering',
      'VP of Engineering',
    ],
  },
  {
    name: 'Sales',
    weight: 0.16,
    femaleShare: 0.4,
    titles: [
      'Sales Development Representative',
      'Account Executive',
      'Senior Account Executive',
      'Sales Manager',
      'Senior Sales Manager',
      'Director of Sales',
      'VP of Sales',
    ],
  },
  {
    name: 'Customer Support',
    weight: 0.12,
    femaleShare: 0.52,
    titles: [
      'Support Associate',
      'Support Specialist',
      'Senior Support Specialist',
      'Support Team Lead',
      'Support Manager',
      'Director of Support',
      'VP of Customer Experience',
    ],
  },
  {
    name: 'Operations',
    weight: 0.1,
    femaleShare: 0.44,
    titles: [
      'Operations Associate',
      'Operations Analyst',
      'Senior Operations Analyst',
      'Operations Manager',
      'Senior Operations Manager',
      'Director of Operations',
      'VP of Operations',
    ],
  },
  {
    name: 'Marketing',
    weight: 0.07,
    femaleShare: 0.58,
    titles: [
      'Marketing Associate',
      'Marketing Specialist',
      'Senior Marketing Specialist',
      'Marketing Manager',
      'Senior Marketing Manager',
      'Director of Marketing',
      'VP of Marketing',
    ],
  },
  {
    name: 'Product',
    weight: 0.06,
    femaleShare: 0.46,
    titles: [
      'Associate Product Manager',
      'Product Manager',
      'Senior Product Manager',
      'Group Product Manager',
      'Principal Product Manager',
      'Director of Product',
      'VP of Product',
    ],
  },
  {
    name: 'Finance',
    weight: 0.05,
    femaleShare: 0.5,
    titles: [
      'Junior Accountant',
      'Accountant',
      'Senior Accountant',
      'Finance Manager',
      'Senior Finance Manager',
      'Director of Finance',
      'VP of Finance',
    ],
  },
  {
    name: 'People Operations',
    weight: 0.04,
    femaleShare: 0.7,
    titles: [
      'HR Coordinator',
      'HR Generalist',
      'Senior HR Partner',
      'HR Manager',
      'Senior HR Manager',
      'Director of People',
      'VP of People',
    ],
  },
  {
    name: 'Design',
    weight: 0.04,
    femaleShare: 0.55,
    titles: [
      'Junior Designer',
      'Product Designer',
      'Senior Product Designer',
      'Staff Designer',
      'Principal Designer',
      'Director of Design',
      'VP of Design',
    ],
  },
  {
    name: 'Legal',
    weight: 0.02,
    femaleShare: 0.5,
    titles: [
      'Legal Assistant',
      'Paralegal',
      'Counsel',
      'Senior Counsel',
      'Principal Counsel',
      'Associate General Counsel',
      'VP of Legal',
    ],
  },
];

/**
 * Share of employees at each level; index 0 is level 1. A pyramid: most people
 * are junior or mid level and very few are at the top.
 */
const LEVEL_SHARES: readonly number[] = [24, 30, 24, 12, 6, 3, 1];

export const MAX_LEVEL = LEVEL_SHARES.length;

export const LEVELS: readonly { level: number; weight: number }[] =
  LEVEL_SHARES.map((weight, index) => ({ level: index + 1, weight }));

import type { LocaleId } from './locales.js';

/**
 * Joins a given name and a family name the way that country writes them.
 * Japanese and Chinese put the family name first, and Chinese names have no
 * space. Faker only hands over the two parts, so the order is decided here.
 */
export function formatFullName(
  firstName: string,
  lastName: string,
  locale: LocaleId,
): string {
  switch (locale) {
    case 'ja':
      return `${lastName} ${firstName}`;
    case 'zh_CN':
      return `${lastName}${firstName}`;
    default:
      return `${firstName} ${lastName}`;
  }
}

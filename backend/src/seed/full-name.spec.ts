import { formatFullName } from './full-name.js';

describe('formatFullName', () => {
  it.each([
    'en_US',
    'en_GB',
    'de',
    'fr',
    'nl',
    'es',
    'pt_BR',
    'pl',
    'ar',
  ] as const)('writes the given name first for %s', (locale) => {
    expect(formatFullName('Anna', 'Meyer', locale)).toBe('Anna Meyer');
  });

  it('writes the family name first for Japanese, with a space', () => {
    expect(formatFullName('美桜', '相馬', 'ja')).toBe('相馬 美桜');
  });

  it('writes the family name first for Chinese, with no space', () => {
    expect(formatFullName('英', '蔡', 'zh_CN')).toBe('蔡英');
  });
});

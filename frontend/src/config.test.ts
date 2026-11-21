import { describe, expect, it } from 'vitest';
import { readApiUrl } from './config.ts';

describe('the API address', () => {
  it('is taken from VITE_API_URL as given', () => {
    expect(readApiUrl('/api')).toBe('/api');
    expect(readApiUrl(' https://api.example.com ')).toBe(
      'https://api.example.com',
    );
  });

  it('is never guessed: a missing or blank VITE_API_URL stops the app with a message that says how to fix it', () => {
    // A silent default would send every request to the wrong place and look like the API
    // being down, or like a user being signed out.
    for (const missing of [undefined, '', '   ']) {
      expect(() => readApiUrl(missing)).toThrow(/VITE_API_URL is not set/);
      expect(() => readApiUrl(missing)).toThrow(/\.env\.example/);
    }
  });
});

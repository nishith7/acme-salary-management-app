/**
 * The API's address, from VITE_API_URL (see .env.example). There is deliberately no default:
 * a guess that is wrong sends every request to the wrong place, which looks like the API
 * being down or like the user being signed out, and nothing points at the real cause.
 */
export function readApiUrl(value: string | undefined): string {
  const url = value?.trim();
  if (!url) {
    throw new Error(
      'VITE_API_URL is not set. Copy frontend/.env.example to frontend/.env (see frontend/README.md).',
    );
  }
  return url;
}

export const apiUrl = readApiUrl(import.meta.env.VITE_API_URL);

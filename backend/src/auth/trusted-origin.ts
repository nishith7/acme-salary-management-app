/**
 * Whether a request to a cookie endpoint comes from a site that may use the cookie.
 *
 * With the refresh cookie allowed on cross-site requests (REFRESH_COOKIE_SAMESITE=none), a
 * page on any website can make the browser send it. The browser always says which website the
 * request came from, in the Origin header, and a page cannot change it. So a request is
 * trusted when:
 *  - it has no Origin: a browser page always sends one on a POST, so this is a command-line
 *    or server client, not a page that is being used against its visitor;
 *  - the Origin is one of the sites allowed to call the API (CORS_ORIGINS);
 *  - or the Origin is the API's own host (its own documentation page).
 * Anything else, including the literal "null" origin some pages send, is refused.
 */
export function isTrustedOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
  host: string | undefined,
): boolean {
  if (origin === undefined) {
    return true;
  }
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      host !== undefined &&
      url.host === host
    );
  } catch {
    return false;
  }
}

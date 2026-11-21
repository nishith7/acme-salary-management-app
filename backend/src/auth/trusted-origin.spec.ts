import { isTrustedOrigin } from './trusted-origin.js';

// With the refresh cookie allowed on cross-site requests, a page on any website can make the
// browser send it. The browser always says which website the request came from (Origin), so
// the two cookie endpoints refuse a request from a site that is not one of ours.
describe('isTrustedOrigin', () => {
  const allowed = ['https://app.example.com', 'http://localhost:5173'];
  const host = 'api.example.com';

  it('accepts a request with no Origin: it did not come from a browser page', () => {
    expect(isTrustedOrigin(undefined, allowed, host)).toBe(true);
  });

  it('accepts the sites that are allowed to call the API', () => {
    expect(isTrustedOrigin('https://app.example.com', allowed, host)).toBe(
      true,
    );
    expect(isTrustedOrigin('http://localhost:5173', allowed, host)).toBe(true);
  });

  it('accepts a page served by the API itself (its own documentation)', () => {
    expect(isTrustedOrigin('https://api.example.com', [], host)).toBe(true);
  });

  it('refuses any other site, including one that only looks similar', () => {
    expect(isTrustedOrigin('https://evil.example', allowed, host)).toBe(false);
    expect(
      isTrustedOrigin('https://app.example.com.evil.example', allowed, host),
    ).toBe(false);
    expect(isTrustedOrigin('http://app.example.com', allowed, host)).toBe(
      false,
    );
    expect(isTrustedOrigin('https://app.example.com:8443', allowed, host)).toBe(
      false,
    );
  });

  it('refuses an Origin that is not a web address, and the "null" origin some pages send', () => {
    expect(isTrustedOrigin('null', allowed, host)).toBe(false);
    expect(isTrustedOrigin('not a url', allowed, host)).toBe(false);
    expect(isTrustedOrigin('', allowed, host)).toBe(false);
  });
});

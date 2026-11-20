/** What RequireAuth leaves in the router's location state when it sends someone to log in. */
export interface LoginRedirectState {
  /** Where they were going, so signing in can take them there. */
  from?: string;
}

/**
 * The place to return to after signing in, or undefined. Only a path inside this app counts
 * ("/employees", never "//other.site"), so a forged history entry cannot send a user away.
 */
export function readReturnPath(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return undefined;
  }
  const { from } = state;
  if (
    typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//')
  ) {
    return from;
  }
  return undefined;
}

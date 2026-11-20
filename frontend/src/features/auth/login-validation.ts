export interface LoginFormValues {
  email: string;
  password: string;
}

export interface LoginFormErrors {
  email?: string;
  password?: string;
}

// The same limits as the API's login schema (backend/src/auth/auth.schemas.ts). Login is
// rate limited per address and every attempt counts, so a form the server would refuse
// anyway must not be sent.
const PASSWORD_MAX_LENGTH = 128;
const LOOKS_LIKE_EMAIL = /^\S+@\S+\.\S+$/;

export function validateLogin({
  email,
  password,
}: LoginFormValues): LoginFormErrors {
  const errors: LoginFormErrors = {};
  const trimmed = email.trim();

  if (trimmed === '') {
    errors.email = 'Enter your work email.';
  } else if (!LOOKS_LIKE_EMAIL.test(trimmed)) {
    errors.email = 'Enter a valid work email.';
  }

  if (password === '') {
    errors.password = 'Enter your password.';
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Passwords are at most ${PASSWORD_MAX_LENGTH} characters.`;
  }

  return errors;
}

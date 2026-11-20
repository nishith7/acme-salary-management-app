import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { LoginCredentials } from '../../../api/auth.ts';
import { ApiError } from '../../../api/index.ts';
import {
  validateLogin,
  type LoginFormErrors,
  type LoginFormValues,
} from '../login-validation.ts';

interface LoginFormProps {
  /** Rejects with an ApiError when the sign-in is refused; its message is shown. */
  onSubmit: (credentials: LoginCredentials) => Promise<void>;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [values, setValues] = useState<LoginFormValues>({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  const change =
    (field: keyof LoginFormValues) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setErrors((current) => ({ ...current, [field]: undefined }));
      setServerError(null);
    };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found = validateLogin(values);
    setErrors(found);
    if (found.email) {
      emailInput.current?.focus();
      return;
    }
    if (found.password) {
      passwordInput.current?.focus();
      return;
    }

    setSubmitting(true);
    setServerError(null);
    try {
      await onSubmit({ email: values.email.trim(), password: values.password });
      // Signed in: the router replaces this page, so there is nothing left to update.
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.message
          : 'Something went wrong. Try again.',
      );
      setSubmitting(false);
    }
  }

  return (
    <Box
      component="form"
      noValidate
      onSubmit={handleSubmit}
      sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}
    >
      <TextField
        label="Work email"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="name@acme.com"
        autoFocus
        value={values.email}
        onChange={change('email')}
        error={Boolean(errors.email)}
        helperText={errors.email}
        inputRef={emailInput}
      />
      <TextField
        label="Password"
        name="password"
        type={showPassword ? 'text' : 'password'}
        autoComplete="current-password"
        value={values.password}
        onChange={change('password')}
        error={Boolean(errors.password)}
        helperText={errors.password}
        inputRef={passwordInput}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <Button
                  size="small"
                  color="secondary"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((shown) => !shown)}
                  sx={{ minWidth: 0 }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </Button>
              </InputAdornment>
            ),
          },
        }}
      />
      {serverError && <Alert severity="error">{serverError}</Alert>}
      <Button
        type="submit"
        variant="contained"
        size="large"
        fullWidth
        loading={submitting}
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </Box>
  );
}

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import { useState } from 'react';
import { useAuth } from '../auth-context.ts';

/** Signs out, and says so on screen if that failed, instead of pretending it worked. */
export function SignOutButton() {
  const { logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    setPending(true);
    setFailed(false);
    try {
      await logout();
    } catch {
      setFailed(true);
      setPending(false);
    }
    // On success the page is replaced by the login page, so there is nothing to reset.
  }

  return (
    <>
      <Button
        variant="outlined"
        color="secondary"
        onClick={handleClick}
        loading={pending}
      >
        Sign out
      </Button>
      <Snackbar
        open={failed}
        autoHideDuration={8000}
        onClose={() => setFailed(false)}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => setFailed(false)}
        >
          Could not sign out. Check your connection and try again.
        </Alert>
      </Snackbar>
    </>
  );
}

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { BrandLogo } from '../../../components/BrandLogo.tsx';
import { useAuth } from '../auth-context.ts';
import { LoginForm } from '../components/LoginForm.tsx';
import { LoginHero } from '../components/LoginHero.tsx';

export function LoginPage() {
  const auth = useAuth();
  const sessionExpired =
    auth.status === 'unauthenticated' && auth.sessionExpired;

  return (
    <>
      <title>ACME · Sign in</title>
      <Box
        sx={{
          minHeight: '100vh',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        }}
      >
        <LoginHero />
        <Box
          component="main"
          sx={{
            display: 'grid',
            placeItems: 'center',
            p: { xs: 3, sm: 5 },
            bgcolor: 'background.paper',
          }}
        >
          <Stack spacing={3} sx={{ width: '100%', maxWidth: 380 }}>
            {/* The hero, which carries the logo on wide screens, is hidden below md. */}
            <Box sx={{ display: { md: 'none' } }}>
              <BrandLogo />
            </Box>
            <Box>
              <Typography variant="h1" sx={{ fontSize: '1.5rem' }}>
                Sign in
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                Use your ACME work account.
              </Typography>
            </Box>
            {sessionExpired && (
              <Alert severity="info" role="status">
                Your session expired. Sign in again to continue.
              </Alert>
            )}
            <LoginForm onSubmit={auth.login} />
            <Typography variant="body2" color="text.secondary" align="center">
              Trouble signing in? Contact your administrator.
            </Typography>
          </Stack>
        </Box>
      </Box>
    </>
  );
}

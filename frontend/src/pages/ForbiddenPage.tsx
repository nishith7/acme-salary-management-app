import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { BrandLogo } from '../components/BrandLogo.tsx';
import { useAuth } from '../features/auth/auth-context.ts';
import { SignOutButton } from '../features/auth/components/SignOutButton.tsx';

/** For a signed-in user whose role may not use the screen they asked for. */
export function ForbiddenPage() {
  const auth = useAuth();

  return (
    <>
      <title>ACME · No access</title>
      <Box
        component="main"
        sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}
      >
        <Stack spacing={3} sx={{ alignItems: 'flex-start', maxWidth: 420 }}>
          <BrandLogo />
          <Typography variant="h1">You don't have access</Typography>
          <Typography color="text.secondary">
            This application is for ACME's HR administrators.
            {auth.status === 'authenticated' &&
              ` You are signed in as ${auth.user.email}.`}
          </Typography>
          <SignOutButton />
        </Stack>
      </Box>
    </>
  );
}

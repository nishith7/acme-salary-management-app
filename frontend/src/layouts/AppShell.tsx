import Box from '@mui/material/Box';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { Outlet } from 'react-router';
import { BrandLogo } from '../components/BrandLogo.tsx';
import { useAuth } from '../features/auth/auth-context.ts';
import { SignOutButton } from '../features/auth/components/SignOutButton.tsx';

/**
 * The frame around every signed-in screen: a top bar with the logo, who is signed in and a
 * sign-out button, and the screen itself below. It is only rendered inside RequireAuth.
 */
export function AppShell() {
  const auth = useAuth();
  if (auth.status !== 'authenticated') {
    return null;
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 2 }}>
          <BrandLogo />
          <Box sx={{ flexGrow: 1 }} />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ display: { xs: 'none', sm: 'block' } }}
          >
            {auth.user.name}
          </Typography>
          <SignOutButton />
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ p: { xs: 2, md: 3 } }}>
        <Outlet />
      </Box>
    </Box>
  );
}

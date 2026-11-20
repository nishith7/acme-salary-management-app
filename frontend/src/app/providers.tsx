import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AuthProvider } from '../features/auth/AuthProvider.tsx';
import { theme } from '../theme/index.ts';
import { createQueryClient } from './queryClient.ts';

interface AppProvidersProps {
  children: ReactNode;
  /** Tests pass their own, to look at the cache. The app lets this create one. */
  queryClient?: QueryClient;
}

/**
 * Everything the screens rely on, outermost first: the theme, the data cache, then the
 * signed-in user. The auth provider clears the cache when a session ends, so it sits inside it.
 */
export function AppProviders({ children, queryClient }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

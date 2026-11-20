import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

/** Shown while the app checks whether anyone is signed in, before it can pick a page. */
export function FullPageLoader() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress aria-label="Loading" />
    </Box>
  );
}

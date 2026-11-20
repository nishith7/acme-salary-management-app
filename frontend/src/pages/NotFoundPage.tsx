import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router';
import { paths } from '../app/paths.ts';
import { BrandLogo } from '../components/BrandLogo.tsx';

export function NotFoundPage() {
  return (
    <>
      <title>ACME · Page not found</title>
      <Box
        component="main"
        sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}
      >
        <Stack spacing={3} sx={{ alignItems: 'flex-start', maxWidth: 420 }}>
          <BrandLogo />
          <Typography variant="h1">Page not found</Typography>
          <Typography color="text.secondary">
            There is nothing at this address.
          </Typography>
          <Button component={Link} to={paths.employees} variant="contained">
            Go to employees
          </Button>
        </Stack>
      </Box>
    </>
  );
}

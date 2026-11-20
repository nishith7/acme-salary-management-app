import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';

interface BrandLogoProps {
  /** True on a dark background, where the wordmark must be light. */
  onDark?: boolean;
}

/** The ACME mark and wordmark. The mark is decoration; the text carries the name. */
export function BrandLogo({ onDark = false }: BrandLogoProps) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <Box
        aria-hidden
        sx={(theme) => ({
          width: 38,
          height: 38,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 1.25,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          fontSize: '1.1875rem',
          fontWeight: 800,
          boxShadow: `0 6px 18px ${alpha(theme.palette.primary.main, 0.4)}`,
        })}
      >
        A
      </Box>
      <Box sx={{ color: onDark ? 'common.white' : 'text.primary' }}>
        <Typography
          component="span"
          sx={{
            display: 'block',
            fontSize: '1.125rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            lineHeight: 1.1,
          }}
        >
          ACME
        </Typography>
        <Typography
          component="span"
          sx={{
            display: 'block',
            mt: 0.125,
            fontSize: '0.71875rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            color: onDark ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary',
          }}
        >
          Salary Manager
        </Typography>
      </Box>
    </Stack>
  );
}

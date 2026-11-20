import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { BrandLogo } from '../../../components/BrandLogo.tsx';

// What the app really does today. Do not put numbers about the data here (headcount,
// countries): this page is public, so nothing could keep them true.
const HIGHLIGHTS = [
  { title: 'Append-only', detail: 'salary history' },
  { title: 'Pay bands', detail: 'by country and level' },
  { title: 'USD view', detail: 'across currencies' },
] as const;

// Read once when the module loads: the year cannot change while the page is open in a way that matters.
const THIS_YEAR = new Date().getFullYear();

/** The dark brand panel beside the login form. Decorative, and hidden on small screens. */
export function LoginHero() {
  return (
    <Box
      component="aside"
      sx={(theme) => ({
        position: 'relative',
        overflow: 'hidden',
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 5,
        px: { md: 5, lg: 6.5 },
        py: { md: 4, lg: 5.5 },
        bgcolor: 'secondary.dark',
        color: 'common.white',
        // A faint grid fading out downwards, and a red glow in the corner.
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: `linear-gradient(${alpha(theme.palette.common.white, 0.04)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(theme.palette.common.white, 0.04)} 1px, transparent 1px)`,
          backgroundSize: '44px 44px',
          maskImage: 'linear-gradient(180deg, #000 0%, transparent 85%)',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          width: 520,
          height: 520,
          right: -180,
          bottom: -200,
          borderRadius: '50%',
          pointerEvents: 'none',
          background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.35)}, transparent 65%)`,
        },
        '& > *': { position: 'relative', zIndex: 1 },
      })}
    >
      <BrandLogo onDark />

      <Box>
        <Typography
          variant="overline"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            mb: 2,
            color: 'primary.light',
            '&::before': {
              content: '""',
              width: 18,
              height: 2,
              bgcolor: 'primary.main',
            },
          }}
        >
          People &amp; Pay
        </Typography>
        {/* Not a heading: the page's one h1 is "Sign in", in the main area. */}
        <Typography
          component="p"
          variant="h1"
          sx={{
            maxWidth: 480,
            fontSize: { md: '2rem', lg: '2.5rem' },
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
            textWrap: 'balance',
          }}
        >
          Every salary, every country.{' '}
          <Box component="span" sx={{ color: 'primary.main' }}>
            One source of truth.
          </Box>
        </Typography>
        <Typography
          sx={{
            mt: 2,
            maxWidth: 440,
            fontSize: '0.97rem',
            lineHeight: 1.55,
            color: (theme) => alpha(theme.palette.common.white, 0.7),
          }}
        >
          Replace spreadsheets with a single, audited record of how ACME pays
          its people.
        </Typography>
      </Box>

      <Box>
        <Stack
          direction="row"
          sx={{ flexWrap: 'wrap', columnGap: 4, rowGap: 2 }}
        >
          {HIGHLIGHTS.map(({ title, detail }) => (
            <Box key={title}>
              <Typography variant="h3" component="p">
                {title}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: (theme) => alpha(theme.palette.common.white, 0.6),
                }}
              >
                {detail}
              </Typography>
            </Box>
          ))}
        </Stack>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 3.5,
            color: (theme) => alpha(theme.palette.common.white, 0.5),
          }}
        >
          © {THIS_YEAR} ACME Corp · HR Systems
        </Typography>
      </Box>
    </Box>
  );
}

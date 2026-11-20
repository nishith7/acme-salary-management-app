import type { ThemeOptions } from '@mui/material/styles';

/**
 * Mulish (the login design's font), self-hosted from @fontsource-variable/mulish, which is
 * imported once in main.tsx. It is a variable font, so any weight from 200 to 1000 is
 * available from one file per script, and only the scripts a page uses are downloaded.
 * The system fonts after it only show while Mulish loads, or if it cannot.
 */
export const FONT_FAMILY =
  '"Mulish Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

type Typography = NonNullable<ThemeOptions['typography']>;

export const typography: Typography = {
  fontFamily: FONT_FAMILY,
  fontWeightRegular: 400,
  fontWeightMedium: 600,
  fontWeightBold: 800,
  // An admin tool reads best a little denser than MUI's 16px default body text.
  body1: { fontSize: '0.875rem', lineHeight: 1.5 },
  body2: { fontSize: '0.8125rem', lineHeight: 1.5 },
  // Page titles are 24px, not MUI's 96px h1: a screen has one title and a lot of data.
  h1: { fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.25 },
  h2: { fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.3 },
  h3: { fontSize: '1.125rem', fontWeight: 800, lineHeight: 1.3 },
  h4: { fontSize: '1rem', fontWeight: 800, lineHeight: 1.4 },
  h5: { fontSize: '0.9375rem', fontWeight: 800, lineHeight: 1.4 },
  h6: { fontSize: '0.875rem', fontWeight: 800, lineHeight: 1.4 },
  subtitle1: { fontSize: '0.9375rem', fontWeight: 600 },
  subtitle2: { fontSize: '0.8125rem', fontWeight: 600 },
  caption: { fontSize: '0.75rem', fontWeight: 600 },
  overline: {
    fontSize: '0.75rem',
    fontWeight: 800,
    letterSpacing: '0.08em',
    lineHeight: 1.5,
  },
  button: { fontSize: '0.875rem', fontWeight: 800, textTransform: 'none' },
};

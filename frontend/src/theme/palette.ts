import type { PaletteOptions } from '@mui/material/styles';

/**
 * ACME's colours, taken from the login design: a red brand colour, a dark "ink" for text
 * and the dark panels, and light neutrals. Every text-on-background pair used here was
 * checked against WCAG AA (4.5:1 for normal text, 3:1 for large text).
 *
 *  - primary (brand red): white text on it is 4.8:1, and it is 4.8:1 as link text on white.
 *  - secondary (ink): the text colour and the dark hero panel, so "secondary" is the
 *    neutral, never a second accent colour.
 *  - error is a deeper red than the brand on purpose: with a brand-red primary, a plain red
 *    error would look like just another primary action.
 *  - success is darker than the design's green (#16895A was 4.4:1 on white, under AA).
 */
export const palette: PaletteOptions = {
  mode: 'light',
  primary: {
    main: '#E11B22',
    dark: '#BE141A',
    light: '#FF8A8E', // for text on the dark panels, where the main red is too dim
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#1F2430',
    dark: '#14171F',
    light: '#3D4453',
    contrastText: '#FFFFFF',
  },
  error: { main: '#B42318' },
  warning: { main: '#B54708' },
  info: { main: '#1D5FD1' },
  success: { main: '#127A52' },
  text: {
    primary: '#1F2430',
    secondary: '#5B6270', // 5.8:1 on the page background
  },
  background: {
    default: '#F7F8FA',
    paper: '#FFFFFF',
  },
  divider: '#E7E9EE',
  // The DataGrid reads its header colour from here.
  DataGrid: { bg: '#FFFFFF', headerBg: '#F7F8FA' },
};

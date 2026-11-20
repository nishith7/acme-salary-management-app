import type { Components, Theme } from '@mui/material/styles';

/**
 * Defaults for MUI components, so screens say what they mean (`<Button>`, `<TextField>`)
 * and do not repeat the same props and `sx` everywhere. Add a rule here when the same
 * styling shows up in a second place, not before.
 */
export const components: Components<Theme> = {
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      sizeLarge: { height: 44 },
    },
  },
  MuiTextField: {
    // "secondary" is the ink colour, so a focused field gets a dark ring. With a red brand
    // colour as primary, a red focus ring would look like a validation error.
    defaultProps: { fullWidth: true, color: 'secondary' },
  },
  MuiLink: {
    defaultProps: { underline: 'hover' },
    styleOverrides: { root: { fontWeight: 700 } },
  },
  MuiAppBar: {
    defaultProps: { elevation: 0, color: 'inherit' },
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }),
    },
  },
};

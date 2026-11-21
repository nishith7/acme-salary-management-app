import type { Components, Theme } from '@mui/material/styles';
// Adds the DataGrid to the theme's types (MuiDataGrid below, and palette.DataGrid).
import type {} from '@mui/x-data-grid/themeAugmentation';

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
  MuiDataGrid: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderColor: theme.palette.divider,
        // shape.borderRadius is a number in this theme (theme/index.ts), typed number | string.
        borderRadius: Number(theme.shape.borderRadius) * 1.5,
        // 8px at each side of a cell instead of the default 10px: with ten columns that is
        // 40px, the difference between fitting a 1366px laptop screen and scrolling sideways.
        '& .MuiDataGrid-columnHeader, & .MuiDataGrid-cell': {
          paddingLeft: theme.spacing(1),
          paddingRight: theme.spacing(1),
        },
        // Small, bold, capitalised column titles: they label the data without competing with it.
        '& .MuiDataGrid-columnHeaderTitle': {
          fontSize: '0.75rem',
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: theme.palette.text.secondary,
        },
      }),
    },
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

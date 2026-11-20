import { createTheme } from '@mui/material/styles';
import { components } from './components.ts';
import { palette } from './palette.ts';
import { typography } from './typography.ts';

/** The one theme for the whole app. Colours live in palette.ts, fonts in typography.ts. */
export const theme = createTheme({
  palette,
  typography,
  components,
  shape: { borderRadius: 9 },
});

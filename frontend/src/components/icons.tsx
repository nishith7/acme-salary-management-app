import { createSvgIcon } from '@mui/material/utils';

// The few icons the app needs, drawn here (Material's own paths) so that adding a search
// box does not add the whole `@mui/icons-material` package. Add one here when a screen
// needs it; if the list grows past a handful, install the package and import by deep path.

export const SearchIcon = createSvgIcon(
  <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14" />,
  'Search',
);

export const CloseIcon = createSvgIcon(
  <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />,
  'Close',
);

export const EditIcon = createSvgIcon(
  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z" />,
  'Edit',
);

export const DownloadIcon = createSvgIcon(
  <path d="M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z" />,
  'Download',
);

export const UploadIcon = createSvgIcon(
  <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />,
  'Upload',
);

export const BackIcon = createSvgIcon(
  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z" />,
  'Back',
);

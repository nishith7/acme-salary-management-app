import Typography from '@mui/material/Typography';

// A placeholder so the protected routing has somewhere to land. The real directory (filters,
// sorting, server-side pages of 25, 50 or 100) replaces this in the next step.
export function DirectoryPage() {
  return (
    <>
      <title>ACME · Employees</title>
      <Typography variant="h1">Employees</Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>
        The employee directory is coming next.
      </Typography>
    </>
  );
}

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import type { EmployeeStatus } from '../../../api/employees.ts';
import {
  NO_FILTERS,
  hasActiveFilters,
  type DirectoryFilters as Filters,
} from '../filters.ts';
import { useFilterOptions } from '../use-filter-options.ts';
import { MultiSelectFilter } from './MultiSelectFilter.tsx';
import { SearchField } from './SearchField.tsx';

type StatusChoice = 'ALL' | EmployeeStatus;

// "Left" is what the table's Status column says for a terminated employee.
const STATUS_CHOICES: { value: StatusChoice; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'TERMINATED', label: 'Left' },
];

interface DirectoryFiltersProps {
  filters: Filters;
  onChange: (next: Filters) => void;
}

/**
 * The search box and filters above the employee table: name or ID search, country and
 * department (any number of each) and employment status. Every change goes to the page at
 * once, except typing, which waits for a pause. Status is three buttons rather than a
 * dropdown, since it has two values and "All": one click instead of two.
 */
export function DirectoryFilters({ filters, onChange }: DirectoryFiltersProps) {
  const options = useFilterOptions();
  // Bumped by "Clear filters" to give the search box a fresh start (see SearchField).
  const [searchKey, setSearchKey] = useState(0);

  const countryOptions = useMemo(
    () =>
      (options.data?.countries ?? []).map((c) => ({
        value: c.code,
        label: c.name,
      })),
    [options.data],
  );
  const departmentOptions = useMemo(
    () =>
      (options.data?.departments ?? []).map((name) => ({
        value: name,
        label: name,
      })),
    [options.data],
  );

  const status: StatusChoice = filters.statuses[0] ?? 'ALL';

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
          <SearchField
            key={searchKey}
            value={filters.search}
            onSearch={(search) => onChange({ ...filters, search })}
          />
        </Box>
        <MultiSelectFilter
          label="Country"
          allLabel="All countries"
          plural="countries"
          options={countryOptions}
          selected={filters.countries}
          onChange={(countries) => onChange({ ...filters, countries })}
          disabled={!options.data}
        />
        <MultiSelectFilter
          label="Department"
          allLabel="All departments"
          plural="departments"
          options={departmentOptions}
          selected={filters.departments}
          onChange={(departments) => onChange({ ...filters, departments })}
          disabled={!options.data}
        />
        <ToggleButtonGroup
          exclusive
          size="small"
          color="secondary"
          aria-label="Employment status"
          value={status}
          onChange={(_event, next: StatusChoice | null) => {
            // Pressing the chosen button again would unselect it; one is always chosen.
            if (next !== null) {
              onChange({
                ...filters,
                statuses: next === 'ALL' ? [] : [next],
              });
            }
          }}
        >
          {STATUS_CHOICES.map((choice) => (
            <ToggleButton
              key={choice.value}
              value={choice.value}
              sx={{ height: 40, px: 1.75, textTransform: 'none' }}
            >
              {choice.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {hasActiveFilters(filters) && (
          <Button
            color="secondary"
            onClick={() => {
              setSearchKey((key) => key + 1);
              onChange(NO_FILTERS);
            }}
          >
            Clear filters
          </Button>
        )}
      </Box>
      {options.isError && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Typography variant="body2" color="error" role="alert">
            The country and department lists could not be loaded.
          </Typography>
          <Button
            size="small"
            color="secondary"
            onClick={() => void options.refetch()}
          >
            Try again
          </Button>
        </Box>
      )}
    </Paper>
  );
}

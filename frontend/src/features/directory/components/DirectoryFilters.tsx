import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import {
  BAND_POSITIONS,
  TENURE_BANDS,
  type EmployeeStatus,
} from '../../../api/employees.ts';
import {
  NO_FILTERS,
  countMoreFilters,
  hasActiveFilters,
  type DirectoryFilters as Filters,
} from '../filters.ts';
import { bandPositionLabel, formatTenureBand } from '../format.ts';
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

// The choices that never change come from the API's own lists, so a new one added there
// shows up here without a second edit.
const BAND_POSITION_OPTIONS = BAND_POSITIONS.map((value) => ({
  value,
  label: bandPositionLabel(value),
}));
const TENURE_OPTIONS = TENURE_BANDS.map((value) => ({
  value,
  label: formatTenureBand(value),
}));

interface DirectoryFiltersProps {
  filters: Filters;
  onChange: (next: Filters) => void;
}

/**
 * The search box and filters above the employee table: name or ID search, country,
 * department and pay band (any number of each) and employment status, with level, tenure and
 * job title one click away under "More filters". Every change goes to the page at once,
 * except typing, which waits for a pause. Status is three buttons rather than a dropdown,
 * since it has two values and "All": one click instead of two. The button for the hidden row
 * says how many of its filters are on, so nothing narrows the list out of sight.
 */
export function DirectoryFilters({ filters, onChange }: DirectoryFiltersProps) {
  const options = useFilterOptions();
  // Bumped by "Clear filters" to give the search box a fresh start (see SearchField).
  const [searchKey, setSearchKey] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

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
  // The dropdown deals in text; a level is sent to the API as a number, so it is turned back
  // below.
  const levelOptions = useMemo(
    () =>
      (options.data?.levels ?? []).map((level) => ({
        value: String(level),
        label: `Level ${level}`,
      })),
    [options.data],
  );
  const jobTitleOptions = useMemo(
    () =>
      (options.data?.jobTitles ?? []).map((title) => ({
        value: title,
        label: title,
      })),
    [options.data],
  );

  const status: StatusChoice = filters.statuses[0] ?? 'ALL';
  const moreCount = countMoreFilters(filters);

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
        <MultiSelectFilter
          label="Pay band"
          allLabel="Any pay band"
          plural="pay bands"
          options={BAND_POSITION_OPTIONS}
          selected={filters.bandPositions}
          onChange={(bandPositions) =>
            onChange({
              ...filters,
              bandPositions: bandPositions as Filters['bandPositions'],
            })
          }
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
        <Button
          color="secondary"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
          sx={{ fontWeight: moreCount > 0 ? 700 : 500 }}
        >
          {moreCount > 0 ? `More filters (${moreCount})` : 'More filters'}
        </Button>
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
      <Collapse in={moreOpen} unmountOnExit>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1.5,
            mt: 1.5,
          }}
        >
          <MultiSelectFilter
            label="Level"
            allLabel="All levels"
            plural="levels"
            options={levelOptions}
            selected={filters.levels.map(String)}
            onChange={(levels) =>
              onChange({ ...filters, levels: levels.map(Number) })
            }
            disabled={!options.data}
          />
          <MultiSelectFilter
            label="Tenure"
            allLabel="Any tenure"
            plural="tenure bands"
            options={TENURE_OPTIONS}
            selected={filters.tenureBands}
            onChange={(tenureBands) =>
              onChange({
                ...filters,
                tenureBands: tenureBands as Filters['tenureBands'],
              })
            }
          />
          <MultiSelectFilter
            label="Job title"
            allLabel="All job titles"
            plural="job titles"
            options={jobTitleOptions}
            selected={filters.jobTitles}
            onChange={(jobTitles) => onChange({ ...filters, jobTitles })}
            disabled={!options.data}
          />
        </Box>
      </Collapse>
      {options.isError && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Typography variant="body2" color="error" role="alert">
            The filter lists could not be loaded.
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

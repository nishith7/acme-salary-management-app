import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';

export interface FilterOption {
  /** What is sent to the API. */
  value: string;
  /** What the person reads. */
  label: string;
}

interface MultiSelectFilterProps {
  /** The control's name for screen readers, for example "Country". */
  label: string;
  /** Shown while nothing is chosen, which means everyone: "All countries". */
  allLabel: string;
  /** For the summary of several choices: "3 countries". */
  plural: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}

/**
 * A dropdown where any number of options can be ticked; an employee matches if they fit any
 * ticked one. Closed, it reads "All countries", the one option's name, or "3 countries", so
 * it stays one short line however much is chosen. A chosen filter is bold with a darker
 * outline, so it is easy to see which ones are narrowing the list.
 */
export function MultiSelectFilter({
  label,
  allLabel,
  plural,
  options,
  selected,
  onChange,
  disabled,
}: MultiSelectFilterProps) {
  const active = selected.length > 0;

  function summarise(values: string[]): string {
    if (values.length === 0) {
      return allLabel;
    }
    if (values.length === 1) {
      return options.find((o) => o.value === values[0])?.label ?? values[0]!;
    }
    return `${values.length} ${plural}`;
  }

  return (
    <FormControl
      size="small"
      // The ink colour, as the theme sets it for text fields: a red ring would look like an error.
      color="secondary"
      sx={{ flex: '0 1 200px', minWidth: 160 }}
      disabled={disabled}
    >
      <Select<string[]>
        multiple
        displayEmpty
        value={selected}
        onChange={(event) => {
          const { value } = event.target;
          onChange(typeof value === 'string' ? value.split(',') : value);
        }}
        renderValue={summarise}
        inputProps={{ 'aria-label': label }}
        MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
        sx={{
          fontWeight: active ? 700 : 400,
          '& .MuiOutlinedInput-notchedOutline': active
            ? { borderColor: 'secondary.main' }
            : {},
        }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value} dense>
            <Checkbox
              size="small"
              color="secondary"
              checked={selected.includes(option.value)}
              disableRipple
              tabIndex={-1}
            />
            <ListItemText primary={option.label} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

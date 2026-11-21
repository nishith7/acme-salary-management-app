import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { useEffect, useRef, useState } from 'react';
import { CloseIcon, SearchIcon } from '../../../components/icons.tsx';

/** How long typing must pause before the list is searched: a word is not one request per letter. */
export const SEARCH_DEBOUNCE_MS = 300;

interface SearchFieldProps {
  /** The search the list currently shows (already trimmed). */
  value: string;
  /** Called with the trimmed text, once typing pauses, on Enter, or when the box is cleared. */
  onSearch: (value: string) => void;
}

/**
 * The search box. It keeps the text as typed (spaces and all) and tells the page only when
 * the user pauses, so the page never searches for half a word. To empty it from outside,
 * mount a new one with a different `key`: that also drops a search that was still waiting.
 */
export function SearchField({ value, onSearch }: SearchFieldProps) {
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = text.trim();
    if (next === value) {
      return;
    }
    const timer = setTimeout(() => onSearch(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, value, onSearch]);

  function clear() {
    setText('');
    onSearch('');
  }

  return (
    <TextField
      size="small"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onSearch(text.trim());
        } else if (event.key === 'Escape' && text !== '') {
          clear();
        }
      }}
      placeholder="Search by name or employee ID"
      slotProps={{
        htmlInput: {
          ref: inputRef,
          'aria-label': 'Search employees by name or employee ID',
          maxLength: 100, // the API's limit
          autoComplete: 'off',
        },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
          endAdornment: text !== '' && (
            <InputAdornment position="end">
              <IconButton
                size="small"
                edge="end"
                aria-label="Clear search"
                onClick={() => {
                  clear();
                  inputRef.current?.focus();
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

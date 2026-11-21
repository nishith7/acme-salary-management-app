/** A file that is not a readable CSV, with a message fit to show the person who uploaded it. */
export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvError';
  }
}

/** One row of the file: its cells, and the line it starts on (a quoted cell can span lines). */
export interface CsvRecord {
  line: number;
  cells: string[];
}

const DELIMITERS = [',', ';', '\t'] as const;

/**
 * Excel saves a CSV with semicolons in many European settings (where the comma is the
 * decimal mark), and some tools use tabs. The header row says which: whichever of the three
 * appears most outside quotes, a comma when there is a tie.
 */
function sniffDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  let sawContent = false;
  for (const ch of text) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      sawContent = true;
    } else if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (sawContent) {
        break;
      }
    } else if (!inQuotes && counts.has(ch)) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
      sawContent = true;
    } else if (ch.trim() !== '') {
      sawContent = true;
    }
  }
  return DELIMITERS.reduce((best, d) =>
    (counts.get(d) ?? 0) > (counts.get(best) ?? 0) ? d : best,
  );
}

/**
 * Reads CSV text into rows of cells (RFC 4180: quoted cells may hold the delimiter, line
 * breaks and doubled quotes; LF, CRLF and CR all end a row; a leading byte order mark is
 * dropped). Blank rows are skipped, and every row keeps the number of the line it started on,
 * so a message can say "line 7" and mean the line the person sees in their spreadsheet.
 */
export function parseCsv(input: string): CsvRecord[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = sniffDelimiter(text);
  const records: CsvRecord[] = [];

  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let quoteOpenedOn = 0;
  let line = 1;
  let recordLine = 1;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    if (cells.some((c) => c.trim() !== '')) {
      records.push({ line: recordLine, cells });
    }
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') {
          line++;
        }
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      inQuotes = true;
      quoteOpenedOn = line;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text.charAt(i + 1) === '\n') {
        i++;
      }
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += ch;
    }
  }

  if (inQuotes) {
    throw new CsvError(
      `The quote opened on line ${quoteOpenedOn} is never closed.`,
    );
  }
  if (cell !== '' || cells.length > 0) {
    endRecord();
  }
  return records;
}

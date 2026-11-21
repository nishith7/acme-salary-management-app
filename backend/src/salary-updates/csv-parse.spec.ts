import { CsvError, parseCsv } from './csv-parse.js';

describe('parseCsv', () => {
  it('reads rows and cells, and numbers each row by the line it starts on', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      { line: 1, cells: ['a', 'b', 'c'] },
      { line: 2, cells: ['1', '2', '3'] },
    ]);
  });

  it('reads files saved on Windows (CRLF), and with the byte order mark Excel adds', () => {
    expect(parseCsv('\uFEFFa,b\r\n1,2\r\n')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['1', '2'] },
    ]);
  });

  it('keeps a comma, a doubled quote and a line break inside a quoted cell', () => {
    const rows = parseCsv(
      'name,note\n"Rao, Asha","said ""hi""\nthen left"\nnext,row\n',
    );

    expect(rows[1]).toEqual({
      line: 2,
      cells: ['Rao, Asha', 'said "hi"\nthen left'],
    });
    // The cell above spans two lines, so the next row starts on line 4.
    expect(rows[2]).toEqual({ line: 4, cells: ['next', 'row'] });
  });

  it('reads the semicolons Excel saves with in many European settings, and tabs', () => {
    expect(parseCsv('a;b;c\n1;2;3\n')[1]?.cells).toEqual(['1', '2', '3']);
    expect(parseCsv('a\tb\tc\n1\t2\t3\n')[1]?.cells).toEqual(['1', '2', '3']);
    // A comma inside a semicolon file is just text (a decimal comma).
    expect(parseCsv('a;b\n1;52000,50\n')[1]?.cells).toEqual(['1', '52000,50']);
  });

  it('skips blank lines without losing count of the line numbers', () => {
    expect(parseCsv('a,b\n\n1,2\n,\n3,4\n')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 3, cells: ['1', '2'] },
      { line: 5, cells: ['3', '4'] },
    ]);
  });

  it('gives no rows for an empty file, and keeps empty cells in the middle of a row', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,,c\n')[0]?.cells).toEqual(['a', '', 'c']);
  });

  it('refuses a quote that is never closed, saying where it was opened', () => {
    expect(() => parseCsv('a,b\n1,"unfinished\n2,3\n')).toThrowError(
      new CsvError('The quote opened on line 2 is never closed.'),
    );
  });
});

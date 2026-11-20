import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App.tsx';

// One test whose job is to prove the toolchain (Vitest, jsdom, Testing Library,
// TypeScript, JSX) works end to end, so CI has something real to run.
describe('App', () => {
  it('renders the application title', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'ACME Salary Management' }),
    ).toBeInTheDocument();
  });
});

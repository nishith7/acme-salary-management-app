import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only unmounts between tests by itself when the test runner exposes
// globals; this project imports from 'vitest' explicitly, so do it here.
afterEach(cleanup);

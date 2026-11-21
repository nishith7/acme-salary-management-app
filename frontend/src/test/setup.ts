import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only unmounts between tests by itself when the test runner exposes
// globals; this project imports from 'vitest' explicitly, so do it here.
afterEach(cleanup);

// How long `findBy…` and `waitFor` keep looking before giving up. The default, one second, is
// enough on a quiet machine, but the pages here load their data and render a grid, and one
// run failed on a busy laptop with a test that passes alone. Waiting longer costs nothing when
// the screen is ready, since they stop as soon as it is.
configure({ asyncUtilTimeout: 3000 });

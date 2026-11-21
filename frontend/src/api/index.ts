import { apiUrl } from '../config.ts';
import { createAuthApi } from './auth.ts';
import { createApiClient } from './client.ts';
import { createEmployeesApi } from './employees.ts';

// The one client the whole app shares, so there is one access token and one refresh. Where
// it sends requests comes from VITE_API_URL (frontend/.env, see .env.example), through
// src/config.ts, and there is no default.
export const apiClient = createApiClient({ baseURL: apiUrl });
export const authApi = createAuthApi(apiClient);
export const employeesApi = createEmployeesApi(apiClient);

export { ApiError } from './errors.ts';

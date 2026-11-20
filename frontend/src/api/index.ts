import { createAuthApi } from './auth.ts';
import { createApiClient } from './client.ts';
import { createEmployeesApi } from './employees.ts';

// The one client the whole app shares, so there is one access token and one refresh.
// VITE_API_URL is /api behind a proxy (the default); set it to the API's full URL when
// the site is served from another host. See .env.example.
const baseURL: string = import.meta.env.VITE_API_URL || '/api';

export const apiClient = createApiClient({ baseURL });
export const authApi = createAuthApi(apiClient);
export const employeesApi = createEmployeesApi(apiClient);

export { ApiError } from './errors.ts';

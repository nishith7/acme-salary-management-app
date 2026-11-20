// Shapes of the API's auth responses, written by hand from
// backend/src/auth/auth.schemas.ts. Keep the two in step.

export type Role = 'HR_ADMIN' | 'EMPLOYEE';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** The body of both `POST /auth/login` and `POST /auth/refresh`. */
export interface LoginResponse {
  /** JWT for the `Authorization: Bearer` header. */
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  user: AuthUser;
}

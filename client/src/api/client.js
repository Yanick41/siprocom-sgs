import axios from 'axios';

/**
 * Single axios instance for the whole app.
 * `withCredentials` carries the httpOnly auth cookie; we never touch tokens in JS.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Normalises every failure into { code, details, status } so callers and the
 * error-translation helper never have to inspect axios internals.
 * The server sends codes, not sentences - see IMPLEMENTATION_PLAN.md §7 rule 5.
 */
export class ApiError extends Error {
  constructor(code, details, status) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.code === 'ECONNABORTED' || !error.response) {
      return Promise.reject(new ApiError('NETWORK_ERROR', undefined, 0));
    }

    const { status, data } = error.response;
    const code = data?.error?.code || 'UNKNOWN';

    // Session expired: let the auth layer react (redirect to login).
    if (status === 401) {
      window.dispatchEvent(new CustomEvent('sgs:unauthorized'));
    }
    if (status === 429) {
      return Promise.reject(new ApiError('TOO_MANY_REQUESTS', data?.error?.details, status));
    }

    return Promise.reject(new ApiError(code, data?.error?.details, status));
  }
);

export default api;

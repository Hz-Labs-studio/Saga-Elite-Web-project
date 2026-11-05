import axios from 'axios';
import { API_V1_URL } from '@/lib/api';

/**
 * Axios instance with built-in Bearer token support.
 * Automatically adds Authorization header if token exists in localStorage.
 * Falls back to cookies for backward compatibility.
 */
const axiosInstance = axios.create({
  baseURL: API_V1_URL,
  withCredentials: true, // Still send cookies if they exist
});

/**
 * Request interceptor: attach Bearer token from localStorage if available.
 */
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor: handle 401 (token expired/invalid).
 * Extract and store token from response if present.
 *
 * IMPORTANT: only clear the stored token when the 401 means the SESSION
 * itself is invalid (token missing/expired/rejected by auth-middleware).
 * Business 401s — "current password is incorrect", "invalid OTP",
 * "please sign in to use this reward" — must NOT wipe an authenticated
 * user's token.
 */
const SESSION_INVALID_401 = [
  'not authenticated',
  'session',
  'no longer exists',
  'invalid or expired',
  'log in',
  'login first',
];

axiosInstance.interceptors.response.use(
  (response) => {
    if (response.data?.token) {
      localStorage.setItem('authToken', response.data.token);
    }
    return response;
  },
  (error) => {
    // Attach a friendly user message for consistent UI error notifications
    error.userMessage =
      error.response?.data?.message ||
      error.message ||
      'An unexpected network or server error occurred. Please try again.';

    if (error.response?.status === 401) {
      const message = String(error.response?.data?.message || '').toLowerCase();
      const isSessionInvalid = SESSION_INVALID_401.some((s) => message.includes(s));
      if (isSessionInvalid) {
        localStorage.removeItem('authToken');
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;

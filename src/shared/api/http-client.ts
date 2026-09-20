import { ApiClientError, ApiResponse } from '@/entities/common';
import { tokenStorage } from '@/features/auth/token-storage';

type RequestOptions = RequestInit & {
  auth?: 'required' | 'optional' | 'none' | 'refresh';
  retryOnUnauthorized?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  const body = parseApiBody<T>(text, response.status);

  if (!response.ok) {
    throw new ApiClientError(response.status, body.message, (body.data ?? null) as null | Record<string, unknown>);
  }

  return body;
}

function parseApiBody<T>(text: string, status: number): ApiResponse<T> {
  if (!text) {
    return { message: status === 401 ? 'invalid_token' : '', data: null as T };
  }

  try {
    const parsed = JSON.parse(text) as ApiResponse<T> | string;
    if (typeof parsed === 'string') return { message: parsed, data: null as T };
    return {
      message: parsed.message ?? (status === 401 ? 'invalid_token' : ''),
      data: parsed.data,
    };
  } catch {
    return { message: status === 401 ? 'invalid_token' : text, data: null as T };
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
    .then((response) => parseResponse<{ accessToken?: string | null }>(response))
    .then(({ data }) => {
      if (data.accessToken) {
        tokenStorage.updateAccessToken(data.accessToken);
      }
      return data.accessToken ?? null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

function buildHeaders(options: RequestOptions) {
  const headers = new Headers(options.headers);
  const authMode = options.auth ?? 'required';

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (authMode === 'required' || authMode === 'optional') {
    const stored = tokenStorage.read();
    if (stored?.accessToken) {
      headers.set('Authorization', `Bearer ${stored.accessToken}`);
    }
  }

  if (authMode === 'refresh') {
    return headers;
  }

  return headers;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const authMode = options.auth ?? 'required';
  const response = await fetch(path, {
    ...options,
    credentials: requestCredentials(options),
    headers: buildHeaders(options),
  });

  try {
    const { data } = await parseResponse<T>(response);
    return data;
  } catch (error) {
    const shouldRefresh =
      error instanceof ApiClientError &&
      error.status === 401 &&
      error.messageCode !== 'invalid_id_or_password' &&
      (authMode === 'required' || authMode === 'optional') &&
      options.retryOnUnauthorized !== false;

    if (!shouldRefresh) throw error;

    try {
      await refreshAccessToken();
    } catch (refreshError) {
      tokenStorage.clear();
      if (authMode !== 'optional') throw refreshError;

      const retryResponse = await fetch(path, {
        ...options,
        credentials: requestCredentials({ ...options, auth: 'none' }),
        auth: 'none',
        retryOnUnauthorized: false,
        headers: buildHeaders({ ...options, auth: 'none' }),
      } as RequestOptions);
      const { data } = await parseResponse<T>(retryResponse);
      return data;
    }

    try {
      const retryResponse = await fetch(path, {
        ...options,
        credentials: requestCredentials(options),
        retryOnUnauthorized: false,
        headers: buildHeaders(options),
      } as RequestOptions);
      const { data } = await parseResponse<T>(retryResponse);
      return data;
    } catch (retryError) {
      if (!(authMode === 'optional' && retryError instanceof ApiClientError && retryError.status === 401)) throw retryError;

      tokenStorage.clear();
      const publicResponse = await fetch(path, {
        ...options,
        credentials: requestCredentials({ ...options, auth: 'none' }),
        auth: 'none',
        retryOnUnauthorized: false,
        headers: buildHeaders({ ...options, auth: 'none' }),
      } as RequestOptions);
      const { data } = await parseResponse<T>(publicResponse);
      return data;
    }
  }
}

function requestCredentials(options: RequestOptions): RequestCredentials {
  if (options.credentials) return options.credentials;

  const authMode = options.auth ?? 'required';
  if (authMode === 'none') return 'omit';
  if ((authMode === 'required' || authMode === 'optional') && tokenStorage.read()?.accessToken) return 'omit';
  return 'include';
}

export function toApiErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.messageCode;
  return 'internal_server_error';
}

export function jsonBody<T>(body: T) {
  return JSON.stringify(body);
}

export function getApiInternalBase(): string {
  return (process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');
}

export const API_INTERNAL_BASE = getApiInternalBase();

export interface ServerFetchOptions {
  tags?: string[];
  revalidate?: number | false;
  noStore?: boolean;
}

export async function serverApiGet<T>(
  apiPath: string,
  opts: ServerFetchOptions = {},
): Promise<T> {
  const url = `${getApiInternalBase()}/api/v1${apiPath}`;
  const res = await fetch(url, {
    ...(opts.noStore
      ? { cache: 'no-store' as const }
      : {
          next: {
            tags: opts.tags ?? ['cms:global'],
            revalidate: opts.revalidate ?? 3600,
          },
        }),
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    let msg = `API request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {
      // ignore
    }
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return res.json() as Promise<T>;
}

/**
 * Browser-side API client routing strictly through the single public origin (/api/v1/*).
 * Sends HttpOnly cookies automatically and includes CSRF token on mutations when provided.
 */
export async function clientApi<T = unknown>(
  apiPath: string,
  options: {
    method?: string;
    body?: unknown;
    csrfToken?: string;
    idempotencyKey?: string;
    formData?: FormData;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.csrfToken) headers['x-csrf-token'] = options.csrfToken;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  if (!options.formData && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`/api/v1${apiPath}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
    body: options.formData
      ? options.formData
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const errBody = parsed as { error?: { code?: string; message?: string; details?: unknown } } | null;
    const err = new Error(errBody?.error?.message || `Request failed (${res.status})`) as Error & {
      status?: number;
      code?: string;
      details?: unknown;
    };
    err.status = res.status;
    err.code = errBody?.error?.code;
    err.details = errBody?.error?.details;
    throw err;
  }

  return parsed as T;
}

import type { paths } from './schema';

/** Browser API client only. No pages, login flow or UI dependencies. */
export class CareerQuestError extends Error {
  constructor(public code: string, message: string, public status: number, public requestId?: string) {
    super(message);
  }
}

type Method<P extends keyof paths> = Extract<keyof paths[P], 'get' | 'post' | 'put' | 'patch' | 'delete'>;
type Operation<P extends keyof paths, M extends Method<P>> = NonNullable<paths[P][M]>;
type Body<O> = O extends { requestBody: { content: { 'application/json': infer B } } } ? B : never;
type Result<O> = O extends { responses: { 200: { content: { 'application/json': infer R } } } } ? R : unknown;

export function createCareerQuestClient(baseUrl = '') {
  return async function request<P extends keyof paths, M extends Method<P>>(
    path: P,
    method: M,
    options: {
      body?: Body<Operation<P, M>>;
      pathParams?: Record<string, string>;
      query?: Record<string, string | number>;
      signal?: AbortSignal;
    } = {},
  ): Promise<Result<Operation<P, M>>> {
    let route = path as string;
    for (const [name, value] of Object.entries(options.pathParams ?? {})) {
      route = route.replace(`{${name}}`, encodeURIComponent(value));
    }
    const query = new URLSearchParams(Object.entries(options.query ?? {}).map(([k, v]) => [k, String(v)]));
    const response = await fetch(baseUrl + route + (query.size ? '?' + query.toString() : ''), {
      method: method.toUpperCase(),
      credentials: 'include',
      headers: options.body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new CareerQuestError(payload.error?.code ?? 'CONFLICT', payload.error?.message ?? 'Request failed', response.status, payload.request_id);
    }
    return payload;
  };
}

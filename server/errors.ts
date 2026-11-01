import type { ApiErrorCode } from '../shared/types.js';

export class ApiError extends Error {
  constructor(public status: number, public code: ApiErrorCode) {
    super(code);
  }
}

export type Handler = (req: Request) => Promise<Response>;

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function withErrors(handler: Handler): Handler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof ApiError) return json(e.status, { error: e.code });
      console.error(e);
      return json(500, { error: 'upstream_failed' });
    }
  };
}

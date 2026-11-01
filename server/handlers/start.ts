import { z } from 'zod';
import { STALE_AFTER_MINUTES } from '../../shared/constants';
import type { Deps } from '../deps';
import { ApiError, json, withErrors } from '../errors';
import { readJson } from '../http';
import { JobSummarySchema, ResumeSummarySchema } from '../schemas';
import { assertOwnedPath } from '../paths';

const Body = z.object({ job: JobSummarySchema, resume: ResumeSummarySchema, resumePath: z.string().min(1) });

export function createStartHandler(deps: Deps) {
  return withErrors(async (req) => {
    const { userId } = await deps.auth(req);
    const body = await readJson(req, Body);
    assertOwnedPath(userId, body.resumePath, 'resumes');

    const now = deps.now();
    const result = await deps.repo.startInterview(userId, { ...body, startedAt: now }, {
      staleBefore: new Date(now.getTime() - STALE_AFTER_MINUTES * 60_000),
      unfinishedSince: new Date(now.getTime() - 24 * 3600_000),
    });
    if (!result.ok) throw new ApiError(result.code === 'quota_exhausted' ? 403 : 429, result.code);
    return json(200, { interviewId: result.interview.id, startedAt: result.interview.startedAt.toISOString() });
  });
}

import { z } from 'zod';
import { STALE_AFTER_MINUTES } from '../../shared/constants';
import type { Deps } from '../deps';
import { ApiError, json, withErrors } from '../errors';
import { readJson } from '../http';
import { decideStart } from '../quota';
import { JobSummarySchema, ResumeSummarySchema } from '../schemas';

const Body = z.object({ job: JobSummarySchema, resume: ResumeSummarySchema, resumePath: z.string().min(1) });

export function createStartHandler(deps: Deps) {
  return withErrors(async (req) => {
    const { userId } = await deps.auth(req);
    const body = await readJson(req, Body);
    if (!body.resumePath.startsWith(`${userId}/`)) throw new ApiError(403, 'forbidden');

    const now = deps.now();
    await deps.repo.abandonStale(userId, new Date(now.getTime() - STALE_AFTER_MINUTES * 60_000));
    const decision = decideStart({
      freeUsed: await deps.repo.getFreeUsed(userId),
      unfinishedLast24h: await deps.repo.countUnfinishedSince(userId, new Date(now.getTime() - 24 * 3600_000)),
    });
    if (!decision.ok) throw new ApiError(decision.code === 'quota_exhausted' ? 403 : 429, decision.code);

    const interview = await deps.repo.createInterview(userId, { ...body, startedAt: now });
    return json(200, { interviewId: interview.id, startedAt: interview.startedAt.toISOString() });
  });
}

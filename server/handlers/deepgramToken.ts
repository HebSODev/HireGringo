import { z } from 'zod';
import { HARD_LIMIT_SECONDS } from '../../shared/constants.js';
import type { Deps } from '../deps.js';
import { ApiError, json, withErrors } from '../errors.js';
import { readJson } from '../http.js';

const Body = z.object({ interviewId: z.string().min(1) });

export function createDeepgramTokenHandler(deps: Deps) {
  return withErrors(async (req) => {
    const { userId } = await deps.auth(req);
    const { interviewId } = await readJson(req, Body);
    const interview = await deps.repo.getInterview(userId, interviewId);
    if (!interview) throw new ApiError(404, 'not_found');
    if (interview.status !== 'in_progress') throw new ApiError(409, 'interview_not_active');
    if (deps.now().getTime() - interview.startedAt.getTime() > HARD_LIMIT_SECONDS * 1000) throw new ApiError(409, 'time_over');
    return json(200, await deps.deepgram.grant(30));
  });
}

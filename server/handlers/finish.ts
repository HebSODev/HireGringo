import { z } from 'zod';
import { HARD_LIMIT_SECONDS, MIN_SECONDS_FOR_RESULT } from '../../shared/constants.js';
import type { Deps } from '../deps.js';
import { ApiError, json, withErrors } from '../errors.js';
import { buildEvaluatorMessages, evaluate } from '../evaluator.js';
import { readJson } from '../http.js';

const Body = z.object({ interviewId: z.string().min(1) });

export function createFinishHandler(deps: Deps) {
  return withErrors(async (req) => {
    const { userId } = await deps.auth(req);
    const { interviewId } = await readJson(req, Body);
    const interview = await deps.repo.getInterview(userId, interviewId);
    if (!interview) throw new ApiError(404, 'not_found');
    if (interview.status === 'completed') return json(200, { status: 'completed' });
    if (interview.status === 'abandoned') return json(200, { status: 'abandoned' });

    const now = deps.now();
    const elapsedSec = Math.min((now.getTime() - interview.startedAt.getTime()) / 1000, HARD_LIMIT_SECONDS);
    if (elapsedSec < MIN_SECONDS_FOR_RESULT) {
      await deps.repo.abandonInterview(interview.id, now);
      return json(200, { status: 'abandoned', reason: 'too_short' });
    }

    const turns = await deps.repo.listTurns(interview.id);
    const messages = buildEvaluatorMessages({ template: await deps.prompt('evaluator'), interview, turns });
    const candidateSpeech = turns.filter((t) => t.role === 'candidate').map((t) => t.text).join(' ');
    await deps.repo.completeInterview(interview.id, await evaluate(deps.llm, messages, candidateSpeech));
    return json(200, { status: 'completed' });
  });
}

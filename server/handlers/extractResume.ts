import { z } from 'zod';
import { assertCanExtract } from '../quota.js';
import type { Deps } from '../deps.js';
import { ApiError, json, withErrors } from '../errors.js';
import { readJson } from '../http.js';
import { assertOwnedPath } from '../paths.js';
import { renderPrompt } from '../prompts.js';
import { ResumeSummarySchema } from '../schemas.js';

const Body = z.object({ path: z.string().min(1) });
const MIN_TEXT = 200;
const MAX_RESUME_TEXT_CHARS = 30_000;

export function createExtractResumeHandler(deps: Deps) {
  return withErrors(async (req) => {
    const { userId } = await deps.auth(req);
    const { path } = await readJson(req, Body);
    assertOwnedPath(userId, path, 'resumes');
    await assertCanExtract(deps.repo, userId);

    const text = (await deps.pdfToText(await deps.storage.download('resumes', path))).trim();
    if (text.length < MIN_TEXT) throw new ApiError(422, 'resume_unreadable');
    const capped = text.slice(0, MAX_RESUME_TEXT_CHARS);

    const content = renderPrompt(await deps.prompt('extract-resume'), { text: capped });
    let raw: unknown;
    try {
      raw = await deps.llm.json([{ role: 'system', content }]);
    } catch {
      throw new ApiError(502, 'upstream_failed');
    }
    const parsed = ResumeSummarySchema.safeParse(raw);
    if (!parsed.success) throw new ApiError(502, 'upstream_failed');
    return json(200, parsed.data);
  });
}

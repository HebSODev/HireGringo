import { z } from 'zod';
import type { Deps } from '../deps';
import { ApiError, json, withErrors } from '../errors';
import { readJson } from '../http';
import { renderPrompt } from '../prompts';
import { ResumeSummarySchema } from '../schemas';

const Body = z.object({ path: z.string().min(1) });
const MIN_TEXT = 200;

export function createExtractResumeHandler(deps: Deps) {
  return withErrors(async (req) => {
    const { userId } = await deps.auth(req);
    const { path } = await readJson(req, Body);
    if (!path.startsWith(`${userId}/`)) throw new ApiError(403, 'forbidden');

    const text = (await deps.pdfToText(await deps.storage.download('resumes', path))).trim();
    if (text.length < MIN_TEXT) throw new ApiError(422, 'resume_unreadable');

    const content = renderPrompt(await deps.prompt('extract-resume'), { text });
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

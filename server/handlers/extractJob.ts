import { z } from 'zod';
import type { Deps } from '../deps';
import { ApiError, json, withErrors } from '../errors';
import { htmlToText } from '../extract/html';
import { assertFetchableUrl } from '../extract/url';
import { readJson } from '../http';
import { renderPrompt } from '../prompts';
import { JobSummarySchema } from '../schemas';

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().trim().min(1) }),
  z.object({ kind: z.literal('url'), url: z.string().min(1) }),
  z.object({ kind: z.literal('file'), path: z.string().min(1), mime: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']) }),
]);

const Extracted = JobSummarySchema.extend({ isTechRole: z.boolean() });
const MIN_TEXT = 200;
const IMAGE_NOTE = '(The job posting is in the attached image. Read it from the image.)';

export function createExtractJobHandler(deps: Deps) {
  return withErrors(async (req) => {
    const { userId } = await deps.auth(req);
    const body = await readJson(req, Body);
    const template = await deps.prompt('extract-job');

    const call = async (fn: () => Promise<unknown>) => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof ApiError) throw e;
        throw new ApiError(502, 'upstream_failed');
      }
    };
    const fromText = (text: string) => {
      const content = renderPrompt(template, { text });
      return call(() => deps.llm.json([{ role: 'system', content }]));
    };

    let raw: unknown;
    if (body.kind === 'text') {
      raw = await fromText(body.text);
    } else if (body.kind === 'url') {
      assertFetchableUrl(body.url);
      let text: string;
      try {
        text = htmlToText(await deps.fetchPage(body.url));
      } catch {
        throw new ApiError(422, 'url_unreadable');
      }
      if (text.length < MIN_TEXT) throw new ApiError(422, 'url_unreadable');
      raw = await fromText(text);
    } else {
      if (!body.path.startsWith(`${userId}/`)) throw new ApiError(403, 'forbidden');
      const bytes = await deps.storage.download('job-files', body.path);
      if (body.mime === 'application/pdf') {
        const text = (await deps.pdfToText(bytes)).trim();
        if (text.length < MIN_TEXT) throw new ApiError(422, 'job_unreadable');
        raw = await fromText(text);
      } else {
        const image = { base64: Buffer.from(bytes).toString('base64'), mime: body.mime };
        const instruction = renderPrompt(template, { text: IMAGE_NOTE });
        raw = await call(() => deps.llm.vision(image, instruction));
      }
    }

    const parsed = Extracted.safeParse(raw);
    if (!parsed.success) throw new ApiError(502, 'upstream_failed');
    const { isTechRole, ...jobSummary } = parsed.data;
    if (!isTechRole) throw new ApiError(422, 'not_tech_role');
    return json(200, jobSummary);
  });
}

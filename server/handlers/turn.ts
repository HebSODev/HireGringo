import { z } from 'zod';
import { HARD_LIMIT_SECONDS, INTERVIEW_SECONDS, MAX_TURN_TEXT_CHARS } from '../../shared/constants';
import type { TurnStreamEvent } from '../../shared/types';
import type { Deps } from '../deps';
import { ApiError, withErrors } from '../errors';
import { readJson } from '../http';
import { buildInterviewerMessages, END_MARKER } from '../interviewer';
import { TurnMetricsSchema } from '../schemas';
import { createSentenceChunker } from '../sentenceChunker';

/** O entrevistador fala no máximo isso por turno; o resto do stream do LLM é descartado. */
const MAX_SENTENCES = 4;
/** [END] só encerra a entrevista no último minuto, para o modelo não encerrar cedo demais. */
const END_ALLOWED_FROM_SEC = INTERVIEW_SECONDS - 60;

const Body = z.object({
  interviewId: z.string().min(1),
  text: z.string().max(MAX_TURN_TEXT_CHARS).nullable(),
  metrics: TurnMetricsSchema.nullable(),
});

/** Começa a consumir o iterável já, guardando os chunks até alguém ler (TTS das próximas frases em paralelo). */
function prefetch<T>(source: AsyncIterable<T>): AsyncIterable<T> {
  const buf: T[] = [];
  let done = false;
  let error: unknown = null;
  const signal: { wake: (() => void) | null } = { wake: null };
  void (async () => {
    try {
      for await (const item of source) { buf.push(item); signal.wake?.(); }
    } catch (e) {
      error = e ?? new Error('tts');
    } finally {
      done = true;
      signal.wake?.();
    }
  })();
  return {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (buf.length) { yield buf.shift()!; continue; }
        if (error) throw error;
        if (done) return;
        await new Promise<void>((r) => { signal.wake = r; });
        signal.wake = null;
      }
    },
  };
}

export function createTurnHandler(deps: Deps) {
  return withErrors(async (req) => {
    const { userId } = await deps.auth(req);
    const body = await readJson(req, Body);
    const interview = await deps.repo.getInterview(userId, body.interviewId);
    if (!interview) throw new ApiError(404, 'not_found');
    if (interview.status !== 'in_progress') throw new ApiError(409, 'interview_not_active');
    const elapsedSec = (deps.now().getTime() - interview.startedAt.getTime()) / 1000;
    if (elapsedSec > HARD_LIMIT_SECONDS) throw new ApiError(409, 'time_over');

    const turns = await deps.repo.listTurns(interview.id);
    if (body.text === null && turns.length > 0) throw new ApiError(400, 'bad_request');
    if (body.text !== null) {
      const candidate = { seq: turns.length, role: 'candidate' as const, text: body.text, metrics: body.metrics };
      await deps.repo.addTurn(interview.id, candidate);
      turns.push(candidate);
    }

    const messages = buildInterviewerMessages({ template: await deps.prompt('interviewer'), interview, turns, elapsedSec });
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (e: TurnStreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
        const spoken: string[] = [];
        const queue: { text: string; audio: AsyncIterable<Uint8Array> }[] = [];
        let ended = false;
        let sentences = 0;
        let seq = 0;

        const enqueue = (raw: string) => {
          if (sentences >= MAX_SENTENCES) return;
          if (raw.includes(END_MARKER) && elapsedSec >= END_ALLOWED_FROM_SEC) ended = true;
          const text = raw.replaceAll(END_MARKER, '').trim();
          if (!text) return;
          sentences++;
          queue.push({ text, audio: prefetch(deps.tts.synthesize(text)) });
        };

        const drain = async () => {
          while (queue.length) {
            const { text, audio } = queue.shift()!;
            emit({ type: 'text', text });
            let carry: Uint8Array | null = null;
            for await (const chunk of audio) {
              const bytes: Uint8Array = carry ? Buffer.concat([carry, chunk]) : chunk;
              const even = bytes.byteLength - (bytes.byteLength % 2);
              carry = even < bytes.byteLength ? bytes.slice(even) : null;
              if (even) emit({ type: 'audio', seq: seq++, data: Buffer.from(bytes.subarray(0, even)).toString('base64') });
            }
            spoken.push(text);
          }
        };

        try {
          const chunker = createSentenceChunker();
          for await (const delta of deps.llm.stream(messages)) {
            chunker.push(delta).forEach(enqueue);
            await drain();
            if (sentences >= MAX_SENTENCES) break;
          }
          chunker.flush().forEach(enqueue);
          await drain();
          if (ended) emit({ type: 'end' });
        } catch (e) {
          console.error(e);
          emit({ type: 'error', code: 'upstream_failed' });
        } finally {
          if (spoken.length) {
            await deps.repo.addTurn(interview.id, { seq: turns.length, role: 'interviewer', text: spoken.join(' '), metrics: null })
              .catch((e) => console.error(e));
          }
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
  });
}

import { describe, expect, it, vi } from 'vitest';
import { createTurnHandler } from '../../server/handlers/turn';
import { makeDeps, NOW, post } from '../helpers/fakes';
import { b64, fromArray, pcm, readNdjson } from '../helpers/stream';

const metrics = { wordCount: 3, durationSec: 1, wpm: 180, fillerCount: 0, lowConfidenceWords: [], longPauseCount: 0, responseLatencySec: 1, silent: false };

function setup(deltas = ['Hello there. ', 'Tell me about', ' yourself. [END]']) {
  const deps = makeDeps();
  deps.llm.stream = vi.fn(() => fromArray(deltas));
  deps.tts.synthesize = vi.fn((text: string) => fromArray([pcm(text)]));
  const interview = deps.repo.seed();
  return { deps, interview, handler: createTurnHandler(deps) };
}

describe('POST /api/interviews/turn', () => {
  it('transmite texto e áudio frase a frase e encerra com [END]', async () => {
    const { deps, interview, handler } = setup();
    deps.now = () => new Date(NOW.getTime() + 280_000);
    const res = await handler(post({ interviewId: interview.id, text: null, metrics: null }));
    expect(res.headers.get('content-type')).toBe('application/x-ndjson');
    expect(await readNdjson(res)).toEqual([
      { type: 'text', text: 'Hello there.' }, { type: 'audio', seq: 0, data: b64(pcm('Hello there.')) },
      { type: 'text', text: 'Tell me about yourself.' }, { type: 'audio', seq: 1, data: b64(pcm('Tell me about yourself.')) },
      { type: 'end' },
    ]);
    expect(deps.repo.turns.get(interview.id)!.at(-1)).toMatchObject({ role: 'interviewer', seq: 0, text: 'Hello there. Tell me about yourself.' });
  });

  it('salva o turno do candidato antes de chamar o LLM', async () => {
    const { deps, interview, handler } = setup(['Good. ']);
    deps.repo.turns.set(interview.id, [{ seq: 0, role: 'interviewer', text: 'Tell me about yourself.', metrics: null }]);
    let turnsSeenByLlm = 0;
    deps.llm.stream = vi.fn(() => {
      turnsSeenByLlm = deps.repo.turns.get(interview.id)!.length;
      return fromArray(['Good, thanks. ']);
    });
    const res = await handler(post({ interviewId: interview.id, text: 'I am a backend dev.', metrics }));
    await readNdjson(res);
    expect(turnsSeenByLlm).toBe(2);
    expect(deps.repo.turns.get(interview.id)).toEqual([
      { seq: 0, role: 'interviewer', text: 'Tell me about yourself.', metrics: null },
      { seq: 1, role: 'candidate', text: 'I am a backend dev.', metrics },
      { seq: 2, role: 'interviewer', text: 'Good, thanks.', metrics: null },
    ]);
  });

  it('mantém a ordem do áudio quando o TTS da 1ª frase demora', async () => {
    const { interview, handler, deps } = setup(['First sentence here. ', 'Second sentence here. ']);
    deps.tts.synthesize = vi.fn(async function* (text: string) {
      if (text.startsWith('First')) await new Promise((r) => setTimeout(r, 30));
      yield pcm(text);
    });
    const events = await readNdjson(await handler(post({ interviewId: interview.id, text: null, metrics: null })));
    expect(events.filter((e) => e.type === 'text').map((e) => e.text)).toEqual(['First sentence here.', 'Second sentence here.']);
    expect(events.filter((e) => e.type === 'audio').map((e) => e.data)).toEqual([b64(pcm('First sentence here.')), b64(pcm('Second sentence here.'))]);
    expect(deps.tts.synthesize).toHaveBeenCalledTimes(2);
  });

  it('emite áudio sempre com número par de bytes (PCM 16-bit)', async () => {
    const { interview, handler, deps } = setup(['Hello there friend. ']);
    deps.tts.synthesize = vi.fn(() => fromArray([new Uint8Array([1, 2, 3]), new Uint8Array([4]), new Uint8Array([5, 6])]));
    const events = await readNdjson(await handler(post({ interviewId: interview.id, text: null, metrics: null })));
    expect(events.filter((e) => e.type === 'audio')).toEqual([
      { type: 'audio', seq: 0, data: b64(new Uint8Array([1, 2])) },
      { type: 'audio', seq: 1, data: b64(new Uint8Array([3, 4])) },
      { type: 'audio', seq: 2, data: b64(new Uint8Array([5, 6])) },
    ]);
  });

  it('409 time_over depois de 360 s', async () => {
    const { interview, handler, deps } = setup();
    deps.now = () => new Date(NOW.getTime() + 361_000);
    const res = await handler(post({ interviewId: interview.id, text: null, metrics: null }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'time_over' });
  });

  it('404 para entrevista de outro usuário', async () => {
    const { deps, handler } = setup();
    const other = deps.repo.seed({ userId: 'someone-else' });
    const res = await handler(post({ interviewId: other.id, text: null, metrics: null }));
    expect(res.status).toBe(404);
  });

  it('409 para entrevista concluída', async () => {
    const { deps, handler } = setup();
    const done = deps.repo.seed({ status: 'completed' });
    const res = await handler(post({ interviewId: done.id, text: null, metrics: null }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'interview_not_active' });
  });

  it('400 para abertura repetida', async () => {
    const { deps, interview, handler } = setup();
    deps.repo.turns.set(interview.id, [{ seq: 0, role: 'interviewer', text: 'Hi.', metrics: null }]);
    const res = await handler(post({ interviewId: interview.id, text: null, metrics: null }));
    expect(res.status).toBe(400);
  });

  it('falha do TTS emite evento de erro', async () => {
    const { interview, handler, deps } = setup(['Hello there friend. ']);
    deps.tts.synthesize = vi.fn(async function* () { throw new Error('boom'); });
    const events = await readNdjson(await handler(post({ interviewId: interview.id, text: null, metrics: null })));
    expect(events.at(-1)).toEqual({ type: 'error', code: 'upstream_failed' });
  });

  it('ignora [END] antes do último minuto', async () => {
    const { interview, handler, deps } = setup(['Thanks for your time today. [END]']);
    deps.now = () => new Date(NOW.getTime() + 100_000);
    const events = await readNdjson(await handler(post({ interviewId: interview.id, text: null, metrics: null })));
    expect(events.some((e) => e.type === 'end')).toBe(false);
    expect(events[0]).toEqual({ type: 'text', text: 'Thanks for your time today.' });
  });

  it('aceita [END] no último minuto', async () => {
    const { interview, handler, deps } = setup(['Thanks for your time today. [END]']);
    deps.now = () => new Date(NOW.getTime() + 245_000);
    const events = await readNdjson(await handler(post({ interviewId: interview.id, text: null, metrics: null })));
    expect(events.at(-1)).toEqual({ type: 'end' });
  });

  it('corta a fala do entrevistador em 4 frases', async () => {
    const { interview, handler, deps } = setup(['One sentence here. Two sentence here. Three sentence here. ', 'Four sentence here. Five sentence here. Six sentence here.']);
    const events = await readNdjson(await handler(post({ interviewId: interview.id, text: null, metrics: null })));
    expect(events.filter((e) => e.type === 'text').map((e) => e.text)).toEqual(
      ['One sentence here.', 'Two sentence here.', 'Three sentence here.', 'Four sentence here.'],
    );
    expect(deps.repo.turns.get(interview.id)!.at(-1)!.text).toBe('One sentence here. Two sentence here. Three sentence here. Four sentence here.');
  });
});

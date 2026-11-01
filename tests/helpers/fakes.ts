import type { Deps, Llm, Storage, Tts } from '../../server/deps';
import type { Repo } from '../../server/repo';
import type { Evaluation, Interview, JobSummary, ResumeSummary, Turn } from '../../shared/types';

export const USER = 'user-1';
export const NOW = new Date('2026-10-31T12:00:00Z');

export const job: JobSummary = {
  title: 'Senior Backend Engineer', company: 'Acme', seniority: 'Senior',
  requirements: ['Node.js', 'PostgreSQL', 'automated testing'], stack: ['Node.js', 'AWS'], responsibilities: ['Build APIs'],
};
export const resume: ResumeSummary = {
  name: 'Ana', headline: 'Backend developer', skills: ['Node.js'],
  experiences: [{ company: 'Foo', role: 'Dev', highlights: ['Led a migration'] }],
};

export class MemoryRepo implements Repo {
  interviews = new Map<string, Interview>();
  turns = new Map<string, Turn[]>();
  evaluations = new Map<string, Evaluation>();
  freeUsed = new Map<string, number>();
  unfinishedLast24h = 0;
  abandonStaleCalls: Date[] = [];
  private nextId = 1;

  async getFreeUsed(userId: string) { return this.freeUsed.get(userId) ?? 0; }
  async abandonStale(_userId: string, olderThan: Date) { this.abandonStaleCalls.push(olderThan); }
  async countUnfinishedSince() { return this.unfinishedLast24h; }
  async createInterview(userId: string, input: { job: JobSummary; resume: ResumeSummary; resumePath: string; startedAt: Date }) {
    const iv: Interview = { id: `iv-${this.nextId++}`, userId, status: 'in_progress', ...input };
    this.interviews.set(iv.id, iv);
    return iv;
  }
  async getInterview(userId: string, id: string) {
    const iv = this.interviews.get(id);
    return iv && iv.userId === userId ? iv : null;
  }
  async listTurns(interviewId: string) { return [...(this.turns.get(interviewId) ?? [])]; }
  async addTurn(interviewId: string, turn: Turn) {
    this.turns.set(interviewId, [...(this.turns.get(interviewId) ?? []), turn]);
  }
  async abandonInterview(id: string) { this.interviews.get(id)!.status = 'abandoned'; }
  async completeInterview(id: string, evaluation: Evaluation) {
    if (this.evaluations.has(id)) return;
    this.evaluations.set(id, evaluation);
    const iv = this.interviews.get(id)!;
    iv.status = 'completed';
    this.freeUsed.set(iv.userId, (this.freeUsed.get(iv.userId) ?? 0) + 1);
  }
  async getEvaluation(id: string) { return this.evaluations.get(id) ?? null; }

  seed(partial: Partial<Interview> = {}): Interview {
    const iv: Interview = {
      id: `iv-${this.nextId++}`, userId: USER, status: 'in_progress', job, resume,
      resumePath: `${USER}/cv.pdf`, startedAt: NOW, ...partial,
    };
    this.interviews.set(iv.id, iv);
    return iv;
  }
}

const unused = (name: string) => () => { throw new Error(`${name} não deveria ser chamado`); };

export function makeDeps(overrides: Partial<Deps> = {}): Deps & { repo: MemoryRepo } {
  const llm: Llm = { stream: unused('llm.stream') as never, json: unused('llm.json') as never, vision: unused('llm.vision') as never };
  const tts: Tts = { synthesize: unused('tts.synthesize') as never };
  const storage: Storage = { download: unused('storage.download') as never, removePrefix: unused('storage.removePrefix') as never };
  return {
    auth: async (req) => {
      if (req.headers.get('authorization') !== 'Bearer ok') {
        const { ApiError } = await import('../../server/errors');
        throw new ApiError(401, 'unauthorized');
      }
      return { userId: USER };
    },
    repo: new MemoryRepo(),
    llm, tts, storage,
    deepgram: { grant: unused('deepgram.grant') as never },
    fetchPage: unused('fetchPage') as never,
    prompt: async (name) => `PROMPT:${name} {{job}} {{resume}} {{remainingSeconds}} {{phase}} {{transcript}} {{speechStats}} {{text}}`,
    now: () => NOW,
    ...overrides,
  } as Deps & { repo: MemoryRepo };
}

export function post(body: unknown, auth = true): Request {
  return new Request('http://test/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ok' } : {}) },
    body: JSON.stringify(body),
  });
}

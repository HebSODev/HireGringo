import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = process.env.SUPABASE_IT === '1';
const url = process.env.SUPABASE_URL!;
const secret = process.env.SUPABASE_SECRET_KEY!;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;

const job = { title: 'Senior Engineer', company: null, seniority: null, requirements: [], stack: [], responsibilities: [] };
const resume = { name: null, headline: 'Dev', skills: [], experiences: [] };
const evaluation = {
  technical: { score: 7, justification: 'ok' },
  english: { score: 6, justification: 'ok' },
  tips: { technical: ['x'], english: [{ said: 'a', better: 'b', why: 'c' }] },
};

describe.skipIf(!run)('RLS e cota no Supabase', { timeout: 30_000 }, () => {
  let admin: SupabaseClient;
  const users: { id: string; client: SupabaseClient }[] = [];

  async function makeUser(tag: string) {
    const email = `it-${tag}-${Date.now()}@hiregringo.test`;
    const password = `Pw-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { consent_at: new Date().toISOString() },
    });
    if (error) throw error;
    const client = createClient(url, publishable, { auth: { persistSession: false } });
    const { error: e2 } = await client.auth.signInWithPassword({ email, password });
    if (e2) throw e2;
    users.push({ id: data.user.id, client });
    return { id: data.user.id, client };
  }

  async function makeInterview(userId: string, status = 'in_progress') {
    const { data, error } = await admin.from('interviews')
      .insert({ user_id: userId, status, job, resume, resume_path: `${userId}/cv.pdf`, started_at: new Date().toISOString() })
      .select('id').single();
    if (error) throw error;
    return data.id as string;
  }

  beforeAll(() => { admin = createClient(url, secret, { auth: { persistSession: false } }); });
  afterAll(async () => { for (const u of users) await admin.auth.admin.deleteUser(u.id); });

  it('usuário A não lê a entrevista de B', async () => {
    const a = await makeUser('a');
    const b = await makeUser('b');
    const id = await makeInterview(b.id);
    const { data } = await a.client.from('interviews').select('id').eq('id', id);
    expect(data).toEqual([]);
  });

  it('usuário não altera free_interviews_used', async () => {
    const a = await makeUser('c');
    await a.client.from('profiles').update({ free_interviews_used: -10 }).eq('id', a.id);
    const { data } = await admin.from('profiles').select('free_interviews_used').eq('id', a.id).single();
    expect(data!.free_interviews_used).toBe(0);
  });

  it('usuário não apaga entrevista in_progress', async () => {
    const a = await makeUser('d');
    const id = await makeInterview(a.id);
    await a.client.from('interviews').delete().eq('id', id);
    const { data } = await admin.from('interviews').select('id').eq('id', id);
    expect(data).toHaveLength(1);
  });

  it('complete_interview duas vezes incrementa a cota uma vez, e apagar não devolve a cota', async () => {
    const a = await makeUser('e');
    const id = await makeInterview(a.id);
    await admin.rpc('complete_interview', { p_interview_id: id, p_evaluation: evaluation });
    await admin.rpc('complete_interview', { p_interview_id: id, p_evaluation: evaluation });
    const read = async () => (await admin.from('profiles').select('free_interviews_used').eq('id', a.id).single()).data!.free_interviews_used;
    expect(await read()).toBe(1);
    const { error } = await a.client.from('interviews').delete().eq('id', id);
    expect(error).toBeNull();
    expect((await admin.from('interviews').select('id').eq('id', id)).data).toEqual([]);
    expect(await read()).toBe(1);
  });

  it('inícios em paralelo não passam da cota grátis', async () => {
    const a = await makeUser('f');
    await admin.from('profiles').update({ free_interviews_used: 2 }).eq('id', a.id);
    const now = new Date();
    const call = () => admin.rpc('start_interview', {
      p_user: a.id, p_job: job, p_resume: resume, p_resume_path: `${a.id}/cv.pdf`,
      p_started_at: now.toISOString(), p_stale_before: new Date(now.getTime() - 600_000).toISOString(),
      p_unfinished_since: new Date(now.getTime() - 86_400_000).toISOString(), p_free_limit: 3, p_unfinished_limit: 3,
    });
    const results = await Promise.all([call(), call(), call(), call()]);
    expect(results.map((r) => r.data.ok).filter(Boolean)).toHaveLength(1);
  });

  it('usuário não chama start_interview nem complete_interview direto', async () => {
    const a = await makeUser('g');
    const r1 = await a.client.rpc('start_interview', {
      p_user: a.id, p_job: job, p_resume: resume, p_resume_path: 'x', p_started_at: new Date().toISOString(),
      p_stale_before: new Date().toISOString(), p_unfinished_since: new Date().toISOString(), p_free_limit: 99, p_unfinished_limit: 99,
    });
    expect(r1.error).not.toBeNull();
    const r2 = await a.client.rpc('complete_interview', { p_interview_id: crypto.randomUUID(), p_evaluation: evaluation });
    expect(r2.error).not.toBeNull();
  });
});

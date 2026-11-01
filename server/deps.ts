import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAuth, type AuthFn } from './auth.js';
import { deepgramGrant } from './deepgram.js';
import { openAiCompatibleLlm } from './llm.js';
import { loadPrompt } from './prompts.js';
import { supabaseRepo, type Repo } from './repo.js';
import { supabaseStorage } from './storage.js';
import { deepgramTts } from './tts.js';
import { fetchPage } from './extract/url.js';
import { pdfToText } from './extract/pdf.js';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface Llm {
  stream(messages: ChatMessage[]): AsyncIterable<string>;
  json(messages: ChatMessage[]): Promise<unknown>;
  vision(image: { base64: string; mime: string }, instruction: string): Promise<unknown>;
}

export interface Tts {
  /** Chunks de PCM 16-bit LE mono a TTS_SAMPLE_RATE Hz, na ordem. */
  synthesize(text: string): AsyncIterable<Uint8Array>;
}

export type Bucket = 'resumes' | 'job-files';

export interface Storage {
  download(bucket: Bucket, path: string): Promise<Uint8Array>;
  removePrefix(bucket: Bucket, prefix: string): Promise<void>;
}

export type Deps = {
  auth: AuthFn;
  repo: Repo;
  llm: Llm;
  tts: Tts;
  storage: Storage;
  deepgram: { grant(ttlSeconds: number): Promise<{ token: string; expiresIn: number }> };
  fetchPage: (url: string) => Promise<string>;
  pdfToText: (bytes: Uint8Array) => Promise<string>;
  prompt: typeof loadPrompt;
  now: () => Date;
};

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`variável de ambiente ausente: ${name}`);
  return v;
}

let admin: SupabaseClient | null = null;

/** Client com a secret key (ignora RLS): só no servidor. */
export function supabaseAdmin(): SupabaseClient {
  return (admin ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), { auth: { persistSession: false } }));
}

let cached: Deps | null = null;

export function realDeps(): Deps {
  if (cached) return cached;
  const db = supabaseAdmin();
  cached = {
    auth: supabaseAuth(db),
    repo: supabaseRepo(db),
    llm: openAiCompatibleLlm({
      baseURL: env('LLM_BASE_URL'), apiKey: env('LLM_API_KEY'), model: env('LLM_MODEL'),
      visionModel: process.env.VISION_MODEL || undefined,
    }),
    tts: deepgramTts({ apiKey: env('DEEPGRAM_API_KEY'), model: env('TTS_MODEL') }),
    storage: supabaseStorage(db),
    deepgram: { grant: deepgramGrant(env('DEEPGRAM_API_KEY')) },
    fetchPage,
    pdfToText,
    prompt: loadPrompt,
    now: () => new Date(),
  };
  return cached;
}

/** Monta o handler com as dependências reais só na 1ª requisição (env ausente não derruba o import). */
export function lazy(create: (deps: Deps) => (req: Request) => Promise<Response>) {
  let handler: ((req: Request) => Promise<Response>) | null = null;
  return (req: Request) => (handler ??= create(realDeps()))(req);
}

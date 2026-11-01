# HireGringo MVP — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plataforma web em que um profissional de tecnologia sobe o currículo e a vaga, faz uma entrevista de voz de 5 min em inglês com um entrevistador de IA exigente e recebe nota técnica e de inglês (0–10) com dicas concretas.

**Architecture:** Um único projeto Vercel. O frontend React (Vite) fica na raiz e as funções serverless Node/TypeScript em `api/`. As funções são cascas finas sobre handlers testáveis em `server/`, que recebem as dependências (repo, LLM, TTS, storage) por injeção. O navegador transcreve a fala direto no Deepgram (com chave temporária). Cada turno vira um POST que devolve NDJSON em streaming, com texto e áudio MP3 frase a frase. O Supabase cuida de Postgres, Auth e Storage.

**Tech Stack:** TypeScript, React 18 + Vite + react-router + Tailwind, funções Node na Vercel (assinatura Web `export async function POST(req: Request)`), Supabase (`@supabase/supabase-js`), `openai` SDK apontado para Groq (API compatível com OpenAI), Deepgram (STT WebSocket + Aura TTS REST), `unpdf`, `zod`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-hiregringo-design.md`

**Sem git:** o usuário pediu para manter tudo local, sem repositório por enquanto. Este plano não tem passos de commit. Ao fim de cada task, o checkpoint é a suíte verde (`npx vitest run` e `npx tsc --noEmit`).

## Global Constraints

- Somente vagas de tecnologia/software. Vaga de outra área é recusada com `not_tech_role`.
- Entrevista de **5 minutos** (`INTERVIEW_SECONDS = 300`). Limite duro no backend: `HARD_LIMIT_SECONDS = 360`.
- Encerramento antecipado: com **≥ 120 s** gera resultado e conta na cota; abaixo disso não gera resultado nem conta (`MIN_SECONDS_FOR_RESULT = 120`).
- Cota: **3 entrevistas grátis por usuário** (`FREE_LIMIT = 3`), contadas só quando geram resultado. No máximo **3 entrevistas inacabadas por usuário em 24 h** (`UNFINISHED_DAILY_LIMIT = 3`, janela móvel de 24 h, decisão do plano).
- Notas inteiras de 0 a 10: `technical` e `english`.
- Interface em **português**. Entrevista, justificativas e dicas em **inglês**.
- Chaves de Deepgram/LLM/TTS e a service role do Supabase **só no servidor**. O navegador recebe apenas o token temporário do Deepgram.
- O áudio **nunca é guardado**: só transcrição, métricas e resultado.
- Persona, tom, roteiro e critérios ficam em `prompts/*.md`. Nenhuma frase de comportamento do entrevistador ou do avaliador fica hardcoded em `.ts`.
- Cada um fala na sua vez: o microfone pausa enquanto o entrevistador fala.
- Navegadores-alvo: desktop (Chrome, Edge, Firefox, Safari no Mac).
- Arquivos enviados: máximo de 5 MB. Currículo só em PDF. Vaga em PDF, PNG, JPEG ou WebP.

## Review Focus

1. **Microfone negado ou ausente** → mensagem clara em português, e **nenhuma entrevista é criada** (não pode virar "inacabada"). Teste na Task 10 (`MIC_DENIED` antes de `start`).
2. **Currículo em PDF escaneado (só imagem)** → `422 resume_unreadable` com pedido de PDF com texto selecionável, em vez de uma entrevista com currículo vazio. Teste na Task 5.
3. **Usuário apaga entrevista concluída para recuperar cota** → a cota vem de `profiles.free_interviews_used`, que nunca diminui ao apagar. Testes nas Tasks 2 e 7.
4. **LLM devolve JSON inválido ou nota fora de 0–10 na avaliação** → uma nova tentativa; se falhar de novo, `502 evaluation_failed`, a entrevista continua `in_progress`, a cota não é consumida e o cliente pode tentar `finish` de novo. Teste na Task 7.
5. **Aba fechada ou recarregada no meio da entrevista** → a entrevista fica `in_progress` e, no próximo `start`, é marcada `abandoned` após 10 min. Ela conta como inacabada, não como cota. Teste na Task 3.

---

## Estrutura de arquivos

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, vercel.json, index.html, .env.example
prompts/        interviewer.md, evaluator.md, extract-job.md, extract-resume.md
supabase/migrations/0001_init.sql
shared/         types.ts, constants.ts, speechMetrics.ts
server/         errors.ts, auth.ts, prompts.ts, llm.ts, tts.ts, deepgram.ts, storage.ts, repo.ts, deps.ts,
                quota.ts, interviewPhase.ts, sentenceChunker.ts,
                handlers/start.ts, handlers/deepgramToken.ts, handlers/turn.ts, handlers/finish.ts,
                handlers/extractResume.ts, handlers/extractJob.ts, handlers/deleteAccount.ts,
                extract/pdf.ts, extract/html.ts, extract/url.ts, interviewer.ts, evaluator.ts
api/            interviews/start.ts, interviews/turn.ts, interviews/finish.ts, deepgram-token.ts,
                extract/resume.ts, extract/job.ts, account/delete.ts
src/            main.tsx, App.tsx, lib/{supabase,api,ndjson,audioQueue,deepgramClient,roomReducer,micRecorder}.ts,
                pages/{AuthPage,HomePage,NewInterviewPage,InterviewRoomPage,ResultPage,AccountPage}.tsx
tests/          espelha server/, shared/, src/lib/
```

Cada arquivo em `api/` tem uma linha de lógica: `export const POST = createXHandler(realDeps());`.

---

### Task 1: Scaffold + spike de latência (portão de decisão)

O objetivo é medir, antes de construir o resto, se Node na Vercel entrega a primeira frase falada em ~1 s.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `vercel.json`, `index.html`, `src/main.tsx`, `.env.example`
- Create (descartável): `api/spike.ts`, `scripts/spike-latency.ts`

**Interfaces:**
- Produces: projeto Vite React TS + Tailwind; `vercel.json` com `functions` (`api/interviews/turn.ts` e `api/interviews/finish.ts`: `maxDuration: 60`; `api/extract/*.ts`: `maxDuration: 30`; todos com `includeFiles: "prompts/**"`); `.env.example` com `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (formato novo `sb_secret_…`, substitui a service role), `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `LLM_BASE_URL=https://api.groq.com/openai/v1`, `LLM_API_KEY`, `LLM_MODEL=openai/gpt-oss-120b`, `VISION_MODEL`, `DEEPGRAM_API_KEY`, `TTS_MODEL=aura-2-thalia-en`, `DEEPGRAM_STT_MODEL=nova-3`.

- [ ] **Step 1: Confirmar as APIs dos provedores na documentação atual (via context7/WebSearch) e anotar no topo de `scripts/spike-latency.ts`:**
  - endpoint de token temporário do Deepgram (esperado `POST https://api.deepgram.com/v1/auth/grant`, `{ ttl_seconds }`, retorno `{ access_token, expires_in }`) e como o navegador o usa no WebSocket (esperado subprotocol `["bearer", token]`);
  - Aura REST (esperado `POST https://api.deepgram.com/v1/speak?model=<TTS_MODEL>&encoding=mp3`, body `{ text }`) e o nome de uma voz Aura em inglês;
  - se `filler_words=true` funciona com `nova-3` (senão, `DEEPGRAM_STT_MODEL=nova-2`);
  - IDs atuais de modelo de texto e de visão na Groq.
- [ ] **Step 2: Scaffold** com Vite (`react-ts`), Tailwind, Vitest e `tsc --noEmit` cobrindo `src/`, `server/`, `shared/` e `api/`.
- [ ] **Step 3: Criar `api/spike.ts`:** um POST sem auth que recebe `{ prompt }`, faz stream do LLM, corta em frases (corte ingênuo em `. `), sintetiza cada frase no Aura e escreve NDJSON `{"t":"audio","ms":<desde o início>,"bytes":n}`.
- [ ] **Step 4: Criar `scripts/spike-latency.ts`:** chama a URL publicada 1 vez após 10 min ocioso (cold) e 5 vezes em sequência (warm) e imprime o tempo até o primeiro evento `audio` e até o fim.
- [ ] **Step 5: Publicar e medir.** O usuário precisa ter feito `vercel login`/`vercel link` e cadastrado as envs. Se não estiver feito, pare e peça. Rode `npx vercel deploy` (deploy de **preview**, protegido pela Deployment Protection da Vercel, não é publicação) e depois `npx tsx scripts/spike-latency.ts <url>`.
  Esperado: primeiro áudio warm com p50 ≤ 1200 ms.
- [ ] **Step 6: Portão.** Reporte ao usuário os números de cold e warm. Se o warm p50 passar de 1500 ms, **pare e pergunte** antes de seguir. Se passar, apague `api/spike.ts` e `scripts/spike-latency.ts`.

---

### Task 2: Schema do Supabase, tipos compartilhados e constantes

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `shared/types.ts`, `shared/constants.ts`
- Test: `tests/db/rls.integration.test.ts` (roda só com `SUPABASE_IT=1`)

**Interfaces:**
- Produces (SQL):
  - `profiles(id uuid pk references auth.users on delete cascade, consent_at timestamptz not null, free_interviews_used int not null default 0, created_at)`. Um trigger em `auth.users` insere o profile lendo `raw_user_meta_data->>'consent_at'`.
  - `interviews(id uuid pk, user_id uuid references auth.users on delete cascade, status text check in ('in_progress','completed','abandoned'), job jsonb, resume jsonb, resume_path text, started_at timestamptz, ended_at timestamptz null, created_at)`.
  - `turns(id bigserial, interview_id uuid references interviews on delete cascade, seq int, role text check in ('interviewer','candidate'), text text, metrics jsonb null, created_at, unique(interview_id, seq))`.
  - `results(interview_id uuid pk references interviews on delete cascade, technical_score int check 0..10, english_score int check 0..10, evaluation jsonb, created_at)`.
  - Função `complete_interview(p_interview_id uuid, p_evaluation jsonb) returns void` (security definer, só para a service role). Numa transação: insere `results` com `on conflict do nothing`; se inseriu, faz `status='completed'`, `ended_at=now()` e `free_interviews_used += 1` no profile do dono.
  - RLS: o usuário dá SELECT nas próprias linhas de `profiles`, `interviews`, `turns` e `results`. DELETE em `interviews` só com `status='completed'`. Nenhum INSERT/UPDATE pelo cliente (só a service role).
  - Buckets privados `resumes` e `job-files`, com `file_size_limit = 5MB` e políticas de INSERT/SELECT/DELETE restritas a objetos cujo primeiro segmento do caminho é `auth.uid()`.
- Produces (TS, `shared/types.ts`):
  ```ts
  export type JobSummary = { title: string; company: string | null; seniority: string | null; requirements: string[]; stack: string[]; responsibilities: string[] };
  export type ResumeSummary = { name: string | null; headline: string; skills: string[]; experiences: { company: string; role: string; highlights: string[] }[] };
  export type DgWord = { word: string; punctuated_word?: string; start: number; end: number; confidence: number };
  export type TurnMetrics = { wordCount: number; durationSec: number; wpm: number; fillerCount: number; lowConfidenceWords: string[]; longPauseCount: number; responseLatencySec: number | null; silent: boolean };
  export type InterviewStatus = 'in_progress' | 'completed' | 'abandoned';
  export type Turn = { seq: number; role: 'interviewer' | 'candidate'; text: string; metrics: TurnMetrics | null };
  export type Interview = { id: string; userId: string; status: InterviewStatus; job: JobSummary; resume: ResumeSummary; resumePath: string; startedAt: Date };
  export type Evaluation = { technical: { score: number; justification: string }; english: { score: number; justification: string }; tips: { technical: string[]; english: { said: string; better: string; why: string }[] } };
  export type TurnStreamEvent = { type: 'text'; text: string } | { type: 'audio'; seq: number; data: string } | { type: 'end' } | { type: 'error'; code: ApiErrorCode };
  export type ApiErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'bad_request' | 'quota_exhausted' | 'too_many_unfinished' | 'interview_not_active' | 'time_over' | 'resume_unreadable' | 'not_tech_role' | 'url_unreadable' | 'evaluation_failed' | 'upstream_failed';
  ```
- Produces (`shared/constants.ts`): `INTERVIEW_SECONDS=300`, `HARD_LIMIT_SECONDS=360`, `MIN_SECONDS_FOR_RESULT=120`, `FREE_LIMIT=3`, `UNFINISHED_DAILY_LIMIT=3`, `STALE_AFTER_MINUTES=10`, `MAX_UPLOAD_BYTES=5*1024*1024`, `SILENCE_TIMEOUT_MS=20000`.

- [ ] **Step 1: Escrever o teste de integração** (pulado sem `SUPABASE_IT=1`). Ele cria dois usuários via admin e verifica:
  - o usuário A não lê a entrevista de B;
  - A não consegue `update` em `profiles.free_interviews_used`;
  - A não consegue apagar uma entrevista `in_progress`;
  - `complete_interview` chamada duas vezes incrementa `free_interviews_used` uma única vez;
  - apagar a entrevista concluída **não** diminui `free_interviews_used`.
- [ ] **Step 2: Escrever `0001_init.sql`, `shared/types.ts` e `shared/constants.ts`.**
- [ ] **Step 3: Aplicar a migration** no projeto Supabase do usuário (SQL editor ou `supabase db push`). Pedir ao usuário para **ativar "Confirm email"** em Auth → Providers → Email.
- [ ] **Step 4: Rodar** `SUPABASE_IT=1 npx vitest run tests/db`. Esperado: PASS. Depois rodar `npx tsc --noEmit`. Esperado: sem erros.

---

### Task 3: Núcleo do servidor, cota e início da entrevista

**Files:**
- Create: `server/errors.ts`, `server/auth.ts`, `server/prompts.ts`, `server/repo.ts`, `server/deps.ts`, `server/quota.ts`, `server/deepgram.ts`, `server/handlers/start.ts`, `server/handlers/deepgramToken.ts`, `api/interviews/start.ts`, `api/deepgram-token.ts`
- Test: `tests/server/prompts.test.ts`, `tests/server/quota.test.ts`, `tests/server/start.test.ts`, `tests/server/deepgramToken.test.ts`

**Interfaces:**
- Produces:
  - `class ApiError extends Error { constructor(public status: number, public code: ApiErrorCode) }`
  - `withErrors(h: (req: Request) => Promise<Response>): (req: Request) => Promise<Response>`, que converte `ApiError` em `{ error: code }` com o status dela e qualquer outro erro em 500 `upstream_failed`.
  - `type AuthFn = (req: Request) => Promise<{ userId: string }>`. A implementação real valida `Authorization: Bearer <jwt>` com `supabase.auth.getUser(jwt)` e lança 401 `unauthorized`.
  - `renderPrompt(template: string, vars: Record<string, string | number>): string`, que substitui `{{name}}` e lança erro se faltar alguma variável. `loadPrompt(name: 'interviewer'|'evaluator'|'extract-job'|'extract-resume'): Promise<string>` lê `prompts/<name>.md` a partir de `process.cwd()`.
  - `decideStart(input: { freeUsed: number; unfinishedLast24h: number }): { ok: true } | { ok: false; code: 'quota_exhausted' | 'too_many_unfinished' }`
  - `interface Repo { getFreeUsed(userId): Promise<number>; abandonStale(userId, olderThan: Date): Promise<void>; countUnfinishedSince(userId, since: Date): Promise<number>; createInterview(userId, input: { job: JobSummary; resume: ResumeSummary; resumePath: string; startedAt: Date }): Promise<Interview>; getInterview(userId, id): Promise<Interview | null>; listTurns(interviewId): Promise<Turn[]>; addTurn(interviewId, turn: Turn): Promise<void>; abandonInterview(id, endedAt: Date): Promise<void>; completeInterview(id, evaluation: Evaluation): Promise<void>; getEvaluation(id): Promise<Evaluation | null> }`. "Unfinished" = status `in_progress` ou `abandoned`. `completeInterview` chama a RPC `complete_interview`.
  - `type Deps = { auth: AuthFn; repo: Repo; llm: Llm; tts: Tts; storage: Storage; deepgram: { grant(ttlSeconds: number): Promise<{ token: string; expiresIn: number }> }; fetchPage: (url: string) => Promise<string>; prompt: typeof loadPrompt; now: () => Date }` e `realDeps(): Deps`. As interfaces `Llm`, `Tts` e `Storage` são definidas nas Tasks 4–6. Até lá, deixe-as declaradas em `server/deps.ts` com as assinaturas abaixo.
  - `createStartHandler(deps)`: `POST { job, resume, resumePath }` → `200 { interviewId, startedAt: string }`
  - `createDeepgramTokenHandler(deps)`: `POST { interviewId }` → `200 { token, expiresIn }`. Exige uma entrevista `in_progress` do usuário (senão 404/409). TTL de 30 s.

- [ ] **Step 1: Escrever os testes**
  ```ts
  // prompts.test.ts
  expect(renderPrompt('Hi {{a}}, {{b}}s', { a: 'Ana', b: 300 })).toBe('Hi Ana, 300s');
  expect(() => renderPrompt('{{missing}}', {})).toThrow(/missing/);
  // quota.test.ts
  expect(decideStart({ freeUsed: 3, unfinishedLast24h: 0 })).toEqual({ ok: false, code: 'quota_exhausted' });
  expect(decideStart({ freeUsed: 0, unfinishedLast24h: 3 })).toEqual({ ok: false, code: 'too_many_unfinished' });
  expect(decideStart({ freeUsed: 2, unfinishedLast24h: 2 })).toEqual({ ok: true });
  ```
  `start.test.ts` (com um repo falso em memória e `now` fixo):
  - `start_abandons_stale_in_progress_before_counting`: `abandonStale` é chamado com `now - 10 min`;
  - `start_rejects_when_quota_exhausted`: 403 `quota_exhausted`, sem criar entrevista;
  - `start_rejects_too_many_unfinished`: 429;
  - `start_rejects_resume_path_of_other_user`: `resumePath: 'other-user/x.pdf'` → 403 `forbidden`;
  - `start_rejects_invalid_body`: job sem `title` → 400 `bad_request` (validação com zod);
  - `start_creates_interview`: 200 com `interviewId`, e `startedAt` igual a `now`.

  `deepgramToken.test.ts`: sem entrevista → 404; entrevista `completed` → 409 `interview_not_active`; ok → chama `grant(30)`.
- [ ] **Step 2: Rodar** `npx vitest run tests/server`. Esperado: FAIL (módulos inexistentes).
- [ ] **Step 3: Implementar os arquivos** listados acima. `repo.ts` usa o client Supabase com a service role.
- [ ] **Step 4: Rodar** `npx vitest run tests/server && npx tsc --noEmit`. Esperado: PASS.

---

### Task 4: Métricas de fala e utilitários do turno (puros)

**Files:**
- Create: `shared/speechMetrics.ts`, `server/sentenceChunker.ts`, `server/interviewPhase.ts`
- Test: `tests/shared/speechMetrics.test.ts`, `tests/server/sentenceChunker.test.ts`, `tests/server/interviewPhase.test.ts`

**Interfaces:**
- Produces:
  - `FILLERS = new Set(['uh','um','mhmm','mm-mm','uh-uh','uh-huh','nuh-uh','hmm','er','ah'])`
  - `computeTurnMetrics(words: DgWord[], opts: { responseLatencySec: number | null }): TurnMetrics`. Regras:
    - `wordCount` não conta fillers;
    - `durationSec` = `last.end - first.start`;
    - `wpm` = `wordCount / (durationSec / 60)`, arredondado a 1 casa, e 0 se a duração for 0;
    - `lowConfidenceWords` = não-fillers com `confidence < 0.6`, usando `punctuated_word` sem pontuação, sem duplicatas;
    - `longPauseCount` = intervalos entre palavras consecutivas maiores que 1.5 s;
    - `silent` = `words.length === 0`.
  - `aggregateMetrics(all: TurnMetrics[]): { avgWpm: number; fillersPerMinute: number; lowConfidenceWords: string[]; avgResponseLatencySec: number | null; silentTurns: number; longPauses: number }`. Limita `lowConfidenceWords` às 20 mais frequentes.
  - `createSentenceChunker(): { push(delta: string): string[]; flush(): string[] }`. Corta em `[.!?]+` seguido de espaço em branco, só quando a frase acumulada tem ≥ 12 caracteres. Retorna as frases com `trim`.
  - `phaseFor(elapsedSec: number): 'opening' | 'behavioral' | 'technical' | 'closing'`. Limites: `<30`, `<120`, `<270` e o resto é `closing`.

- [ ] **Step 1: Escrever os testes**
  ```ts
  const w = (word, start, end, confidence) => ({ word, start, end, confidence });
  const m = computeTurnMetrics([w('i',0,0.2,0.99), w('um',0.3,0.5,0.9), w('worked',2.5,2.9,0.4), w('with',3.0,3.2,0.95), w('react',3.3,3.6,0.97)], { responseLatencySec: 1.2 });
  expect(m).toEqual({ wordCount: 4, durationSec: 3.6, wpm: 66.7, fillerCount: 1, lowConfidenceWords: ['worked'], longPauseCount: 1, responseLatencySec: 1.2, silent: false });
  expect(computeTurnMetrics([], { responseLatencySec: null })).toMatchObject({ silent: true, wordCount: 0, wpm: 0 });

  const c = createSentenceChunker();
  expect(c.push('Hi. I am Alex, the inter')).toEqual([]);
  expect(c.push('viewer. Tell me')).toEqual(['Hi. I am Alex, the interviewer.']);
  expect(c.push(' about Node.js and')).toEqual([]);           // "Node.js" não corta
  expect(c.push(' your work? Sure')).toEqual(['Tell me about Node.js and your work?']);
  expect(c.flush()).toEqual(['Sure']);

  expect([0,29,30,119,120,269,270,400].map(phaseFor)).toEqual(['opening','opening','behavioral','behavioral','technical','technical','closing','closing']);
  ```
  Também: `aggregateMetrics([])` retorna zeros e `avgResponseLatencySec: null`.
- [ ] **Step 2: Rodar** `npx vitest run tests/shared tests/server/sentenceChunker.test.ts tests/server/interviewPhase.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar o mesmo comando.** Esperado: PASS.

---

### Task 5: Extração de currículo e de vaga

**Files:**
- Create: `server/llm.ts`, `server/storage.ts`, `server/extract/pdf.ts`, `server/extract/html.ts`, `server/extract/url.ts`, `server/handlers/extractResume.ts`, `server/handlers/extractJob.ts`, `api/extract/resume.ts`, `api/extract/job.ts`, `prompts/extract-resume.md`, `prompts/extract-job.md`
- Test: `tests/server/html.test.ts`, `tests/server/url.test.ts`, `tests/server/extractResume.test.ts`, `tests/server/extractJob.test.ts`

**Interfaces:**
- Consumes: `Deps`, `ApiError`, `renderPrompt`/`loadPrompt` (Task 3); `JobSummary`, `ResumeSummary` (Task 2).
- Produces:
  - `interface Llm { stream(messages: ChatMessage[]): AsyncIterable<string>; json(messages: ChatMessage[]): Promise<unknown>; vision(image: { base64: string; mime: string }, instruction: string): Promise<unknown> }`, com `ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }`. A implementação real usa o SDK `openai` com `baseURL = LLM_BASE_URL`. `json` usa `response_format: { type: 'json_object' }`. `vision` usa `VISION_MODEL` e também devolve JSON.
  - `interface Storage { download(bucket: 'resumes' | 'job-files', path: string): Promise<Uint8Array>; removePrefix(bucket: 'resumes' | 'job-files', prefix: string): Promise<void> }`
  - `pdfToText(bytes: Uint8Array): Promise<string>` (via `unpdf`)
  - `htmlToText(html: string): string`: remove `script`, `style`, `noscript`, `svg` e tags, decodifica entidades básicas e colapsa espaços.
  - `assertFetchableUrl(raw: string): URL`: aceita só `http`/`https`. Recusa `localhost`, IPs literais privados ou link-local (`10.*`, `127.*`, `169.254.*`, `172.16–31.*`, `192.168.*`, `::1`) e hosts `linkedin.com`/`*.linkedin.com`. Em caso de recusa, lança 422 `url_unreadable`.
  - O `fetchPage` real tem timeout de 8 s, lê no máximo 2 MB e lança `url_unreadable` se a resposta não for 2xx.
  - `createExtractResumeHandler(deps)`: `POST { path }` → `200 ResumeSummary`
  - `createExtractJobHandler(deps)`: `POST { kind: 'text', text } | { kind: 'url', url } | { kind: 'file', path, mime }` → `200 JobSummary`
  - O JSON do LLM para a vaga é `JobSummary & { isTechRole: boolean }`, validado com zod. Se `isTechRole` for `false`, lança 422 `not_tech_role`. `isTechRole` não vai na resposta.
  - Os prompts de extração definem só o formato JSON, em inglês. Os placeholders são `{{text}}`.

- [ ] **Step 1: Escrever os testes** (com `Llm`, `Storage` e `fetchPage` falsos)
  - `htmlToText('<style>x</style><p>Senior&nbsp;Go  Dev</p><script>y</script>')` → `'Senior Go Dev'`
  - `assertFetchableUrl` recusa `http://localhost:3000`, `http://169.254.169.254/`, `file:///etc/passwd` e `https://www.linkedin.com/jobs/view/1`, e aceita `https://boards.greenhouse.io/acme/jobs/1`.
  - `extract_resume_rejects_other_users_path` → 403 `forbidden`.
  - `extract_resume_rejects_scanned_pdf`: texto extraído com menos de 200 caracteres → 422 `resume_unreadable`, sem chamar o LLM.
  - `extract_resume_returns_summary`: o LLM devolve um `ResumeSummary` válido → 200 com o mesmo objeto.
  - `extract_resume_llm_invalid_json` → 502 `upstream_failed`.
  - `extract_job_text_not_tech` → 422 `not_tech_role`.
  - `extract_job_url_linkedin` → 422 `url_unreadable`, sem chamar `fetchPage`.
  - `extract_job_url_short_page`: menos de 200 caracteres após `htmlToText` → 422 `url_unreadable`.
  - `extract_job_file_image_uses_vision`: `mime: 'image/png'` → `llm.vision` é chamado.
  - `extract_job_file_pdf_uses_text`: `mime: 'application/pdf'` → `pdfToText` seguido de `llm.json`.
  - `extract_job_file_bad_mime`: `image/gif` → 400.
- [ ] **Step 2: Rodar** `npx vitest run tests/server/html.test.ts tests/server/url.test.ts tests/server/extract*.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar o mesmo comando, depois** `npx tsc --noEmit`. Esperado: PASS.

---

### Task 6: Turno da entrevista (LLM → TTS em streaming)

**Files:**
- Create: `server/tts.ts`, `server/interviewer.ts`, `server/handlers/turn.ts`, `api/interviews/turn.ts`, `prompts/interviewer.md`
- Test: `tests/server/interviewer.test.ts`, `tests/server/turn.test.ts`

**Interfaces:**
- Consumes: `Repo`, `Llm` (Tasks 3 e 5); `createSentenceChunker`, `phaseFor` (Task 4); `TurnStreamEvent` (Task 2).
- Produces:
  - `interface Tts { synthesize(text: string): AsyncIterable<Uint8Array> }`. A implementação real usa Aura REST com `TTS_MODEL`, `encoding=linear16&sample_rate=24000&container=none`, e repassa os chunks de PCM conforme chegam (ver a decisão do spike na Task 1).
  - `buildInterviewerMessages(input: { template: string; interview: Interview; turns: Turn[]; elapsedSec: number }): ChatMessage[]`. O system é `renderPrompt(template, { job: JSON, resume: JSON, remainingSeconds: max(0, 300 - elapsed), phase: phaseFor(elapsed) })`. Os turnos do entrevistador viram `assistant` e os do candidato viram `user`. Turno silencioso vira `'(candidate stayed silent)'`.
  - `END_MARKER = '[END]'`
  - `createTurnHandler(deps)`: `POST { interviewId, text: string | null, metrics: TurnMetrics | null }` → `200`, `content-type: application/x-ndjson`, uma linha JSON `TurnStreamEvent` por evento.
  - Regras:
    - `text: null` só é aceito quando ainda não há turnos (abertura). Caso contrário, 400.
    - O turno do candidato é salvo antes de chamar o LLM.
    - Cada frase do chunker vira um evento `text` seguido dos eventos `audio` dos chunks PCM daquela frase (`data` = base64 de PCM 16-bit little-endian mono 24 kHz), com `seq` global crescente. A síntese de cada frase começa assim que a frase fica pronta, mas os eventos saem na ordem das frases.
    - `[END]` é removido do texto falado e salvo, e emite `{type:'end'}` no final.
    - A fala completa do entrevistador é salva como um turno ao final do stream.
    - Falha de LLM ou TTS no meio do stream emite `{type:'error', code:'upstream_failed'}` e fecha.
    - O `elapsed` conta a partir de `interview.startedAt`. Com `elapsed > 360`, responde 409 `time_over`.
  - `prompts/interviewer.md`, em inglês, com as variáveis `{{job}}`, `{{resume}}`, `{{remainingSeconds}}` e `{{phase}}`. Ele deve ditar:
    - persona de recrutador técnico exigente e realista de empresa estrangeira;
    - o roteiro da spec (opening ~30 s com "tell me about yourself"; behavioral ~1 min 30 s puxando algo do currículo; technical ~2 min 30 s com 2–3 perguntas dos requisitos da vaga e follow-up quando a resposta for rasa; closing ~30 s sem perguntar se o candidato tem dúvidas);
    - seguir `{{phase}}`;
    - uma pergunta por vez, no máximo 3 frases, estilo falado, sem markdown nem listas;
    - nunca dar feedback ou nota durante a entrevista;
    - em silêncio, reformular ou seguir em frente;
    - na fase `closing`, ou com `remainingSeconds` ≤ 30, agradecer, encerrar e terminar a resposta com `[END]`.

- [ ] **Step 1: Escrever os testes**
  ```ts
  // turn.test.ts — llm.stream rende ['Hello there. ', 'Tell me about', ' yourself. [END]'], tts devolve bytes do texto
  const events = await readAll(res); // parse NDJSON
  expect(events).toEqual([
    { type: 'text', text: 'Hello there.' }, { type: 'audio', seq: 0, data: b64('Hello there.') },
    { type: 'text', text: 'Tell me about yourself.' }, { type: 'audio', seq: 1, data: b64('Tell me about yourself.') },
    { type: 'end' },
  ]);
  expect(repo.turns.at(-1)).toMatchObject({ role: 'interviewer', text: 'Hello there. Tell me about yourself.' });
  ```
  Além disso:
  - `turn_saves_candidate_turn_before_llm`;
  - `turn_audio_order_preserved_when_tts_resolves_out_of_order` (o TTS falso atrasa a 1ª frase);
  - `turn_time_over_after_360s` → 409;
  - `turn_other_users_interview` → 404;
  - `turn_completed_interview` → 409 `interview_not_active`;
  - `turn_null_text_after_first_turn` → 400;
  - `turn_tts_failure_emits_error_event`.

  `interviewer.test.ts`: o system contém `remainingSeconds` 180 e a fase `technical` para `elapsed` 120, e um turno silencioso vira `'(candidate stayed silent)'`.
- [ ] **Step 2: Rodar** `npx vitest run tests/server/turn.test.ts tests/server/interviewer.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar e escrever `prompts/interviewer.md`.**
- [ ] **Step 4: Rodar o mesmo comando.** Esperado: PASS.

---

### Task 7: Encerramento e avaliação

**Files:**
- Create: `server/evaluator.ts`, `server/handlers/finish.ts`, `api/interviews/finish.ts`, `prompts/evaluator.md`
- Test: `tests/server/evaluator.test.ts`, `tests/server/finish.test.ts`

**Interfaces:**
- Consumes: `Repo.completeInterview`/`abandonInterview`/`getEvaluation`, `Llm.json`, `aggregateMetrics`.
- Produces:
  - `EvaluationSchema` (zod): scores inteiros de 0 a 10, justificativas não vazias, `tips.technical` com 1 a 5 itens e `tips.english` com 1 a 6 itens.
  - `filterGroundedTips(evaluation: Evaluation, transcript: string): Evaluation`: descarta dicas de inglês cujo `said` não aparece na fala do candidato (comparação em minúsculas, sem pontuação e com espaços colapsados).
  - `createFinishHandler(deps)`: `POST { interviewId }` → `200 { status: 'completed' } | { status: 'abandoned', reason: 'too_short' }`. Regras:
    - Idempotente: se já está `completed`, devolve `completed` sem chamar o LLM; se `abandoned`, devolve `abandoned`.
    - `elapsed = min(now - startedAt, 360)`. Com `elapsed < 120`, chama `abandonInterview` e devolve `too_short`.
    - Senão, avalia: renderiza `evaluator.md` com `{{job}}`, `{{resume}}`, `{{transcript}}` (só os turnos, prefixados `Interviewer:` e `Candidate:`) e `{{speechStats}}` (JSON de `aggregateMetrics`), chama `llm.json`, valida com o schema, aplica `filterGroundedTips` e chama `completeInterview`.
    - JSON inválido gera uma nova tentativa. Se falhar duas vezes, responde 502 `evaluation_failed` sem alterar o estado.
  - `prompts/evaluator.md`, em inglês, com:
    - a nota técnica medida contra os requisitos da vaga e o currículo;
    - a nota de inglês combinando fluidez (wpm, fillers, pausas, latência), clareza (palavras de baixa confiança como sinal de pronúncia), gramática e vocabulário;
    - um avaliador rigoroso;
    - justificativas específicas, citando o que foi ou não respondido;
    - dicas de inglês que **citam literalmente** a frase dita (`said`), com uma versão mais natural (`better`) e o motivo (`why`);
    - a saída exatamente no formato JSON de `Evaluation`.

- [ ] **Step 1: Escrever os testes**
  - `finish_too_short`: `elapsed` de 90 s → `abandoned`/`too_short`, sem chamar o LLM nem `completeInterview`.
  - `finish_evaluates`: `elapsed` de 200 s → `completeInterview` é chamado com uma avaliação válida.
  - `finish_retries_once_on_invalid_json`: a 1ª resposta tem `technical.score` = 11 e a 2ª é válida → `completed`, com 2 chamadas.
  - `finish_fails_after_two_invalid`: 502 `evaluation_failed`, sem `completeInterview` e com status ainda `in_progress`.
  - `finish_idempotent_when_completed`: o LLM não é chamado.
  - `finish_caps_elapsed_at_360`.
  - `filterGroundedTips`: com o candidato dizendo "I have 5 years of experience in React.", mantém a dica com `said: 'I have 5 years of experience in React'` e descarta a dica com `said: 'I am very passionate'`.
- [ ] **Step 2: Rodar** `npx vitest run tests/server/finish.test.ts tests/server/evaluator.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar e escrever `prompts/evaluator.md`.**
- [ ] **Step 4: Rodar o mesmo comando, depois a suíte inteira** com `npx vitest run && npx tsc --noEmit`. Esperado: PASS.

---

### Task 8: Exclusão de conta

**Files:**
- Create: `server/handlers/deleteAccount.ts`, `api/account/delete.ts`
- Test: `tests/server/deleteAccount.test.ts`

**Interfaces:**
- Produces: `createDeleteAccountHandler(deps & { adminDeleteUser(userId): Promise<void> })`: `POST {}` → `204`. Faz `removePrefix('resumes', userId + '/')` e `removePrefix('job-files', userId + '/')` **antes** de `adminDeleteUser`. As linhas do banco caem em cascata.

- [ ] **Step 1: Escrever os testes:** a ordem das chamadas é storage, storage e por último o usuário; sem auth → 401.
- [ ] **Step 2: Rodar** `npx vitest run tests/server/deleteAccount.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar o mesmo comando.** Esperado: PASS.

---

### Task 9: Frontend — auth, layout, home com histórico, nova entrevista

**Files:**
- Create: `src/App.tsx`, `src/lib/supabase.ts`, `src/lib/api.ts`, `src/pages/AuthPage.tsx`, `src/pages/HomePage.tsx`, `src/pages/NewInterviewPage.tsx`, `src/pages/AccountPage.tsx`
- Test: `tests/src/api.test.ts`

**Interfaces:**
- Consumes: os endpoints das Tasks 3, 5 e 8; os tipos de `shared/types.ts`.
- Produces:
  - `apiPost<T>(path: string, body: unknown): Promise<T>`. Anexa `Bearer` com a sessão atual e lança `ApiClientError { status, code: ApiErrorCode }` quando a resposta não é ok.
  - `errorMessage(code: ApiErrorCode): string`, com as mensagens em português para todos os códigos. Exemplos:
    - `quota_exhausted`: "Você já usou suas 3 entrevistas grátis."
    - `resume_unreadable`: "Não conseguimos ler o texto do seu currículo. Envie um PDF com texto selecionável (não escaneado)."
    - `url_unreadable`: "Não conseguimos abrir esse link. Cole o texto da vaga."
    - `not_tech_role`: "Por enquanto o HireGringo só funciona para vagas de tecnologia."
  - Rotas:
    - `/entrar`: login e cadastro. O cadastro exige marcar o consentimento, que é enviado em `options.data.consent_at`. Depois do cadastro, a tela avisa para confirmar o e-mail.
    - `/`: home com o restante da cota (`3 - free_interviews_used`), o botão "Nova entrevista" e o histórico com só as concluídas (cargo, empresa, data e as duas notas).
    - `/nova`: nova entrevista.
    - `/entrevista/:id`: sala da entrevista.
    - `/resultado/:id`: resultado.
    - `/conta`: conta, com "Apagar conta" e confirmação digitada.
    - Todas exigem sessão, exceto `/entrar`.
  - `/nova` tem três etapas:
    1. Upload do currículo PDF para `resumes/{userId}/{uuid}.pdf`, seguido de `extract/resume`.
    2. Vaga em abas Texto, Link e Arquivo. O arquivo vai para `job-files/{userId}/{uuid}.{ext}`, seguido de `extract/job`. Quando o link falhar, a tela mostra a mensagem e muda para a aba Texto.
    3. Confirmação editável. Os campos de cargo, empresa e senioridade são texto. Os campos de requisitos, stack e skills são listas editáveis. Ao confirmar, a tela navega para `/entrevista/nova` levando `{ job, resume, resumePath }` no state da rota.
  - A sala é que chama `start`, depois de o microfone ser liberado (Task 10).
  - Antes do upload, o frontend valida tamanho ≤ 5 MB e tipo de arquivo.

- [ ] **Step 1: Escrever o teste** de `apiPost` (com fetch mockado):
  - envia o header `Authorization`;
  - uma resposta `{error:'quota_exhausted'}` com 403 vira `ApiClientError` com `code: 'quota_exhausted'`;
  - `errorMessage` cobre todos os `ApiErrorCode` (iterar sobre a lista e checar que nenhum volta vazio).
- [ ] **Step 2: Rodar** `npx vitest run tests/src/api.test.ts`. Esperado: FAIL. **Implementar** e rodar de novo. Esperado: PASS.
- [ ] **Step 3: Implementar as páginas.**
- [ ] **Step 4: Verificação manual com `npx vercel dev`:**
  - cadastro sem marcar o consentimento fica bloqueado;
  - com o consentimento, o e-mail de confirmação chega;
  - login funciona;
  - currículo escaneado mostra a mensagem `resume_unreadable`;
  - link do LinkedIn cai na aba Texto;
  - vaga de "Registered Nurse" mostra `not_tech_role`;
  - a confirmação permite editar a stack.

---

### Task 10: Frontend — sala da entrevista

**Files:**
- Create: `src/lib/ndjson.ts`, `src/lib/audioQueue.ts`, `src/lib/roomReducer.ts`, `src/lib/deepgramClient.ts`, `src/lib/micRecorder.ts`, `src/pages/InterviewRoomPage.tsx`
- Test: `tests/src/ndjson.test.ts`, `tests/src/audioQueue.test.ts`, `tests/src/roomReducer.test.ts`

**Interfaces:**
- Consumes: `start`, `deepgram-token`, `turn` e `finish` (Tasks 3, 6 e 7); `computeTurnMetrics` (Task 4).
- Produces:
  - `readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncIterable<T>`: lida com linhas partidas entre chunks.
  - `pcm16ToFloat32(bytes: Uint8Array): Float32Array` (PCM 16-bit LE → [-1, 1]; um byte ímpar no fim fica guardado para o próximo chunk pelo chamador).
  - `createAudioQueue(player: { play(samples: Float32Array): Promise<void> }): { enqueue(seq: number, base64: string): void; markStreamDone(): void; onIdle(cb: () => void): void; reset(): void }`. Toca estritamente na ordem de `seq`. `onIdle` dispara quando o stream terminou e a fila esvaziou. O player real agenda `AudioBuffer`s de 24 kHz em sequência num `AudioContext`.
  - `type RoomStatus = 'idle' | 'requesting_mic' | 'starting' | 'interviewer_thinking' | 'interviewer_speaking' | 'listening' | 'finishing' | 'done' | 'error'`
  - `roomReducer(state: { status: RoomStatus; error?: ApiErrorCode | 'mic_denied' }, event: RoomEvent)`. Eventos:
    - `MIC_REQUESTED`, `MIC_DENIED`, `MIC_OK`, `STARTED`;
    - `INTERVIEWER_AUDIO`: de `interviewer_thinking` para `interviewer_speaking`;
    - `INTERVIEWER_DONE`: para `listening`;
    - `INTERVIEWER_ENDED`: o `end` já chegou e a fila esvaziou; vai para `finishing`;
    - `CANDIDATE_TURN_SENT`: só de `listening` para `interviewer_thinking`;
    - `TIME_UP`: de qualquer estado ativo para `finishing`;
    - `FINISHED`: para `done`;
    - `FAILED(code)`: para `error`.
  - `connectDeepgram(token: string, handlers: { onFinal(words: DgWord[]): void; onInterim(): void; onUtteranceEnd(): void; onClose(unexpected: boolean): void }): { send(chunk: Blob): void; keepAlive(): void; close(): void }`. A URL é `wss://api.deepgram.com/v1/listen?model=${DEEPGRAM_STT_MODEL}&language=en&smart_format=true&filler_words=true&interim_results=true&utterance_end_ms=2000&vad_events=true`, com o subprotocol confirmado na Task 1.
  - Fluxo da página:
    1. Pede o microfone (`getUserMedia`). Se for negado, mostra a mensagem e **não** chama `start`.
    2. Chama `start` e, em seguida, `deepgram-token`, e conecta o Deepgram.
    3. Chama `turn` com `text: null`.
    4. Enquanto o entrevistador fala, `MediaRecorder.pause()` e `keepAlive()` a cada 5 s.
    5. Em `listening`, o `MediaRecorder` volta (timeslice de 250 ms) e as palavras finais se acumulam.
    6. O turno do candidato termina com `UtteranceEnd`, se já houver palavras, ou pelo botão "Terminei de responder". Então calcula `computeTurnMetrics`, com `responseLatencySec` = do fim da fala do entrevistador ao primeiro interim, e envia o `turn`.
    7. Sem fala em `SILENCE_TIMEOUT_MS`, envia um turno silencioso (`text: ''`, métricas `silent`).
    8. O cronômetro conta 5:00 a partir de `startedAt`. Se chegar a 5:30 sem `end`, dispara `TIME_UP`.
    9. Em `finishing`, chama `finish`. Com `completed`, vai para `/resultado/:id`. Com `too_short`, mostra "Entrevista curta demais para gerar resultado — não contou na sua cota". Com `evaluation_failed`, mostra o botão "Tentar gerar resultado de novo".
    10. Se o WebSocket fechar de forma inesperada, busca um token novo e reconecta uma vez.
    11. O botão "Encerrar entrevista" dispara `TIME_UP`.
  - Os rótulos de estado na tela, em português, são: "Entrevistador falando…", "Sua vez — pode falar", "Pensando…" e "Gerando seu resultado…".

- [ ] **Step 1: Escrever os testes**
  - `readNdjson` com os chunks `['{"type":"te', 'xt","text":"a"}\n{"type":"end"}\n']` → 2 eventos.
  - `audioQueue`: `enqueue(1)` antes de `enqueue(0)` → toca 0 e depois 1. `onIdle` só dispara depois de `markStreamDone` e do último `play`.
  - `roomReducer`:
    - `requesting_mic` + `MIC_DENIED` → `error`/`mic_denied`;
    - `interviewer_speaking` + `CANDIDATE_TURN_SENT` → continua `interviewer_speaking` (sem barge-in);
    - `listening` + `TIME_UP` → `finishing`;
    - `done` + qualquer evento → `done`.
- [ ] **Step 2: Rodar** `npx vitest run tests/src`. Esperado: FAIL. **Implementar** e rodar de novo. Esperado: PASS.
- [ ] **Step 3: Implementar `deepgramClient`, `micRecorder` e a página.**
- [ ] **Step 4: Verificação manual em `npx vercel dev`, no Chrome e no Firefox desktop:**
  - negar o microfone não cria entrevista (conferir a tabela `interviews`);
  - uma entrevista completa de 5 min encerra sozinha com a despedida;
  - a primeira resposta falada chega em ~1 s após o turno;
  - ficar calado 20 s faz o entrevistador reformular;
  - "Encerrar" aos 60 s mostra a mensagem `too_short` e a cota não muda.

---

### Task 11: Frontend — resultado, exclusão de entrevista e publicação

**Files:**
- Create: `src/pages/ResultPage.tsx`
- Modify: `src/pages/HomePage.tsx` (botão de apagar)

**Interfaces:**
- Consumes: `results.evaluation` e `interviews` lidos direto pelo client Supabase (RLS); `Evaluation`.
- Produces: a página `/resultado/:id`:
  - Duas notas grandes (Técnico e Inglês, /10), cada uma com a justificativa.
  - "O que praticar — técnico": a lista `tips.technical`.
  - "O que praticar — inglês": cartões "Você disse: *said*" → "Mais natural: *better*", com o `why`.
  - A transcrição completa num bloco recolhível.

  Apagar entrevista na home: pede confirmação, faz `delete` em `interviews` (RLS) e remove o PDF de `resume_path` do storage.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Verificação manual:**
  - o resultado mostra as notas e as dicas de inglês citando frases realmente ditas;
  - apagar a entrevista tira ela da lista e o contador de cota **não** volta;
  - "Apagar conta" encerra a sessão e o login antigo deixa de funcionar.
- [ ] **Step 3: Publicação — só quando o usuário decidir publicar.** O usuário avisou que ainda não vamos publicar; até lá, pule este passo. Confirmar com o usuário que as envs de produção estão na Vercel e então rodar `npx vercel deploy --prod`. Repetir a verificação manual da Task 10 na URL de produção.
- [ ] **Step 4: Suíte final:** `npx vitest run && npx tsc --noEmit`. Esperado: tudo PASS.

---

## Pendências do usuário (fora do código)

- Contas e chaves: Groq (ou OpenRouter), Deepgram, projeto Supabase (URL, anon key, service role) e projeto na Vercel (`vercel login` + `vercel link`), com as envs cadastradas.
- No Supabase: ativar "Confirm email" e aplicar a migration (Task 2).
- Conferir os preços dos provedores antes de abrir para o público.

-- HireGringo: schema inicial (profiles, interviews, turns, results), RLS e storage.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  consent_at timestamptz not null,
  free_interviews_used int not null default 0,
  created_at timestamptz not null default now()
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('in_progress', 'completed', 'abandoned')),
  job jsonb not null,
  resume jsonb not null,
  resume_path text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index interviews_user_created_idx on public.interviews (user_id, created_at desc);

create table public.turns (
  id bigserial primary key,
  interview_id uuid not null references public.interviews (id) on delete cascade,
  seq int not null,
  role text not null check (role in ('interviewer', 'candidate')),
  text text not null,
  metrics jsonb,
  created_at timestamptz not null default now(),
  unique (interview_id, seq)
);

create table public.results (
  interview_id uuid primary key references public.interviews (id) on delete cascade,
  technical_score int not null check (technical_score between 0 and 10),
  english_score int not null check (english_score between 0 and 10),
  evaluation jsonb not null,
  created_at timestamptz not null default now()
);

-- Profile criado no cadastro. O consentimento é obrigatório no formulário; registramos o momento do cadastro.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, consent_at)
  values (new.id, now());
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Conclui a entrevista de forma atômica e idempotente: grava o resultado e consome a cota uma única vez.
create function public.complete_interview(p_interview_id uuid, p_evaluation jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  -- Só conclui entrevista ainda em andamento (trava a linha contra conclusões concorrentes).
  select user_id into v_user from public.interviews
  where id = p_interview_id and status = 'in_progress'
  for update;
  if not found then
    return;
  end if;

  insert into public.results (interview_id, technical_score, english_score, evaluation)
  values (
    p_interview_id,
    (p_evaluation -> 'technical' ->> 'score')::int,
    (p_evaluation -> 'english' ->> 'score')::int,
    p_evaluation
  );

  update public.interviews set status = 'completed', ended_at = now() where id = p_interview_id;
  update public.profiles set free_interviews_used = free_interviews_used + 1 where id = v_user;
end;
$$;

revoke execute on function public.complete_interview(uuid, jsonb) from public, anon, authenticated;

-- Inicia a entrevista aplicando a cota numa única transação. A linha do profile fica travada, então
-- inícios em paralelo do mesmo usuário são serializados e não passam do limite.
-- Entrevistas em andamento contam na cota grátis junto com as concluídas.
create function public.start_interview(
  p_user uuid, p_job jsonb, p_resume jsonb, p_resume_path text, p_started_at timestamptz,
  p_stale_before timestamptz, p_unfinished_since timestamptz, p_free_limit int, p_unfinished_limit int
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_used int;
  v_in_progress int;
  v_unfinished int;
  v_id uuid;
begin
  insert into public.profiles (id, consent_at) values (p_user, now()) on conflict (id) do nothing;
  select free_interviews_used into v_used from public.profiles where id = p_user for update;

  update public.interviews set status = 'abandoned', ended_at = now()
  where user_id = p_user and status = 'in_progress' and started_at < p_stale_before;

  select count(*) into v_in_progress from public.interviews where user_id = p_user and status = 'in_progress';
  if v_used + v_in_progress >= p_free_limit then
    return jsonb_build_object('ok', false, 'code', 'quota_exhausted');
  end if;

  select count(*) into v_unfinished from public.interviews
  where user_id = p_user and status in ('in_progress', 'abandoned') and created_at >= p_unfinished_since;
  if v_unfinished >= p_unfinished_limit then
    return jsonb_build_object('ok', false, 'code', 'too_many_unfinished');
  end if;

  insert into public.interviews (user_id, status, job, resume, resume_path, started_at)
  values (p_user, 'in_progress', p_job, p_resume, p_resume_path, p_started_at)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke execute on function public.start_interview(uuid, jsonb, jsonb, text, timestamptz, timestamptz, timestamptz, int, int)
  from public, anon, authenticated;

-- RLS: leitura só do próprio dado; escrita só pelo servidor (secret key ignora RLS).
alter table public.profiles enable row level security;
alter table public.interviews enable row level security;
alter table public.turns enable row level security;
alter table public.results enable row level security;

create policy "own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "own interviews" on public.interviews
  for select to authenticated using (user_id = (select auth.uid()));

create policy "delete own completed interviews" on public.interviews
  for delete to authenticated using (user_id = (select auth.uid()) and status = 'completed');

create policy "own turns" on public.turns
  for select to authenticated using (
    exists (select 1 from public.interviews i where i.id = interview_id and i.user_id = (select auth.uid()))
  );

create policy "own results" on public.results
  for select to authenticated using (
    exists (select 1 from public.interviews i where i.id = interview_id and i.user_id = (select auth.uid()))
  );

-- Storage: buckets privados, 5 MB, cada usuário só mexe na própria pasta ({user_id}/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('resumes', 'resumes', false, 5242880, array['application/pdf']),
  ('job-files', 'job-files', false, 5242880, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

create policy "own files insert" on storage.objects
  for insert to authenticated with check (
    bucket_id in ('resumes', 'job-files') and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own files select" on storage.objects
  for select to authenticated using (
    bucket_id in ('resumes', 'job-files') and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own files delete" on storage.objects
  for delete to authenticated using (
    bucket_id in ('resumes', 'job-files') and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Correções da revisão (cota atômica). Idempotente: pode rodar em cima da 0001 em qualquer versão.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, consent_at)
  values (new.id, now());
  return new;
end;
$$;

create or replace function public.complete_interview(p_interview_id uuid, p_evaluation jsonb) returns void
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

create or replace function public.start_interview(
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

-- Faz a API do Supabase enxergar as funções novas na hora.
notify pgrst, 'reload schema';

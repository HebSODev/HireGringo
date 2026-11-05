-- Avaliação do app ao fim da entrevista: nota de 0,5 a 5 (meias estrelas) e comentário opcional.
-- Uma por entrevista; o usuário grava e edita a própria direto pelo cliente (RLS), só em entrevista concluída.

create table if not exists public.feedback (
  interview_id uuid primary key references public.interviews (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating numeric(2, 1) not null check (rating between 0.5 and 5 and rating * 2 = floor(rating * 2)),
  comment text check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "own feedback select" on public.feedback;
create policy "own feedback select" on public.feedback
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "own feedback insert" on public.feedback;
create policy "own feedback insert" on public.feedback
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.interviews i
      where i.id = interview_id and i.user_id = (select auth.uid()) and i.status = 'completed'
    )
  );

drop policy if exists "own feedback update" on public.feedback;
create policy "own feedback update" on public.feedback
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- O cliente só mexe na nota e no comentário; dono e datas ficam com o banco.
revoke insert, update on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;
grant insert (interview_id, rating, comment) on public.feedback to authenticated;
grant update (rating, comment) on public.feedback to authenticated;

create or replace function public.touch_feedback_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists feedback_touch_updated_at on public.feedback;
create trigger feedback_touch_updated_at
  before update on public.feedback
  for each row execute function public.touch_feedback_updated_at();

notify pgrst, 'reload schema';

-- =====================================================================
--  Scores only in steps of 0.5  (1, 1.5, 2 ... 9.5, 10)
--  Run ONCE: Supabase -> SQL Editor -> New query -> paste -> Run
--
--  What it does, in this order:
--   1. saves a copy of all scores (so you can undo)
--   2. rounds every score to the nearest 0.5   (1.2 -> 1, 1.3 -> 1.5, 1.7 -> 1.5, 1.8 -> 2)
--   3. adds a rule in the database: new scores must be multiples of 0.5
--   4. writes ONE line into the change log (instead of hundreds)
-- =====================================================================

begin;

-- 1) backup (RLS on and no policy = nobody can read it through the website API)
create table if not exists public.scores_backup_before_half_steps as
  select * from public.scores;
alter table public.scores_backup_before_half_steps enable row level security;

-- 2) round the existing scores (the per-row log trigger is paused so the log is not flooded)
alter table public.scores disable trigger scores_audit;

with changed as (
  update public.scores
     set score = (round(score * 2) / 2)::numeric(3, 1),
         updated_at = now()
   where score * 2 <> round(score * 2)
  returning 1
)
insert into public.audit_log (actor, entity, action, summary)
select 'system', 'score', 'update', format('Rounded %s scores to the nearest 0.5', count(*))
  from changed
having count(*) > 0;

alter table public.scores enable trigger scores_audit;

-- 3) from now on the database itself refuses anything that is not a multiple of 0.5
alter table public.scores drop constraint if exists scores_half_step;
alter table public.scores add constraint scores_half_step check (score * 2 = round(score * 2));

commit;

-- check: must return 0
select count(*) as scores_not_in_half_steps from public.scores where score * 2 <> round(score * 2);

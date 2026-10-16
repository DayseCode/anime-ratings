-- =====================================================================
--  Live updates for scores and songs
--  Run ONCE: Supabase -> SQL Editor -> New query -> paste -> Run
--  (Same thing as: Database -> Replication / Publications -> supabase_realtime -> toggle "scores")
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['scores', 'songs'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

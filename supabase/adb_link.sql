-- Third link type for songs ("Adb"): run this ONCE in the Supabase SQL editor, BEFORE deploying the new site version.
-- It is safe to run again.

alter table public.songs add column if not exists adb_url text;

-- the change log also mentions edits of the new link
create or replace function public.log_song_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changes text[] := '{}';
begin
  if tg_op = 'INSERT' then
    perform public.audit_write('song', 'insert',
      format('Added %s "%s"%s', new.kind, new.title, case when new.song is not null then ' - ' || new.song else '' end),
      to_jsonb(new));
    return new;

  elsif tg_op = 'UPDATE' then
    if new.title       is distinct from old.title       then changes := changes || format('title: "%s" -> "%s"', old.title, new.title); end if;
    if new.author      is distinct from old.author      then changes := changes || format('author: "%s" -> "%s"', coalesce(old.author, '—'), coalesce(new.author, '—')); end if;
    if new.song        is distinct from old.song        then changes := changes || format('song: "%s" -> "%s"', coalesce(old.song, '—'), coalesce(new.song, '—')); end if;
    if new.youtube_url is distinct from old.youtube_url then changes := changes || format('YouTube link: %s -> %s', coalesce(old.youtube_url, '—'), coalesce(new.youtube_url, '—')); end if;
    if new.vlink_url   is distinct from old.vlink_url   then changes := changes || format('VLINK: %s -> %s', coalesce(old.vlink_url, '—'), coalesce(new.vlink_url, '—')); end if;
    if new.adb_url     is distinct from old.adb_url     then changes := changes || format('Adb link: %s -> %s', coalesce(old.adb_url, '—'), coalesce(new.adb_url, '—')); end if;
    if new.kind        is distinct from old.kind        then changes := changes || format('type: %s -> %s', old.kind, new.kind); end if;
    if array_length(changes, 1) is null then return new; end if;
    perform public.audit_write('song', 'update',
      format('Edited %s "%s": %s', old.kind, old.title, array_to_string(changes, '; ')),
      jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
    return new;

  else -- DELETE (BEFORE trigger, so the scores still exist and can be saved in the log)
    perform public.audit_write('song', 'delete',
      format('Deleted %s "%s"%s', old.kind, old.title, case when old.song is not null then ' - ' || old.song else '' end),
      jsonb_build_object(
        'song', to_jsonb(old),
        'scores', (select coalesce(jsonb_agg(jsonb_build_object('rater', r.name, 'score', s.score)), '[]'::jsonb)
                     from public.scores s join public.raters r on r.id = s.rater_id
                    where s.song_id = old.id)));
    return old;
  end if;
end;
$$;

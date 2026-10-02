-- The backend reaches Postgres through the Data API with the project URL and
-- the secret key (service_role) instead of a direct Postgres connection.
--
-- PostgREST's table API can't reach private.* (accounts, sessions, links) or
-- run several statements in one transaction, so the backend sends its SQL to
-- this one function:
--
--   select public.backend_sql('[{"sql": "...", "rows": true}, ...]', '<user id>');
--
--   * statements run in order, in one transaction (the PostgREST request), and
--     the result is one JSON array of row objects per statement ("rows": false
--     for statements that return nothing);
--   * values arrive already inlined as quoted literals (backend/src/db.js);
--   * with as_user, request.jwt.claims carries that user's id, so auth.uid(),
--     private.is_admin(), private.is_banned(), column defaults and the
--     SECURITY DEFINER game functions see that user. The role stays the
--     function owner, so RLS and column grants do not apply here: the backend
--     filters its own direct queries (backend/src/routes/me.js) and every game
--     rule lives in the SECURITY DEFINER functions, which check auth.uid().
--
-- EXECUTE is granted to service_role only. The secret key is as powerful as
-- the database password it replaces: keep it in the API's environment only.

create or replace function public.backend_sql(statements jsonb, as_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
set standard_conforming_strings = on
as $$
declare
  stmt    jsonb;
  rec     record;
  rows    jsonb;
  results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(statements) is distinct from 'array' then
    raise exception 'statements must be a JSON array' using errcode = '22023';
  end if;

  if as_user is not null then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', as_user, 'role', 'authenticated')::text, true),
            set_config('request.jwt.claim.sub', as_user::text, true),
            set_config('request.jwt.claim.role', 'authenticated', true);
  end if;

  for stmt in select value from jsonb_array_elements(statements) loop
    if jsonb_typeof(stmt -> 'sql') is distinct from 'string' then
      raise exception 'every statement needs "sql"' using errcode = '22023';
    end if;
    rows := '[]'::jsonb;
    if coalesce((stmt ->> 'rows')::boolean, true) then
      for rec in execute stmt ->> 'sql' loop
        rows := rows || jsonb_build_array(to_jsonb(rec));
      end loop;
    else
      execute stmt ->> 'sql';
    end if;
    results := results || jsonb_build_array(rows);
  end loop;

  return results;
end;
$$;

comment on function public.backend_sql(jsonb, uuid) is
  'Aptric API gateway (service_role only): runs the backend''s statements in one transaction, optionally as a user.';

-- New functions in public are granted to anon/authenticated by default.
revoke execute on function public.backend_sql(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.backend_sql(jsonb, uuid) to service_role;

notify pgrst, 'reload schema';

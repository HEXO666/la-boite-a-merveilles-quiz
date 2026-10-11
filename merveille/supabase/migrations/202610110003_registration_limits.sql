create table public.registration_limits (key text primary key, window_start timestamptz not null default now(), requests integer not null default 1);
alter table public.registration_limits enable row level security;
revoke all on public.registration_limits from anon,authenticated;
create function public.allow_registration(p_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.registration_limits as r(key) values(p_key) on conflict(key) do update
 set requests=case when r.window_start<now()-interval '15 minutes' then 1 else r.requests+1 end,
 window_start=case when r.window_start<now()-interval '15 minutes' then now() else r.window_start end returning requests into n;
 return n<=10;
end; $$;
revoke execute on function public.allow_registration(text) from public,anon,authenticated;
grant execute on function public.allow_registration(text) to service_role;

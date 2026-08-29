begin;

create schema if not exists private;
create extension if not exists pg_cron with schema pg_catalog;

create table private.post_view_stats (
  post_id bigint primary key references public.posts(id) on delete cascade,
  view_count bigint not null default 0 check (view_count >= 0),
  updated_at timestamptz not null default now()
);

create table private.post_view_daily (
  post_id bigint not null references public.posts(id) on delete cascade,
  view_date date not null,
  view_count bigint not null default 0 check (view_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (post_id, view_date)
);

create table private.post_view_dedupe (
  post_id bigint not null references public.posts(id) on delete cascade,
  viewer_hash text not null check (viewer_hash ~ '^[0-9a-f]{64}$'),
  last_counted_at timestamptz not null,
  primary key (post_id, viewer_hash)
);

create index post_view_dedupe_last_counted_idx
on private.post_view_dedupe (last_counted_at);

alter table private.post_view_stats enable row level security;
alter table private.post_view_daily enable row level security;
alter table private.post_view_dedupe enable row level security;

insert into private.post_view_stats (post_id, view_count)
select id, 0
from public.posts
where type in ('article', 'diary')
on conflict (post_id) do nothing;

create or replace function public.record_effective_post_view(
  p_post_id bigint,
  p_viewer_hash text,
  p_user_id uuid,
  p_counted_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_id uuid;
  v_rows integer;
begin
  if p_post_id is null
    or p_post_id <= 0
    or p_viewer_hash is null
    or p_viewer_hash !~ '^[0-9a-f]{64}$'
    or p_counted_at is null
    or not pg_catalog.isfinite(p_counted_at) then
    return false;
  end if;

  select p.author_id
  into v_author_id
  from public.posts p
  where p.id = p_post_id
    and p.type in ('article', 'diary')
    and p.status = 'published'
    and p.visibility = 'public'
    and p.deleted_at is null
  for share;

  if not found or (p_user_id is not null and p_user_id = v_author_id) then
    return false;
  end if;

  insert into private.post_view_dedupe (
    post_id,
    viewer_hash,
    last_counted_at
  )
  values (
    p_post_id,
    p_viewer_hash,
    p_counted_at
  )
  on conflict (post_id, viewer_hash) do update
  set last_counted_at = excluded.last_counted_at
  where private.post_view_dedupe.last_counted_at
        <= excluded.last_counted_at - interval '12 hours';

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  insert into private.post_view_stats (
    post_id,
    view_count,
    updated_at
  )
  values (
    p_post_id,
    1,
    p_counted_at
  )
  on conflict (post_id) do update
  set view_count = private.post_view_stats.view_count + 1,
      updated_at = excluded.updated_at;

  insert into private.post_view_daily (
    post_id,
    view_date,
    view_count,
    updated_at
  )
  values (
    p_post_id,
    (p_counted_at at time zone 'Asia/Kuala_Lumpur')::date,
    1,
    p_counted_at
  )
  on conflict (post_id, view_date) do update
  set view_count = private.post_view_daily.view_count + 1,
      updated_at = excluded.updated_at;

  return true;
end;
$$;

create or replace function public.get_effective_post_view_counts(
  p_post_ids bigint[]
)
returns table(post_id bigint, view_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select requested.post_id, coalesce(stats.view_count, 0)::bigint
  from (
    select distinct requested_post_id as post_id
    from unnest(p_post_ids) as requested_post_id
    where requested_post_id is not null and requested_post_id > 0
  ) requested
  left join private.post_view_stats stats on stats.post_id = requested.post_id;
$$;

revoke all on table
  private.post_view_stats,
  private.post_view_daily,
  private.post_view_dedupe
from public, anon, authenticated;

grant usage on schema private to service_role;
grant select, insert, update, delete on table
  private.post_view_stats,
  private.post_view_daily,
  private.post_view_dedupe
to service_role;

revoke all on function public.record_effective_post_view(
  bigint,
  text,
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.get_effective_post_view_counts(bigint[])
from public, anon, authenticated;

grant execute on function public.record_effective_post_view(
  bigint,
  text,
  uuid,
  timestamptz
) to service_role;
grant execute on function public.get_effective_post_view_counts(bigint[])
to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'cleanup-post-view-dedupe';

select cron.schedule(
  'cleanup-post-view-dedupe',
  '15 19 * * *',
  $cleanup$delete from private.post_view_dedupe
    where last_counted_at < now() - interval '24 hours'$cleanup$
);

commit;

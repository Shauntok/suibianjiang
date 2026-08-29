begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

select has_table('private', 'post_view_stats', 'lifetime view totals stay private');
select has_table('private', 'post_view_daily', 'daily view totals stay private');
select has_table('private', 'post_view_dedupe', 'viewer cooldown claims stay private');
select has_function(
  'public',
  'record_effective_post_view',
  array['bigint', 'text', 'uuid', 'timestamp with time zone'],
  'record RPC has the server-only contract'
);
select has_function(
  'public',
  'get_effective_post_view_counts',
  array['bigint[]'],
  'batch RPC has the server-only contract'
);
select ok(
  not exists (
    select 1
    from public.posts p
    left join private.post_view_stats s on s.post_id = p.id
    where p.type in ('article', 'diary')
      and s.post_id is null
  ),
  'existing article and diary posts are seeded at zero'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'views-author@ourlittleage.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"views_author"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'views-reader@ourlittleage.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"views_reader"}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, role)
values
  ('d0000000-0000-0000-0000-000000000001', 'views_author', 'user'),
  ('d0000000-0000-0000-0000-000000000002', 'views_reader', 'user')
on conflict (id) do update
set username = excluded.username, role = excluded.role;

insert into public.posts (
  id, title, content, slug, status, visibility, author_id, type, deleted_at
)
overriding system value
values
  (910000000000000001, '公开文章', 'public article', 'effective-view-public-article', 'published', 'public', 'd0000000-0000-0000-0000-000000000001', 'article', null),
  (910000000000000002, '公开日记', 'public diary', 'effective-view-public-diary', 'published', 'public', 'd0000000-0000-0000-0000-000000000001', 'diary', null),
  (910000000000000003, '草稿文章', 'draft article', 'effective-view-draft-article', 'draft', 'public', 'd0000000-0000-0000-0000-000000000001', 'article', null),
  (910000000000000004, '私密文章', 'private article', 'effective-view-private-article', 'published', 'private', 'd0000000-0000-0000-0000-000000000001', 'article', null),
  (910000000000000005, '链接文章', 'unlisted article', 'effective-view-unlisted-article', 'published', 'unlisted', 'd0000000-0000-0000-0000-000000000001', 'article', null),
  (910000000000000006, '已删除文章', 'deleted article', 'effective-view-deleted-article', 'published', 'public', 'd0000000-0000-0000-0000-000000000001', 'article', '2026-08-01 00:00:00+00'),
  (910000000000000007, '不支持内容', 'unsupported content', 'effective-view-unsupported-post', 'published', 'public', 'd0000000-0000-0000-0000-000000000001', 'note', null);

-- These serial calls prove deterministic cooldown boundaries only; they do
-- not prove true two-session concurrency. An overlapping race cannot see this
-- transaction's uncommitted fixtures and remains a separate local DB gate.
select is(
  public.record_effective_post_view(
    910000000000000001,
    repeat('a', 64),
    'd0000000-0000-0000-0000-000000000002',
    '2026-08-29 15:59:55+00'
  ),
  true,
  'first qualified public read counts'
);
select is(
  (select view_count from private.post_view_stats
   where post_id = 910000000000000001),
  1::bigint,
  'lifetime total increments once'
);
select is(
  public.record_effective_post_view(
    910000000000000001,
    repeat('a', 64),
    'd0000000-0000-0000-0000-000000000002',
    '2026-08-30 03:59:54+00'
  ),
  false,
  '11:59:59 repeat is rejected'
);
select is(
  public.record_effective_post_view(
    910000000000000001,
    repeat('a', 64),
    'd0000000-0000-0000-0000-000000000002',
    '2026-08-30 03:59:55+00'
  ),
  true,
  'exactly twelve hours later counts again'
);
select is(
  public.record_effective_post_view(
    910000000000000001,
    repeat('b', 64),
    'd0000000-0000-0000-0000-000000000001',
    '2026-08-30 04:00:00+00'
  ),
  false,
  'authenticated authors do not count'
);
select results_eq(
  $$select public.record_effective_post_view(
      post_id, repeat(hash_character, 64), null, '2026-08-30 04:00:00+00'
    )
    from (values
      (910000000000000003::bigint, 'c'),
      (910000000000000004::bigint, 'd'),
      (910000000000000005::bigint, 'e'),
      (910000000000000006::bigint, 'f'),
      (910000000000000007::bigint, '0')
    ) as cases(post_id, hash_character)$$,
  $$values (false), (false), (false), (false), (false)$$,
  'draft, private, unlisted, deleted, and unsupported posts do not count'
);
select results_eq(
  $$select public.record_effective_post_view(
      910000000000000001,
      viewer_hash,
      null,
      counted_at
    )
    from (values
      (repeat('A', 64), '2026-08-30 04:00:00+00'::timestamptz),
      (repeat('a', 63), '2026-08-30 04:00:00+00'::timestamptz),
      (repeat('g', 64), '2026-08-30 04:00:00+00'::timestamptz),
      (null::text, '2026-08-30 04:00:00+00'::timestamptz),
      (repeat('3', 64), null::timestamptz),
      (repeat('4', 64), 'infinity'::timestamptz),
      (repeat('5', 64), '-infinity'::timestamptz)
    ) as cases(viewer_hash, counted_at)$$,
  $$values (false), (false), (false), (false), (false), (false), (false)$$,
  'viewer hashes and counted timestamps must be valid and finite'
);
select is(
  public.record_effective_post_view(910000000000000002, repeat('1', 64), null, '2026-08-30 04:00:00+00'),
  true,
  'a different viewer can count independently'
);
select is(
  public.record_effective_post_view(910000000000000002, repeat('2', 64), null, '2026-08-30 04:00:01+00'),
  true,
  'a different viewer can count the same public diary independently'
);
select results_eq(
  $$select view_date, view_count
    from private.post_view_daily
    where post_id = 910000000000000001
    order by view_date$$,
  $$values
    (date '2026-08-29', 1::bigint),
    (date '2026-08-30', 1::bigint)$$,
  'MYT midnight places article reads into the correct local days'
);
select results_eq(
  $$select post_id, view_count
    from public.get_effective_post_view_counts(
      array[
        910000000000000001,
        910000000000000001,
        910000000000000002,
        910000000000000099,
        910000000000000099
      ]::bigint[]
    )
    order by post_id$$,
  $$values
    (910000000000000001::bigint, 2::bigint),
    (910000000000000002::bigint, 2::bigint),
    (910000000000000099::bigint, 0::bigint)$$,
  'batch totals collapse duplicates and zero-fill missing posts'
);
select ok(
  (select count(*) = 0
   from public.get_effective_post_view_counts(array[]::bigint[]))
  and (select count(*) = 0
       from public.get_effective_post_view_counts(null::bigint[])),
  'empty and null batches return no rows'
);
select ok(
  (select count(*) = 3
   from pg_catalog.pg_constraint
   where conrelid in (
     'private.post_view_stats'::regclass,
     'private.post_view_daily'::regclass,
     'private.post_view_dedupe'::regclass
   )
     and contype = 'f'
     and confrelid = 'public.posts'::regclass
     and confdeltype = 'c')
  and exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.post_view_dedupe'::regclass
      and contype = 'p'
      and pg_catalog.pg_get_constraintdef(oid)
          = 'PRIMARY KEY (post_id, viewer_hash)'
  )
  and exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'private'
      and tablename = 'post_view_dedupe'
      and indexname = 'post_view_dedupe_last_counted_idx'
      and indexdef like '%(last_counted_at)%'
  ),
  'private tables have cascading FKs and dedupe claim indexes'
);

delete from public.posts where id = 910000000000000002;

select ok(
  not exists (select 1 from private.post_view_stats where post_id = 910000000000000002)
  and not exists (select 1 from private.post_view_daily where post_id = 910000000000000002)
  and not exists (select 1 from private.post_view_dedupe where post_id = 910000000000000002),
  'deleting a post cascades through every private view table'
);
select ok(
  not has_table_privilege('anon', 'private.post_view_stats', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'private.post_view_daily', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'private.post_view_dedupe', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'private.post_view_stats', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'private.post_view_daily', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'private.post_view_dedupe', 'select,insert,update,delete'),
  'browser roles cannot access private view tables'
);
select ok(
  (select count(*) = 2
     and pg_catalog.bool_and(
       p.prosecdef
       and pg_catalog.cardinality(p.proconfig) = 1
       and pg_catalog.split_part(p.proconfig[1], '=', 1) = 'search_path'
       and pg_catalog.btrim(
         pg_catalog.split_part(p.proconfig[1], '=', 2),
         '"'
       ) = ''
     )
   from pg_catalog.pg_proc p
   where p.oid in (
     'public.record_effective_post_view(bigint,text,uuid,timestamptz)'::regprocedure,
     'public.get_effective_post_view_counts(bigint[])'::regprocedure
   ))
  and (select count(*) = 4
          and pg_catalog.bool_and(
            acl.privilege_type = 'EXECUTE'
            and (
              acl.grantee = p.proowner
              or (
                acl.grantee = (select oid from pg_catalog.pg_roles where rolname = 'service_role')
                and not acl.is_grantable
              )
            )
          )
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(p.proacl) acl
       where p.oid in (
         'public.record_effective_post_view(bigint,text,uuid,timestamptz)'::regprocedure,
         'public.get_effective_post_view_counts(bigint[])'::regprocedure
       ))
  and not has_function_privilege('anon', 'public.record_effective_post_view(bigint,text,uuid,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_effective_post_view(bigint,text,uuid,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.get_effective_post_view_counts(bigint[])', 'execute')
  and not has_function_privilege('authenticated', 'public.get_effective_post_view_counts(bigint[])', 'execute'),
  'RPCs have exact definer, empty search path, owner, and service_role ACLs'
);

insert into private.post_view_dedupe (post_id, viewer_hash, last_counted_at)
values (910000000000000001, repeat('9', 64), now() - interval '25 hours');

-- A sentinel can only be installed after the migration in this transaction.
-- Replaying the named replacement verifies repeatability and isolation as far
-- as a transaction-scoped post-migration pgTAP test permits.
do $cron_replacement$
declare
  v_job_id bigint;
begin
  perform cron.schedule(
    'effective-post-views-test-sentinel',
    '0 0 1 1 *',
    'select 1'
  );

  for v_iteration in 1..2 loop
    select jobid into v_job_id
    from cron.job
    where jobname = 'cleanup-post-view-dedupe';

    perform cron.unschedule(v_job_id);
    perform cron.schedule(
      'cleanup-post-view-dedupe',
      '15 19 * * *',
      $cleanup$delete from private.post_view_dedupe
        where last_counted_at < now() - interval '24 hours'$cleanup$
    );
  end loop;
end;
$cron_replacement$;

do $execute_cleanup$
declare
  v_cleanup_sql text;
begin
  select command into strict v_cleanup_sql
  from cron.job
  where jobname = 'cleanup-post-view-dedupe';

  execute v_cleanup_sql;
end;
$execute_cleanup$;

select ok(
  not exists (
    select 1 from private.post_view_dedupe
    where post_id = 910000000000000001 and viewer_hash = repeat('9', 64)
  )
  and exists (
    select 1 from private.post_view_stats
    where post_id = 910000000000000001 and view_count = 2
  )
  and (select count(*) = 2
          and sum(view_count) = 2
          and min(view_count) = 1
          and max(view_count) = 1
          and min(view_date) = date '2026-08-29'
          and max(view_date) = date '2026-08-30'
       from private.post_view_daily
       where post_id = 910000000000000001),
  'scheduled cleanup removes expired claims and preserves exact aggregates'
);
select ok(
  (select count(*) = 1
     and bool_and(schedule = '15 19 * * *')
     and bool_and(command like '%private.post_view_dedupe%')
     and bool_and(command like $$%interval '24 hours'%$$)
   from cron.job
   where jobname = 'cleanup-post-view-dedupe')
  and (select count(*) = 1
          and pg_catalog.bool_and(schedule = '0 0 1 1 *')
          and pg_catalog.bool_and(command = 'select 1')
       from cron.job
       where jobname = 'effective-post-views-test-sentinel'),
  'Cron replacement is idempotent and preserves unrelated jobs'
);

select * from finish();
rollback;

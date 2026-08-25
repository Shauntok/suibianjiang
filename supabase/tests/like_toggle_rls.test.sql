begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'comment_likes'
      and policyname = 'Authenticated can read active or own comment likes'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and position('(is_active = true)' in qual) > 0
      and position('( SELECT auth.uid()' in qual) > 0
  ),
  'residents can read their own inactive comment-like row for toggling'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'post_likes'
      and policyname = 'Authenticated can read active or own post likes'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and position('(is_active = true)' in qual) > 0
      and position('( SELECT auth.uid()' in qual) > 0
  ),
  'residents can read their own inactive post-like row for toggling'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'comment_likes'
      and policyname = 'Users can update own comment likes'
      and cmd = 'UPDATE'
      and position('( SELECT auth.uid()' in qual) > 0
      and position('( SELECT auth.uid()' in with_check) > 0
  ),
  'comment-like updates use the cached authenticated resident id'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'post_likes'
      and policyname = 'Users can update own likes'
      and cmd = 'UPDATE'
      and position('( SELECT auth.uid()' in qual) > 0
      and position('( SELECT auth.uid()' in with_check) > 0
  ),
  'post-like updates use the cached authenticated resident id'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'comment_likes'
      and policyname = 'Anonymous can read active comment likes'
      and cmd = 'SELECT'
      and roles = array['anon']::name[]
      and qual = '(is_active = true)'
  ),
  'anonymous visitors can only read active comment likes'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'post_likes'
      and policyname = 'Anonymous can read active post likes'
      and cmd = 'SELECT'
      and roles = array['anon']::name[]
      and qual = '(is_active = true)'
  ),
  'anonymous visitors can only read active post likes'
);

select * from finish();

rollback;

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

select has_column('public', 'comments', 'deleted_at', 'comments record the soft-delete time');
select has_index('public', 'comments', 'comments_deleted_at_idx', 'expired soft deletes have a cleanup index');
select is(
  (select confdeltype::text from pg_constraint where conname = 'comments_parent_id_fkey'),
  'n'::text,
  'hard deleting a parent sets reply parent_id to null'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'retention-owner@ourlittleage.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"retention_owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'retention-user@ourlittleage.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"retention_user"}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, role)
values
  ('d0000000-0000-0000-0000-000000000001', 'retention_owner', 'owner'),
  ('d0000000-0000-0000-0000-000000000002', 'retention_user', 'user')
on conflict (id) do update set username = excluded.username, role = excluded.role;

insert into public.posts (
  id, title, content, slug, status, visibility, author_id, type
)
overriding system value
values (
  900000000000000027, '评论保留期测试', 'comment retention test',
  'comment-retention-test-20260826', 'draft', 'private',
  'd0000000-0000-0000-0000-000000000001', 'article'
);

insert into public.comments (id, post_id, author_id, content)
values (
  'd1000000-0000-0000-0000-000000000001',
  900000000000000027,
  'd0000000-0000-0000-0000-000000000001',
  '准备软删除的父评论'
);

insert into public.comments (id, post_id, author_id, content, parent_id, depth)
values (
  'd1000000-0000-0000-0000-000000000002',
  900000000000000027,
  'd0000000-0000-0000-0000-000000000002',
  '应该被保留的回复',
  'd1000000-0000-0000-0000-000000000001',
  1
);

update public.comments
set is_deleted = true, deleted_at = '2000-01-01T00:00:00Z'
where id = 'd1000000-0000-0000-0000-000000000001';

select isnt(
  (select deleted_at from public.comments where id = 'd1000000-0000-0000-0000-000000000001'),
  null::timestamptz,
  'soft deleting records a deletion time'
);
select ok(
  (select deleted_at > now() - interval '1 minute' from public.comments where id = 'd1000000-0000-0000-0000-000000000001'),
  'clients cannot backdate the retention clock'
);

update public.comments
set is_deleted = false
where id = 'd1000000-0000-0000-0000-000000000001';

select is(
  (select deleted_at from public.comments where id = 'd1000000-0000-0000-0000-000000000001'),
  null::timestamptz,
  'restoring a comment clears the retention clock'
);

update public.comments
set is_deleted = true
where id = 'd1000000-0000-0000-0000-000000000001';

delete from public.comments
where id = 'd1000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.comments where id = 'd1000000-0000-0000-0000-000000000002'),
  1::bigint,
  'hard deleting a parent preserves its reply'
);
select is(
  (select parent_id from public.comments where id = 'd1000000-0000-0000-0000-000000000002'),
  null::uuid,
  'preserved replies no longer reference the deleted parent'
);
select ok(
  (select not is_deleted from public.comments where id = 'd1000000-0000-0000-0000-000000000002'),
  'preserved replies keep their own visibility state'
);

select * from finish();
rollback;

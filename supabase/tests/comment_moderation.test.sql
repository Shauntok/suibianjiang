begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

select has_table('public', 'comment_moderation_keywords', 'moderation keywords table exists');
select has_table('public', 'comment_moderation_flags', 'moderation flags table exists');
select has_function('public', 'rescan_comment_moderation', array[]::text[], 'admins can rescan existing comments');
select policies_are('public', 'comment_moderation_keywords', array[
  'Admin team can read comment moderation keywords',
  'Owners and admins can create comment moderation keywords',
  'Owners and admins can update comment moderation keywords',
  'Owners and admins can delete comment moderation keywords'
], 'keyword policies are explicit');
select policies_are('public', 'comment_moderation_flags', array[
  'Admin team can read comment moderation flags',
  'Admin team can review comment moderation flags'
], 'flag policies are explicit');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'moderation-owner@ourlittleage.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"moderation_owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'moderation-user@ourlittleage.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"moderation_user"}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, role)
values
  ('c0000000-0000-0000-0000-000000000001', 'moderation_owner', 'owner'),
  ('c0000000-0000-0000-0000-000000000002', 'moderation_user', 'user')
on conflict (id) do update set username = excluded.username, role = excluded.role;

insert into public.posts (
  id, title, content, slug, status, visibility, author_id, type
)
overriding system value
values (
  900000000000000026, '评论检测测试', 'comment moderation test',
  'comment-moderation-test-20260826', 'draft', 'private',
  'c0000000-0000-0000-0000-000000000001', 'article'
);

insert into public.comment_moderation_keywords (keyword, created_by)
values ('异常测试词', 'c0000000-0000-0000-0000-000000000001');

insert into public.comments (id, post_id, author_id, content)
values
  ('c1000000-0000-0000-0000-000000000001', 900000000000000026, 'c0000000-0000-0000-0000-000000000002', '这是一条带有异常测试词的评论'),
  ('c1000000-0000-0000-0000-000000000002', 900000000000000026, 'c0000000-0000-0000-0000-000000000002', '这是一条普通评论');

select is(
  (select status from public.comment_moderation_flags where comment_id = 'c1000000-0000-0000-0000-000000000001'),
  'pending',
  'matching comments are marked pending'
);
select is(
  (select matched_keywords from public.comment_moderation_flags where comment_id = 'c1000000-0000-0000-0000-000000000001'),
  array['异常测试词']::text[],
  'matched keywords are recorded'
);
select ok(
  (select not is_hidden and not is_deleted from public.comments where id = 'c1000000-0000-0000-0000-000000000001'),
  'detection never hides or deletes a comment'
);
select is(
  (select count(*) from public.comment_moderation_flags where comment_id = 'c1000000-0000-0000-0000-000000000002'),
  0::bigint,
  'clean comments are not flagged'
);

update public.comments
set content = '后来加入异常测试词'
where id = 'c1000000-0000-0000-0000-000000000002';

select is(
  (select status from public.comment_moderation_flags where comment_id = 'c1000000-0000-0000-0000-000000000002'),
  'pending',
  'edited comments are checked again'
);

update public.comments
set is_hidden = true
where id = 'c1000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.comment_moderation_flags where comment_id = 'c1000000-0000-0000-0000-000000000001'),
  0::bigint,
  'hidden comments leave the pending queue'
);

update public.comments
set is_hidden = false
where id = 'c1000000-0000-0000-0000-000000000001';

select is(
  (select status from public.comment_moderation_flags where comment_id = 'c1000000-0000-0000-0000-000000000001'),
  'pending',
  'restored comments are checked again'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

update public.comment_moderation_flags
set status = 'cleared', reviewed_by = auth.uid(), reviewed_at = now()
where comment_id = 'c1000000-0000-0000-0000-000000000001';

select is(
  (select status from public.comment_moderation_flags where comment_id = 'c1000000-0000-0000-0000-000000000001'),
  'cleared',
  'an admin can confirm a flagged comment as normal'
);
select is(
  (select count(*) from public.comment_moderation_keywords where keyword = '异常测试词'),
  1::bigint,
  'owners can read the test keyword from the private list'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.comment_moderation_keywords),
  0::bigint,
  'residents cannot read moderation keywords'
);
select is(
  (select count(*) from public.comment_moderation_flags),
  0::bigint,
  'residents cannot read moderation flags'
);

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select ok(
  (select not is_hidden and not is_deleted from public.comments where id = 'c1000000-0000-0000-0000-000000000001'),
  'manual review does not change comment visibility'
);

select is(
  (select count(*) from public.comment_moderation_flags where status = 'pending'),
  1::bigint,
  'only unresolved visible matches remain pending'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.comment_moderation_keywords'::regclass),
  'keyword table has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.comment_moderation_flags'::regclass),
  'flag table has RLS enabled'
);

select * from finish();
rollback;

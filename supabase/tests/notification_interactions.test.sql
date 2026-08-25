begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'notification-owner@ourlittleage.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"notification_owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'notification-actor-a@ourlittleage.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"小雨"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'notification-actor-b@ourlittleage.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"阿禾"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'notification-actor-c@ourlittleage.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"木木"}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, role)
values
  ('b0000000-0000-0000-0000-000000000001', 'notification_owner', 'user'),
  ('b0000000-0000-0000-0000-000000000002', '小雨', 'user'),
  ('b0000000-0000-0000-0000-000000000003', '阿禾', 'user'),
  ('b0000000-0000-0000-0000-000000000004', '木木', 'user')
on conflict (id) do update set username = excluded.username;

insert into public.posts (
  id,
  title,
  content,
  slug,
  status,
  visibility,
  author_id,
  type
)
overriding system value
values (
  900000000000000025,
  '凌晨四点',
  'notification interaction test',
  'notification-interaction-test-20260825',
  'draft',
  'private',
  'b0000000-0000-0000-0000-000000000001',
  'article'
);

select has_column('public', 'notifications', 'actor_id', 'notifications records the latest actor');
select has_column('public', 'notifications', 'post_id', 'notifications records the target post');
select has_column('public', 'notifications', 'comment_id', 'notifications records the target comment');
select has_column('public', 'notifications', 'actor_count', 'notifications stores the aggregate actor count');
select has_column('public', 'notifications', 'recent_actor_ids', 'notifications stores recent actors');
select has_column('public', 'notifications', 'last_activity_at', 'notifications stores the latest activity time');
select has_index('public', 'notifications', 'notifications_actor_id_idx', 'actor foreign keys have a covering index');
select has_index('public', 'notifications', 'notifications_post_id_idx', 'post foreign keys have a covering index');
select has_index('public', 'notifications', 'notifications_comment_id_idx', 'comment foreign keys have a covering index');

select ok(
  (select position('( SELECT auth.uid()' in qual) > 0 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'Users can read own notifications'),
  'the notification SELECT policy caches auth.uid()'
);
select ok(
  (select position('( SELECT auth.uid()' in qual) > 0 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'Users can update own notifications'),
  'the notification UPDATE policy caches auth.uid() in USING'
);
select ok(
  (select position('( SELECT auth.uid()' in with_check) > 0 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'Users can update own notifications'),
  'the notification UPDATE policy caches auth.uid() in WITH CHECK'
);

insert into public.post_likes (post_id, user_id, is_active)
values
  (900000000000000025, 'b0000000-0000-0000-0000-000000000002', true),
  (900000000000000025, 'b0000000-0000-0000-0000-000000000003', true),
  (900000000000000025, 'b0000000-0000-0000-0000-000000000004', true);

select is(
  (select count(*) from public.notifications where user_id = 'b0000000-0000-0000-0000-000000000001' and type = 'like' and post_id = 900000000000000025),
  1::bigint,
  'likes on one post create one notification group'
);
select is(
  (select actor_count from public.notifications where user_id = 'b0000000-0000-0000-0000-000000000001' and type = 'like' and post_id = 900000000000000025),
  3,
  'the aggregate stores all active likes'
);
select is(
  (select cardinality(recent_actor_ids) from public.notifications where user_id = 'b0000000-0000-0000-0000-000000000001' and type = 'like' and post_id = 900000000000000025),
  3,
  'the aggregate stores recent actor ids'
);

create temporary table notification_test_group as
select id
from public.notifications
where user_id = 'b0000000-0000-0000-0000-000000000001'
  and type = 'like'
  and post_id = 900000000000000025;

update public.post_likes
set is_active = false
where post_id = 900000000000000025
  and user_id = 'b0000000-0000-0000-0000-000000000003';

select is(
  (select actor_count from public.notifications where id = (select id from notification_test_group)),
  2,
  'unliking decrements the aggregate count'
);
select ok(
  (select not ('b0000000-0000-0000-0000-000000000003'::uuid = any(recent_actor_ids))
   from public.notifications
   where id = (select id from notification_test_group)),
  'an inactive actor is removed from recent actors'
);

update public.post_likes
set is_active = false
where post_id = 900000000000000025;

select is(
  (select actor_count from public.notifications where id = (select id from notification_test_group)),
  0,
  'removing every like leaves a zero-count tombstone'
);
select isnt(
  (select deleted_at from public.notifications where id = (select id from notification_test_group)),
  null::timestamptz,
  'a zero-count like group is hidden'
);

update public.post_likes
set is_active = true
where post_id = 900000000000000025
  and user_id = 'b0000000-0000-0000-0000-000000000003';

select is(
  (select count(*) from public.notifications where user_id = 'b0000000-0000-0000-0000-000000000001' and type = 'like' and post_id = 900000000000000025),
  1::bigint,
  're-liking reuses the existing notification group'
);
select is(
  (select actor_count from public.notifications where id = (select id from notification_test_group)),
  1,
  're-liking restores the active count'
);
select is(
  (select is_read from public.notifications where id = (select id from notification_test_group)),
  false,
  'new activity makes the group unread again'
);
select is(
  (select deleted_at from public.notifications where id = (select id from notification_test_group)),
  null::timestamptz,
  're-liking restores the hidden notification group'
);

insert into public.comments (id, post_id, author_id, content)
values (
  'b1000000-0000-0000-0000-000000000001',
  900000000000000025,
  'b0000000-0000-0000-0000-000000000002',
  '原来真的有人也有这种感觉。'
);

select is(
  (select type from public.notifications where comment_id = 'b1000000-0000-0000-0000-000000000001'),
  'comment',
  'a top-level comment creates a comment notification'
);
select is(
  (select user_id from public.notifications where comment_id = 'b1000000-0000-0000-0000-000000000001'),
  'b0000000-0000-0000-0000-000000000001'::uuid,
  'a comment notification belongs to the post author'
);

insert into public.comments (id, post_id, author_id, content, parent_id, depth)
values (
  'b1000000-0000-0000-0000-000000000002',
  900000000000000025,
  'b0000000-0000-0000-0000-000000000003',
  '我也是这样想的。',
  'b1000000-0000-0000-0000-000000000001',
  1
);

select is(
  (select type from public.notifications where comment_id = 'b1000000-0000-0000-0000-000000000002'),
  'reply',
  'a nested comment creates a reply notification'
);
select is(
  (select user_id from public.notifications where comment_id = 'b1000000-0000-0000-0000-000000000002'),
  'b0000000-0000-0000-0000-000000000002'::uuid,
  'a reply notification belongs to the parent comment author'
);

select ok(
  has_column_privilege('authenticated', 'public.notifications', 'is_read', 'UPDATE'),
  'authenticated users may update notification state'
);
select ok(
  not has_column_privilege('authenticated', 'public.notifications', 'title', 'UPDATE'),
  'authenticated users cannot rewrite notification content'
);

select * from finish();
rollback;

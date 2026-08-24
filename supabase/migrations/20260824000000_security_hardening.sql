begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_admin_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('owner', 'admin', 'moderator')
  );
$$;

create or replace function private.is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('owner', 'admin')
  );
$$;

revoke all on function private.is_admin_role() from public, anon;
revoke all on function private.is_owner_or_admin() from public, anon;
grant execute on function private.is_admin_role() to authenticated;
grant execute on function private.is_owner_or_admin() to authenticated;

create or replace function private.level_for_exp(value numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when value >= 10 then 5
    when value >= 6 then 4
    when value >= 3 then 3
    when value >= 1 then 2
    else 1
  end;
$$;

create or replace function private.add_growth(
  target_user_id uuid,
  actor_user_id uuid,
  light_delta numeric,
  trust_delta numeric,
  growth_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_level integer;
  next_level integer;
begin
  perform set_config('app.growth_update', 'on', true);

  select level into previous_level
  from public.profiles
  where id = target_user_id
  for update;

  update public.profiles
  set exp = greatest(0, round((coalesce(exp, 0) + light_delta)::numeric, 3)),
      trust_score = greatest(0, round((coalesce(trust_score, 0) + trust_delta)::numeric, 3)),
      updated_at = now()
  where id = target_user_id
  returning private.level_for_exp(exp) into next_level;

  if not found then
    perform set_config('app.growth_update', 'off', true);
    return;
  end if;

  update public.profiles
  set level = next_level
  where id = target_user_id;

  insert into public.growth_logs (
    user_id, actor_id, light_change, trust_change, reason
  ) values (
    target_user_id, actor_user_id, light_delta, trust_delta, growth_reason
  );

  if next_level > coalesce(previous_level, 1) then
    insert into public.notifications (
      user_id, title, content, type, is_important
    ) values (
      target_user_id,
      '居民等级提升',
      format('你在小时代升到了 Lv.%s。谢谢你慢慢留下的光。', next_level),
      'system',
      true
    );
  end if;

  perform set_config('app.growth_update', 'off', true);
end;
$$;

create or replace function private.award_badge_if_earned(
  target_user_id uuid,
  badge_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_badge_id uuid;
  inserted_badge_id uuid;
begin
  select id into target_badge_id
  from public.badges
  where name = badge_name;

  if target_badge_id is null then
    return;
  end if;

  insert into public.user_badges (user_id, badge_id)
  values (target_user_id, target_badge_id)
  on conflict (user_id, badge_id) do nothing
  returning id into inserted_badge_id;

  if inserted_badge_id is not null then
    insert into public.notifications (user_id, type, title, content)
    values (
      target_user_id,
      'badge',
      '获得新徽章',
      format('你获得了徽章「%s」', badge_name)
    );
  end if;
end;
$$;

create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.growth_update', true) = 'on' then
    return new;
  end if;

  if (select auth.uid()) is null then
    return new;
  end if;

  if private.is_admin_role() then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.level is distinct from old.level
    or new.exp is distinct from old.exp
    or new.trust_score is distinct from old.trust_score
    or new.created_at is distinct from old.created_at
    or new.joined_at is distinct from old.joined_at then
    raise exception 'Not allowed to update protected profile fields'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
before update on public.profiles
for each row execute function private.guard_profile_update();

create or replace function private.on_post_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'published' or new.deleted_at is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  if new.type = 'article' then
    perform private.add_growth(new.author_id, null, 0.08, 0, 'publish_article');
    perform private.award_badge_if_earned(new.author_id, '初次发声');
  elsif new.type = 'diary' then
    perform private.add_growth(new.author_id, null, 0.03, 0, 'publish_diary');
    perform private.award_badge_if_earned(new.author_id, '深夜记录者');
  end if;

  return new;
end;
$$;

drop trigger if exists post_published_growth on public.posts;
create trigger post_published_growth
after insert or update of status on public.posts
for each row execute function private.on_post_published();

create or replace function private.on_comment_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author_id uuid;
  author_name text;
begin
  perform private.add_growth(new.author_id, null, 0.01, 0, 'write_comment');
  perform private.award_badge_if_earned(new.author_id, '温柔来信');

  select p.author_id into post_author_id
  from public.posts p
  where p.id = new.post_id;

  if post_author_id is not null and post_author_id <> new.author_id then
    select coalesce(username, '有位居民') into author_name
    from public.profiles
    where id = new.author_id;

    insert into public.notifications (user_id, title, content, type)
    values (
      post_author_id,
      '有人给你的内容留言了',
      format('%s 留下了一句话：%s', author_name, left(new.content, 80)),
      'system'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists comment_created_growth on public.comments;
create trigger comment_created_growth
after insert on public.comments
for each row execute function private.on_comment_created();

create or replace function private.on_post_like_activated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
  actor_name text;
begin
  if new.is_active and not coalesce(new.rewarded, false) then
    select author_id into target_author_id
    from public.posts
    where id = new.post_id;

    if target_author_id is not null and target_author_id <> new.user_id then
      perform private.add_growth(target_author_id, new.user_id, 0.005, 0, 'post_liked');
      select coalesce(username, '有位居民') into actor_name
      from public.profiles where id = new.user_id;
      insert into public.notifications (user_id, title, content, type)
      values (
        target_author_id,
        '有人喜欢了你的内容',
        format('%s 刚刚给你的内容留下了一点喜欢。', actor_name),
        'system'
      );
      new.rewarded := true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists post_like_activated_growth on public.post_likes;
create trigger post_like_activated_growth
before insert or update of is_active on public.post_likes
for each row execute function private.on_post_like_activated();

create or replace function private.on_comment_like_activated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
  actor_name text;
begin
  if new.is_active and not coalesce(new.rewarded, false) then
    select author_id into target_author_id
    from public.comments
    where id = new.comment_id;

    if target_author_id is not null and target_author_id <> new.user_id then
      perform private.add_growth(target_author_id, new.user_id, 0.003, 0, 'comment_liked');
      select coalesce(username, '有位居民') into actor_name
      from public.profiles where id = new.user_id;
      insert into public.notifications (user_id, title, content, type)
      values (
        target_author_id,
        '有人喜欢了你的留言',
        format('%s 刚刚喜欢了你留下的留言。', actor_name),
        'system'
      );
      new.rewarded := true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists comment_like_activated_growth on public.comment_likes;
create trigger comment_like_activated_growth
before insert or update of is_active on public.comment_likes
for each row execute function private.on_comment_like_activated();

drop policy if exists "Allow authenticated delete" on public.announcements;
drop policy if exists "Allow authenticated insert" on public.announcements;
drop policy if exists "Allow authenticated select" on public.announcements;
drop policy if exists "Allow authenticated update" on public.announcements;
create policy "Public can read active announcements"
on public.announcements for select to anon, authenticated
using (is_active = true or private.is_admin_role());
create policy "Admins can insert announcements"
on public.announcements for insert to authenticated
with check (private.is_admin_role() and created_by = (select auth.uid()));
create policy "Admins can update announcements"
on public.announcements for update to authenticated
using (private.is_admin_role()) with check (private.is_admin_role());
create policy "Admins can delete announcements"
on public.announcements for delete to authenticated
using (private.is_admin_role());

drop policy if exists "admins can insert badges" on public.badges;
create policy "Owners and admins can insert badges"
on public.badges for insert to authenticated
with check (private.is_owner_or_admin());
create policy "Owners and admins can update badges"
on public.badges for update to authenticated
using (private.is_owner_or_admin()) with check (private.is_owner_or_admin());
create policy "Owners and admins can delete badges"
on public.badges for delete to authenticated
using (private.is_owner_or_admin());

drop policy if exists "Authenticated users can insert growth logs" on public.growth_logs;
create policy "Admins can insert growth logs"
on public.growth_logs for insert to authenticated
with check (private.is_admin_role());

drop policy if exists "Admins can insert notifications" on public.notifications;
drop policy if exists "Users can create interaction notifications for others" on public.notifications;
create policy "Users can create own security notifications"
on public.notifications for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "Admins can create notifications"
on public.notifications for insert to authenticated
with check (private.is_admin_role());

drop policy if exists "Allow authenticated delete user badges" on public.user_badges;
drop policy if exists "Allow authenticated insert user badges" on public.user_badges;
create policy "Owners and admins can insert user badges"
on public.user_badges for insert to authenticated
with check (private.is_owner_or_admin());
create policy "Owners and admins can delete user badges"
on public.user_badges for delete to authenticated
using (private.is_owner_or_admin());

drop policy if exists "Anyone can read visible comments" on public.comments;
drop policy if exists "Public can read visible comments v2" on public.comments;
drop policy if exists "Users can read own comments" on public.comments;
create policy "Comments can be read safely"
on public.comments for select to anon, authenticated
using (
  (is_deleted = false and is_hidden = false)
  or author_id = (select auth.uid())
  or private.is_admin_role()
);
drop policy if exists "Users can create comments" on public.comments;
create policy "Active users can create comments"
on public.comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status in ('active', 'warned')
  )
);

drop policy if exists "Anyone can read post likes" on public.post_likes;
drop policy if exists "Public can read active post likes v2" on public.post_likes;
create policy "Public can read active post likes"
on public.post_likes for select to anon, authenticated using (is_active = true);
drop policy if exists "Users can like posts" on public.post_likes;
create policy "Active users can like posts"
on public.post_likes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.profiles where id = (select auth.uid()) and status in ('active', 'warned'))
  and not exists (select 1 from public.posts where id = post_id and author_id = (select auth.uid()))
);

drop policy if exists "Anyone can read comment likes" on public.comment_likes;
create policy "Public can read active comment likes"
on public.comment_likes for select to anon, authenticated using (is_active = true);
drop policy if exists "Users can like comments" on public.comment_likes;
create policy "Active users can like comments"
on public.comment_likes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.profiles where id = (select auth.uid()) and status in ('active', 'warned'))
  and not exists (select 1 from public.comments where id = comment_id and author_id = (select auth.uid()))
);

drop policy if exists "Anyone can read public published posts" on public.posts;
drop policy if exists "Posts can be read safely" on public.posts;
create policy "Posts can be read safely"
on public.posts for select to anon, authenticated
using (
  (status = 'published' and visibility in ('public', 'unlisted') and deleted_at is null)
  or (author_id = (select auth.uid()))
  or private.is_admin_role()
);
drop policy if exists "Users can insert own posts" on public.posts;
create policy "Active users can insert own posts"
on public.posts for insert to authenticated
with check (
  (author_id = (select auth.uid()) and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status in ('active', 'warned')
  )) or private.is_admin_role()
);

drop policy if exists "Profiles can be read for public pages" on public.profiles;
create policy "Profiles can be read for public pages"
on public.profiles for select to anon, authenticated using (true);
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert safe own profile"
on public.profiles for insert to authenticated
with check (
  id = (select auth.uid())
  and coalesce(role, 'user') = 'user'
  and coalesce(status, 'active') = 'active'
  and coalesce(level, 1) = 1
  and coalesce(exp, 0) = 0
  and coalesce(trust_score, 0) = 0
);
drop policy if exists "Users can update own profile or admins can update all" on public.profiles;
create policy "Users can update own profile or admins can update all"
on public.profiles for update to authenticated
using (id = (select auth.uid()) or private.is_admin_role())
with check (id = (select auth.uid()) or private.is_admin_role());

drop policy if exists "Users can update own posts or admins can update all" on public.posts;
create policy "Users can update own posts or admins can update all"
on public.posts for update to authenticated
using (author_id = (select auth.uid()) or private.is_admin_role())
with check (author_id = (select auth.uid()) or private.is_admin_role());
drop policy if exists "Users can delete own posts or admins can delete all" on public.posts;
create policy "Users can delete own posts or admins can delete all"
on public.posts for delete to authenticated
using (author_id = (select auth.uid()) or private.is_admin_role());

drop policy if exists "Users can update own comments" on public.comments;
create policy "Users can update own comments or admins can moderate"
on public.comments for update to authenticated
using (author_id = (select auth.uid()) or private.is_admin_role())
with check (author_id = (select auth.uid()) or private.is_admin_role());

drop policy if exists "Anyone can read visible room messages" on public.room_messages;
create policy "Anyone can read visible room messages"
on public.room_messages for select to anon, authenticated
using ((is_deleted = false and is_hidden = false) or author_id = (select auth.uid()) or private.is_admin_role());
drop policy if exists "Logged in users can create room messages" on public.room_messages;
create policy "Active users can create room messages"
on public.room_messages for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (select 1 from public.profiles where id = (select auth.uid()) and status in ('active', 'warned'))
);

drop policy if exists "admins can create scheduled broadcasts" on public.scheduled_broadcasts;
drop policy if exists "admins can read scheduled broadcasts" on public.scheduled_broadcasts;
drop policy if exists "admins can update scheduled broadcasts" on public.scheduled_broadcasts;
create policy "Owners and admins can create scheduled broadcasts"
on public.scheduled_broadcasts for insert to authenticated
with check (private.is_owner_or_admin() and created_by = (select auth.uid()));
create policy "Owners and admins can read scheduled broadcasts"
on public.scheduled_broadcasts for select to authenticated
using (private.is_owner_or_admin());
create policy "Owners and admins can update scheduled broadcasts"
on public.scheduled_broadcasts for update to authenticated
using (private.is_owner_or_admin()) with check (private.is_owner_or_admin());
create policy "Owners and admins can delete scheduled broadcasts"
on public.scheduled_broadcasts for delete to authenticated
using (private.is_owner_or_admin());

revoke all on all tables in schema public from anon, authenticated;

grant select on public.announcements, public.badges, public.comments,
  public.comment_likes, public.post_likes, public.posts,
  public.room_messages, public.user_badges to anon;
grant select (
  id, username, avatar_url, created_at, bio, role, banner_url, level, exp,
  trust_score, show_level, show_exp, show_trust_score, joined_at,
  show_joined_days, status, status_message, mood_emoji, status_expires_at,
  last_seen_at, banner_position, theme, show_badges
) on public.profiles to anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, update on public.comments to authenticated;
grant select, insert, update on public.comment_likes, public.post_likes to authenticated;
grant select, insert, update on public.feedbacks, public.reports to authenticated;
grant select, insert, update on public.notifications to authenticated;
grant select, insert on public.admin_logs, public.growth_logs to authenticated;
grant select, insert, update, delete on public.announcements, public.badges,
  public.scheduled_broadcasts, public.user_badges to authenticated;
grant select, insert, update on public.room_messages to authenticated;

revoke all on function public.create_notification(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.is_admin_role() from public, anon, authenticated;

drop policy if exists "Allow uploads 1ffg0oo_0" on storage.objects;
drop policy if exists "Users can upload avatars" on storage.objects;
drop policy if exists "Users can upload own avatars" on storage.objects;
drop policy if exists "Users can update own avatars" on storage.objects;
drop policy if exists "Users can upload own banners" on storage.objects;
drop policy if exists "Users can update own banners" on storage.objects;

create policy "Users can upload own media"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('avatars', 'banners', 'images')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "Users can update own media"
on storage.objects for update to authenticated
using (
  bucket_id in ('avatars', 'banners', 'images')
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id in ('avatars', 'banners', 'images')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "Users can delete own media"
on storage.objects for delete to authenticated
using (
  bucket_id in ('avatars', 'banners', 'images')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

update storage.buckets
set file_size_limit = case id
      when 'avatars' then 5242880
      when 'banners' then 8388608
      when 'images' then 10485760
    end,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id in ('avatars', 'banners', 'images');

commit;

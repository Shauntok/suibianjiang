alter table public.notifications
  add column actor_id uuid,
  add column post_id bigint,
  add column comment_id uuid,
  add column actor_count integer not null default 1,
  add column recent_actor_ids uuid[] not null default '{}'::uuid[],
  add column last_activity_at timestamptz;

update public.notifications
set last_activity_at = coalesce(created_at, now())
where last_activity_at is null;

alter table public.notifications
  alter column last_activity_at set default now(),
  alter column last_activity_at set not null,
  add constraint notifications_actor_count_nonnegative
    check (actor_count >= 0),
  add constraint notifications_actor_id_fkey
    foreign key (actor_id) references public.profiles(id) on delete set null,
  add constraint notifications_post_id_fkey
    foreign key (post_id) references public.posts(id) on delete set null,
  add constraint notifications_comment_id_fkey
    foreign key (comment_id) references public.comments(id) on delete set null;

create unique index notifications_post_like_group_unique
on public.notifications (user_id, type, post_id)
where type = 'like' and post_id is not null and comment_id is null;

create unique index notifications_comment_like_group_unique
on public.notifications (user_id, type, comment_id)
where type = 'like' and comment_id is not null;

create unique index notifications_comment_activity_unique
on public.notifications (user_id, type, comment_id)
where type in ('comment', 'reply') and comment_id is not null;

create index notifications_user_activity_idx
on public.notifications (user_id, last_activity_at desc)
where deleted_at is null;

create or replace function private.on_post_like_activated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
begin
  if new.is_active and not coalesce(new.rewarded, false) then
    select author_id into target_author_id
    from public.posts
    where id = new.post_id;

    if target_author_id is not null and target_author_id <> new.user_id then
      perform private.add_growth(target_author_id, new.user_id, 0.005, 0, 'post_liked');
      new.rewarded := true;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.on_comment_like_activated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
begin
  if new.is_active and not coalesce(new.rewarded, false) then
    select author_id into target_author_id
    from public.comments
    where id = new.comment_id;

    if target_author_id is not null and target_author_id <> new.user_id then
      perform private.add_growth(target_author_id, new.user_id, 0.003, 0, 'comment_liked');
      new.rewarded := true;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.sync_post_like_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
  target_title text;
  target_type text;
  active_count integer;
  recent_actors uuid[];
  latest_actor_name text;
  notification_content text;
  is_activation boolean;
begin
  select p.author_id, p.title, p.type
  into target_author_id, target_title, target_type
  from public.posts p
  where p.id = new.post_id;

  if target_author_id is null then
    return new;
  end if;

  select count(*)::integer
  into active_count
  from public.post_likes pl
  where pl.post_id = new.post_id
    and pl.is_active = true
    and pl.user_id <> target_author_id;

  select coalesce(array(
    select pl.user_id
    from public.post_likes pl
    where pl.post_id = new.post_id
      and pl.is_active = true
      and pl.user_id <> target_author_id
    order by coalesce(pl.updated_at, pl.created_at) desc, pl.id desc
    limit 3
  ), '{}'::uuid[])
  into recent_actors;

  is_activation := new.is_active
    and (tg_op = 'INSERT' or not coalesce(old.is_active, false));

  if active_count = 0 then
    update public.notifications
    set actor_id = null,
        actor_count = 0,
        recent_actor_ids = '{}'::uuid[],
        is_read = true,
        deleted_at = coalesce(deleted_at, now()),
        last_activity_at = now()
    where user_id = target_author_id
      and type = 'like'
      and post_id = new.post_id
      and comment_id is null;

    return new;
  end if;

  select coalesce(p.username, '有位居民')
  into latest_actor_name
  from public.profiles p
  where p.id = recent_actors[1];

  if active_count = 1 then
    notification_content := format(
      '%s 喜欢了你的%s《%s》。',
      coalesce(latest_actor_name, '有位居民'),
      case target_type when 'article' then '文章' when 'diary' then '日记' else '内容' end,
      coalesce(target_title, '未命名内容')
    );
  else
    notification_content := format(
      '%s 等 %s 位居民喜欢了你的%s《%s》。',
      coalesce(latest_actor_name, '有位居民'),
      active_count,
      case target_type when 'article' then '文章' when 'diary' then '日记' else '内容' end,
      coalesce(target_title, '未命名内容')
    );
  end if;

  insert into public.notifications (
    user_id,
    title,
    content,
    type,
    is_read,
    deleted_at,
    actor_id,
    post_id,
    comment_id,
    actor_count,
    recent_actor_ids,
    last_activity_at
  )
  values (
    target_author_id,
    '有人喜欢了你的内容',
    notification_content,
    'like',
    false,
    null,
    recent_actors[1],
    new.post_id,
    null,
    active_count,
    recent_actors,
    now()
  )
  on conflict (user_id, type, post_id)
    where type = 'like' and post_id is not null and comment_id is null
  do update
  set content = excluded.content,
      actor_id = excluded.actor_id,
      actor_count = excluded.actor_count,
      recent_actor_ids = excluded.recent_actor_ids,
      last_activity_at = excluded.last_activity_at,
      deleted_at = null,
      is_read = case
        when is_activation then false
        else public.notifications.is_read
      end;

  return new;
end;
$$;

create or replace function private.sync_comment_like_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
  target_post_id bigint;
  active_count integer;
  recent_actors uuid[];
  latest_actor_name text;
  notification_content text;
  is_activation boolean;
begin
  select c.author_id, c.post_id
  into target_author_id, target_post_id
  from public.comments c
  where c.id = new.comment_id;

  if target_author_id is null then
    return new;
  end if;

  select count(*)::integer
  into active_count
  from public.comment_likes cl
  where cl.comment_id = new.comment_id
    and cl.is_active = true
    and cl.user_id <> target_author_id;

  select coalesce(array(
    select cl.user_id
    from public.comment_likes cl
    where cl.comment_id = new.comment_id
      and cl.is_active = true
      and cl.user_id <> target_author_id
    order by coalesce(cl.updated_at, cl.created_at) desc, cl.id desc
    limit 3
  ), '{}'::uuid[])
  into recent_actors;

  is_activation := new.is_active
    and (tg_op = 'INSERT' or not coalesce(old.is_active, false));

  if active_count = 0 then
    update public.notifications
    set actor_id = null,
        actor_count = 0,
        recent_actor_ids = '{}'::uuid[],
        is_read = true,
        deleted_at = coalesce(deleted_at, now()),
        last_activity_at = now()
    where user_id = target_author_id
      and type = 'like'
      and comment_id = new.comment_id;

    return new;
  end if;

  select coalesce(p.username, '有位居民')
  into latest_actor_name
  from public.profiles p
  where p.id = recent_actors[1];

  if active_count = 1 then
    notification_content := format('%s 喜欢了你留下的评论。', coalesce(latest_actor_name, '有位居民'));
  else
    notification_content := format('%s 等 %s 位居民喜欢了你留下的评论。', coalesce(latest_actor_name, '有位居民'), active_count);
  end if;

  insert into public.notifications (
    user_id,
    title,
    content,
    type,
    is_read,
    deleted_at,
    actor_id,
    post_id,
    comment_id,
    actor_count,
    recent_actor_ids,
    last_activity_at
  )
  values (
    target_author_id,
    '有人喜欢了你的留言',
    notification_content,
    'like',
    false,
    null,
    recent_actors[1],
    target_post_id,
    new.comment_id,
    active_count,
    recent_actors,
    now()
  )
  on conflict (user_id, type, comment_id)
    where type = 'like' and comment_id is not null
  do update
  set content = excluded.content,
      actor_id = excluded.actor_id,
      post_id = excluded.post_id,
      actor_count = excluded.actor_count,
      recent_actor_ids = excluded.recent_actor_ids,
      last_activity_at = excluded.last_activity_at,
      deleted_at = null,
      is_read = case
        when is_activation then false
        else public.notifications.is_read
      end;

  return new;
end;
$$;

drop trigger if exists post_like_notification_sync on public.post_likes;
create trigger post_like_notification_sync
after insert or update of is_active on public.post_likes
for each row execute function private.sync_post_like_notification();

drop trigger if exists comment_like_notification_sync on public.comment_likes;
create trigger comment_like_notification_sync
after insert or update of is_active on public.comment_likes
for each row execute function private.sync_comment_like_notification();

create or replace function private.on_comment_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  author_name text;
  post_title text;
  post_type text;
  notification_type text;
  notification_title text;
begin
  perform private.add_growth(new.author_id, null, 0.01, 0, 'write_comment');
  perform private.award_badge_if_earned(new.author_id, '温柔来信');

  select p.title, p.type
  into post_title, post_type
  from public.posts p
  where p.id = new.post_id;

  if new.parent_id is not null then
    select c.author_id
    into recipient_id
    from public.comments c
    where c.id = new.parent_id;

    notification_type := 'reply';
    notification_title := '有人回复了你的评论';
  else
    select p.author_id
    into recipient_id
    from public.posts p
    where p.id = new.post_id;

    notification_type := 'comment';
    notification_title := format(
      '有人评论了你的%s',
      case post_type when 'article' then '文章' when 'diary' then '日记' else '内容' end
    );
  end if;

  if recipient_id is not null and recipient_id <> new.author_id then
    select coalesce(p.username, '有位居民')
    into author_name
    from public.profiles p
    where p.id = new.author_id;

    insert into public.notifications (
      user_id,
      title,
      content,
      type,
      actor_id,
      post_id,
      comment_id,
      actor_count,
      recent_actor_ids,
      last_activity_at
    )
    values (
      recipient_id,
      notification_title,
      format(
        '%s：%s%s',
        coalesce(author_name, '有位居民'),
        left(new.content, 120),
        case when post_title is null then '' else format('（《%s》）', post_title) end
      ),
      notification_type,
      new.author_id,
      new.post_id,
      new.id,
      1,
      array[new.author_id],
      now()
    )
    on conflict (user_id, type, comment_id)
      where type in ('comment', 'reply') and comment_id is not null
    do nothing;
  end if;

  return new;
end;
$$;

revoke update on public.notifications from anon, authenticated;
grant update (is_read, is_starred, is_important, deleted_at)
on public.notifications to authenticated;

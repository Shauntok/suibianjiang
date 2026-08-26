begin;

create table public.comment_moderation_keywords (
  id bigint generated always as identity primary key,
  keyword text not null,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comment_moderation_keywords_keyword_check check (
    char_length(btrim(keyword)) between 1 and 64
  )
);

create unique index comment_moderation_keywords_normalized_idx
on public.comment_moderation_keywords (lower(btrim(keyword)));

create table public.comment_moderation_flags (
  comment_id uuid primary key references public.comments(id) on delete cascade,
  matched_keywords text[] not null,
  status text not null default 'pending',
  detected_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint comment_moderation_flags_keywords_check check (
    cardinality(matched_keywords) > 0
  ),
  constraint comment_moderation_flags_status_check check (
    status in ('pending', 'cleared')
  ),
  constraint comment_moderation_flags_review_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status = 'cleared' and reviewed_by is not null and reviewed_at is not null)
  )
);

create index comment_moderation_flags_pending_idx
on public.comment_moderation_flags (status, detected_at desc);

alter table public.comment_moderation_keywords enable row level security;
alter table public.comment_moderation_flags enable row level security;

create policy "Admin team can read comment moderation keywords"
on public.comment_moderation_keywords for select to authenticated
using ((select private.is_admin_role()));

create policy "Owners and admins can create comment moderation keywords"
on public.comment_moderation_keywords for insert to authenticated
with check (
  (select private.is_owner_or_admin())
  and created_by = (select auth.uid())
);

create policy "Owners and admins can update comment moderation keywords"
on public.comment_moderation_keywords for update to authenticated
using ((select private.is_owner_or_admin()))
with check ((select private.is_owner_or_admin()));

create policy "Owners and admins can delete comment moderation keywords"
on public.comment_moderation_keywords for delete to authenticated
using ((select private.is_owner_or_admin()));

create policy "Admin team can read comment moderation flags"
on public.comment_moderation_flags for select to authenticated
using ((select private.is_admin_role()));

create policy "Admin team can review comment moderation flags"
on public.comment_moderation_flags for update to authenticated
using ((select private.is_admin_role()))
with check (
  (select private.is_admin_role())
  and status = 'cleared'
  and reviewed_by = (select auth.uid())
  and reviewed_at is not null
);

revoke all on table
  public.comment_moderation_keywords,
  public.comment_moderation_flags
from public, anon, authenticated;

grant select on table
  public.comment_moderation_keywords,
  public.comment_moderation_flags
to authenticated;

grant insert, update, delete on table
  public.comment_moderation_keywords
to authenticated;

grant update on table public.comment_moderation_flags to authenticated;
grant usage, select on sequence public.comment_moderation_keywords_id_seq to authenticated;

grant select, insert, update, delete on table
  public.comment_moderation_keywords,
  public.comment_moderation_flags
to service_role;

grant usage, select on sequence public.comment_moderation_keywords_id_seq to service_role;

create or replace function private.match_comment_moderation_keywords(comment_content text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_agg(k.keyword order by char_length(k.keyword) desc, k.keyword),
    '{}'::text[]
  )
  from public.comment_moderation_keywords k
  where k.is_active
    and strpos(lower(coalesce(comment_content, '')), lower(btrim(k.keyword))) > 0;
$$;

create or replace function private.sync_comment_moderation(
  target_comment_id uuid,
  comment_content text,
  comment_hidden boolean,
  comment_deleted boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  matches text[];
begin
  if comment_hidden or comment_deleted then
    delete from public.comment_moderation_flags
    where comment_id = target_comment_id;
    return false;
  end if;

  matches := private.match_comment_moderation_keywords(comment_content);

  if cardinality(matches) = 0 then
    delete from public.comment_moderation_flags
    where comment_id = target_comment_id;
    return false;
  end if;

  insert into public.comment_moderation_flags (
    comment_id,
    matched_keywords,
    status,
    detected_at,
    reviewed_by,
    reviewed_at,
    updated_at
  ) values (
    target_comment_id,
    matches,
    'pending',
    now(),
    null,
    null,
    now()
  )
  on conflict (comment_id) do update
  set matched_keywords = excluded.matched_keywords,
      status = 'pending',
      detected_at = now(),
      reviewed_by = null,
      reviewed_at = null,
      updated_at = now();

  return true;
end;
$$;

create or replace function private.on_comment_moderation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_comment_moderation(
    new.id,
    new.content,
    new.is_hidden,
    new.is_deleted
  );
  return new;
end;
$$;

drop trigger if exists comment_moderation_changed on public.comments;
create trigger comment_moderation_changed
after insert or update of content, is_hidden, is_deleted on public.comments
for each row execute function private.on_comment_moderation_change();

create or replace function public.rescan_comment_moderation()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  comment_row record;
  pending_count integer := 0;
begin
  if not private.is_owner_or_admin() then
    raise exception 'Only owners and admins can rescan comment moderation'
      using errcode = '42501';
  end if;

  for comment_row in
    select id, content, is_hidden, is_deleted
    from public.comments
  loop
    if private.sync_comment_moderation(
      comment_row.id,
      comment_row.content,
      comment_row.is_hidden,
      comment_row.is_deleted
    ) then
      pending_count := pending_count + 1;
    end if;
  end loop;

  return pending_count;
end;
$$;

revoke all on function private.match_comment_moderation_keywords(text)
from public, anon, authenticated;
revoke all on function private.sync_comment_moderation(uuid, text, boolean, boolean)
from public, anon, authenticated;
revoke all on function private.on_comment_moderation_change()
from public, anon, authenticated;

revoke all on function public.rescan_comment_moderation()
from public, anon;
grant execute on function public.rescan_comment_moderation() to authenticated;

commit;

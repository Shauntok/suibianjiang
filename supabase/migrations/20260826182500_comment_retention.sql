begin;

alter table public.comments
add column deleted_at timestamptz;

update public.comments
set deleted_at = coalesce(updated_at, now())
where is_deleted = true
  and deleted_at is null;

create index comments_deleted_at_idx
on public.comments (deleted_at)
where is_deleted = true and deleted_at is not null;

alter table public.comments
drop constraint comments_parent_id_fkey;

alter table public.comments
add constraint comments_parent_id_fkey
foreign key (parent_id)
references public.comments(id)
on delete set null;

create or replace function private.sync_comment_deleted_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_deleted then
      new.deleted_at := now();
    else
      new.deleted_at := null;
    end if;
    return new;
  end if;

  if new.is_deleted then
    if not old.is_deleted then
      new.deleted_at := now();
    else
      new.deleted_at := old.deleted_at;
    end if;
  else
    new.deleted_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_comment_deleted_at on public.comments;
create trigger sync_comment_deleted_at
before insert or update of is_deleted, deleted_at on public.comments
for each row execute function private.sync_comment_deleted_at();

revoke all on function private.sync_comment_deleted_at()
from public, anon, authenticated;

comment on column public.comments.deleted_at is
'Soft-delete timestamp. Eligible for permanent deletion after 30 days.';

commit;

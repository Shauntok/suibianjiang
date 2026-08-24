begin;

drop policy if exists "Public can read active announcements" on public.announcements;
create policy "Anonymous can read active announcements"
on public.announcements for select to anon
using (is_active = true);
create policy "Authenticated can read announcements"
on public.announcements for select to authenticated
using (is_active = true or private.is_admin_role());

drop policy if exists "Comments can be read safely" on public.comments;
create policy "Anonymous can read visible comments"
on public.comments for select to anon
using (is_deleted = false and is_hidden = false);
create policy "Authenticated can read comments safely"
on public.comments for select to authenticated
using (
  (is_deleted = false and is_hidden = false)
  or author_id = (select auth.uid())
  or private.is_admin_role()
);

drop policy if exists "Posts can be read safely" on public.posts;
create policy "Anonymous can read published posts"
on public.posts for select to anon
using (status = 'published' and visibility in ('public', 'unlisted') and deleted_at is null);
create policy "Authenticated can read posts safely"
on public.posts for select to authenticated
using (
  (status = 'published' and visibility in ('public', 'unlisted') and deleted_at is null)
  or author_id = (select auth.uid())
  or private.is_admin_role()
);

drop policy if exists "Anyone can read visible room messages" on public.room_messages;
create policy "Anonymous can read visible room messages"
on public.room_messages for select to anon
using (is_deleted = false and is_hidden = false);
create policy "Authenticated can read room messages safely"
on public.room_messages for select to authenticated
using (
  (is_deleted = false and is_hidden = false)
  or author_id = (select auth.uid())
  or private.is_admin_role()
);

commit;

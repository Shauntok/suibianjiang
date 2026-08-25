drop policy if exists "Public can read active comment likes" on public.comment_likes;
drop policy if exists "Users can read own comment likes" on public.comment_likes;

create policy "Anonymous can read active comment likes"
on public.comment_likes
for select
to anon
using (is_active = true);

create policy "Authenticated can read active or own comment likes"
on public.comment_likes
for select
to authenticated
using (is_active = true or (select auth.uid()) = user_id);

drop policy if exists "Public can read active post likes" on public.post_likes;
drop policy if exists "Users can read own post likes" on public.post_likes;

create policy "Anonymous can read active post likes"
on public.post_likes
for select
to anon
using (is_active = true);

create policy "Authenticated can read active or own post likes"
on public.post_likes
for select
to authenticated
using (is_active = true or (select auth.uid()) = user_id);

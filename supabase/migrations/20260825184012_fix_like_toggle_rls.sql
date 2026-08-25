drop policy if exists "Users can read own comment likes" on public.comment_likes;

create policy "Users can read own comment likes"
on public.comment_likes
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can update own comment likes" on public.comment_likes;

create policy "Users can update own comment likes"
on public.comment_likes
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read own post likes" on public.post_likes;

create policy "Users can read own post likes"
on public.post_likes
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can update own likes" on public.post_likes;

create policy "Users can update own likes"
on public.post_likes
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index notifications_actor_id_idx
on public.notifications (actor_id)
where actor_id is not null;

create index notifications_post_id_idx
on public.notifications (post_id)
where post_id is not null;

create index notifications_comment_id_idx
on public.notifications (comment_id)
where comment_id is not null;

drop policy if exists "Users can read own notifications"
on public.notifications;
create policy "Users can read own notifications"
on public.notifications
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can update own notifications"
on public.notifications;
create policy "Users can update own notifications"
on public.notifications
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

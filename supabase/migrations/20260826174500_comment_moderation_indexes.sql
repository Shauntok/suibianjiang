begin;

create index comment_moderation_keywords_created_by_idx
on public.comment_moderation_keywords (created_by);

create index comment_moderation_flags_reviewed_by_idx
on public.comment_moderation_flags (reviewed_by)
where reviewed_by is not null;

commit;

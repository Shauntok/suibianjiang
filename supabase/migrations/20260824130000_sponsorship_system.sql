begin;

create table public.sponsor_settings (
  id boolean primary key default true,
  commercial_enabled boolean not null default false,
  placement_enabled jsonb not null default '{
    "home_wide": false,
    "space_wide": false,
    "article_inline": false,
    "diary_inline": false,
    "article_after": false,
    "diary_after": false,
    "desktop_left": false,
    "desktop_right": false
  }'::jsonb,
  minimum_paragraphs integer not null default 8,
  minimum_characters integer not null default 1200,
  max_ads_per_page integer not null default 2,
  eligible_probability integer not null default 60,
  cooldown_page_views integer not null default 2,
  max_ad_pages_per_ten integer not null default 4,
  placement_priority text[] not null default array[
    'article_inline',
    'diary_inline',
    'article_after',
    'diary_after',
    'desktop_left',
    'desktop_right',
    'home_wide',
    'space_wide'
  ],
  timezone text not null default 'Asia/Kuala_Lumpur',
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_settings_singleton_check check (id),
  constraint sponsor_settings_minimum_paragraphs_check
    check (minimum_paragraphs >= 0),
  constraint sponsor_settings_minimum_characters_check
    check (minimum_characters >= 0),
  constraint sponsor_settings_max_ads_per_page_check
    check (max_ads_per_page between 0 and 3),
  constraint sponsor_settings_eligible_probability_check
    check (eligible_probability between 0 and 100),
  constraint sponsor_settings_cooldown_page_views_check
    check (cooldown_page_views between 0 and 20),
  constraint sponsor_settings_max_ad_pages_per_ten_check
    check (max_ad_pages_per_ten between 0 and 10),
  constraint sponsor_settings_placement_enabled_check check (
    case
      when jsonb_typeof(placement_enabled) = 'object' then
        placement_enabled ?& array[
          'home_wide',
          'space_wide',
          'article_inline',
          'diary_inline',
          'article_after',
          'diary_after',
          'desktop_left',
          'desktop_right'
        ]::text[]
        and placement_enabled - array[
          'home_wide',
          'space_wide',
          'article_inline',
          'diary_inline',
          'article_after',
          'diary_after',
          'desktop_left',
          'desktop_right'
        ]::text[] = '{}'::jsonb
        and jsonb_typeof(placement_enabled -> 'home_wide') = 'boolean'
        and jsonb_typeof(placement_enabled -> 'space_wide') = 'boolean'
        and jsonb_typeof(placement_enabled -> 'article_inline') = 'boolean'
        and jsonb_typeof(placement_enabled -> 'diary_inline') = 'boolean'
        and jsonb_typeof(placement_enabled -> 'article_after') = 'boolean'
        and jsonb_typeof(placement_enabled -> 'diary_after') = 'boolean'
        and jsonb_typeof(placement_enabled -> 'desktop_left') = 'boolean'
        and jsonb_typeof(placement_enabled -> 'desktop_right') = 'boolean'
      else false
    end
  ),
  constraint sponsor_settings_placement_priority_check check (
    cardinality(placement_priority) = 8
    and array_position(placement_priority, null) is null
    and placement_priority <@ array[
      'home_wide',
      'space_wide',
      'article_inline',
      'diary_inline',
      'article_after',
      'diary_after',
      'desktop_left',
      'desktop_right'
    ]::text[]
    and array[
      'home_wide',
      'space_wide',
      'article_inline',
      'diary_inline',
      'article_after',
      'diary_after',
      'desktop_left',
      'desktop_right'
    ]::text[] <@ placement_priority
  ),
  constraint sponsor_settings_timezone_check check (btrim(timezone) <> '')
);

create table public.sponsor_campaigns (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null,
  partner_name text not null,
  public_title text not null,
  description text not null,
  destination_url text not null,
  state text not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  weight integer not null default 100,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_campaigns_internal_name_check check (btrim(internal_name) <> ''),
  constraint sponsor_campaigns_partner_name_check check (btrim(partner_name) <> ''),
  constraint sponsor_campaigns_public_title_check check (btrim(public_title) <> ''),
  constraint sponsor_campaigns_description_check check (btrim(description) <> ''),
  constraint sponsor_campaigns_destination_url_check check (
    destination_url ~* '^https?://[^[:space:]]+$'
  ),
  constraint sponsor_campaigns_state_check check (
    state in ('draft', 'published', 'paused', 'archived')
  ),
  constraint sponsor_campaigns_schedule_check check (ends_at > starts_at),
  constraint sponsor_campaigns_weight_check check (weight between 1 and 1000)
);

create table public.sponsor_campaign_placements (
  campaign_id uuid not null references public.sponsor_campaigns(id) on delete cascade,
  placement text not null,
  image_path text not null,
  alt_text text not null,
  enabled boolean not null default false,
  public_title text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, placement),
  constraint sponsor_campaign_placements_placement_check check (
    placement in (
      'home_wide',
      'space_wide',
      'article_inline',
      'diary_inline',
      'article_after',
      'diary_after',
      'desktop_left',
      'desktop_right'
    )
  ),
  constraint sponsor_campaign_placements_image_path_check check (
    btrim(image_path) <> ''
    and image_path ~ (
      '^sponsors/'
      || campaign_id::text
      || '/'
      || placement
      || '/[^/]+$'
    )
  ),
  constraint sponsor_campaign_placements_alt_text_check check (btrim(alt_text) <> ''),
  constraint sponsor_campaign_placements_public_title_check check (
    public_title is null or btrim(public_title) <> ''
  ),
  constraint sponsor_campaign_placements_description_check check (
    description is null or btrim(description) <> ''
  )
);

create table public.sponsor_daily_stats (
  stat_date date not null default ((now() at time zone 'Asia/Kuala_Lumpur')::date),
  campaign_id uuid not null references public.sponsor_campaigns(id),
  placement text not null,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (stat_date, campaign_id, placement),
  constraint sponsor_daily_stats_placement_check check (
    placement in (
      'home_wide',
      'space_wide',
      'article_inline',
      'diary_inline',
      'article_after',
      'diary_after',
      'desktop_left',
      'desktop_right'
    )
  ),
  constraint sponsor_daily_stats_impressions_check check (impressions >= 0),
  constraint sponsor_daily_stats_clicks_check check (clicks >= 0)
);

create table private.sponsor_metric_tokens (
  token_hash text primary key,
  campaign_id uuid not null,
  placement text not null,
  expires_at timestamptz not null,
  impression_counted boolean not null default false,
  click_counted boolean not null default false,
  constraint sponsor_metric_tokens_campaign_placement_fkey
    foreign key (campaign_id, placement)
    references public.sponsor_campaign_placements(campaign_id, placement)
    on delete cascade,
  constraint sponsor_metric_tokens_token_hash_check check (btrim(token_hash) <> ''),
  constraint sponsor_metric_tokens_placement_check check (
    placement in (
      'home_wide',
      'space_wide',
      'article_inline',
      'diary_inline',
      'article_after',
      'diary_after',
      'desktop_left',
      'desktop_right'
    )
  )
);

create index sponsor_campaigns_state_schedule_idx
on public.sponsor_campaigns (state, starts_at, ends_at);

create index sponsor_campaign_placements_campaign_idx
on public.sponsor_campaign_placements (campaign_id);

create index sponsor_daily_stats_campaign_date_idx
on public.sponsor_daily_stats (campaign_id, stat_date desc);

create index sponsor_metric_tokens_expires_at_idx
on private.sponsor_metric_tokens (expires_at);

alter table public.sponsor_settings enable row level security;
alter table public.sponsor_campaigns enable row level security;
alter table public.sponsor_campaign_placements enable row level security;
alter table public.sponsor_daily_stats enable row level security;
alter table private.sponsor_metric_tokens enable row level security;

create policy "Owners and admins can read sponsor settings"
on public.sponsor_settings for select to authenticated
using ((select private.is_owner_or_admin()));

create policy "Owners and admins can update sponsor settings"
on public.sponsor_settings for update to authenticated
using ((select private.is_owner_or_admin()))
with check ((select private.is_owner_or_admin()));

create policy "Owners and admins can read sponsor campaigns"
on public.sponsor_campaigns for select to authenticated
using ((select private.is_owner_or_admin()));

create policy "Owners and admins can create sponsor campaigns"
on public.sponsor_campaigns for insert to authenticated
with check ((select private.is_owner_or_admin()));

create policy "Owners and admins can update sponsor campaigns"
on public.sponsor_campaigns for update to authenticated
using ((select private.is_owner_or_admin()))
with check ((select private.is_owner_or_admin()));

create policy "Owners and admins can delete sponsor campaigns"
on public.sponsor_campaigns for delete to authenticated
using ((select private.is_owner_or_admin()));

create policy "Owners and admins can read sponsor placements"
on public.sponsor_campaign_placements for select to authenticated
using ((select private.is_owner_or_admin()));

create policy "Owners and admins can create sponsor placements"
on public.sponsor_campaign_placements for insert to authenticated
with check ((select private.is_owner_or_admin()));

create policy "Owners and admins can update sponsor placements"
on public.sponsor_campaign_placements for update to authenticated
using ((select private.is_owner_or_admin()))
with check ((select private.is_owner_or_admin()));

create policy "Owners and admins can delete sponsor placements"
on public.sponsor_campaign_placements for delete to authenticated
using ((select private.is_owner_or_admin()));

create policy "Owners and admins can read sponsor stats"
on public.sponsor_daily_stats for select to authenticated
using ((select private.is_owner_or_admin()));

revoke all on table
  public.sponsor_settings,
  public.sponsor_campaigns,
  public.sponsor_campaign_placements,
  public.sponsor_daily_stats
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.sponsor_settings,
  public.sponsor_campaigns,
  public.sponsor_campaign_placements,
  public.sponsor_daily_stats
to service_role;

revoke all on table private.sponsor_metric_tokens
from public, anon, authenticated;

grant usage on schema private to service_role;
grant select, insert, update, delete on table private.sponsor_metric_tokens
to service_role;

create policy "Owners and admins can upload sponsor images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'sponsors'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] in (
    'home_wide',
    'space_wide',
    'article_inline',
    'diary_inline',
    'article_after',
    'diary_after',
    'desktop_left',
    'desktop_right'
  )
  and private.is_owner_or_admin()
);

create policy "Owners and admins can update sponsor images"
on storage.objects for update to authenticated
using (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'sponsors'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] in (
    'home_wide',
    'space_wide',
    'article_inline',
    'diary_inline',
    'article_after',
    'diary_after',
    'desktop_left',
    'desktop_right'
  )
  and private.is_owner_or_admin()
)
with check (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'sponsors'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] in (
    'home_wide',
    'space_wide',
    'article_inline',
    'diary_inline',
    'article_after',
    'diary_after',
    'desktop_left',
    'desktop_right'
  )
  and private.is_owner_or_admin()
);

create policy "Owners and admins can delete sponsor images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'sponsors'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] in (
    'home_wide',
    'space_wide',
    'article_inline',
    'diary_inline',
    'article_after',
    'diary_after',
    'desktop_left',
    'desktop_right'
  )
  and private.is_owner_or_admin()
);

insert into public.sponsor_settings (id)
values (true)
on conflict (id) do nothing;

commit;

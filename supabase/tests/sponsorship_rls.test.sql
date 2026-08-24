begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

-- Stable identities keep auth.uid() and profile-role checks deterministic.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'sponsor-owner-test@ourlittleage.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"sponsor_owner_test"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'sponsor-admin-test@ourlittleage.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"sponsor_admin_test"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'sponsor-moderator-test@ourlittleage.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"sponsor_moderator_test"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'sponsor-resident-test@ourlittleage.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"sponsor_resident_test"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.profiles (id, username, role)
values
  ('a0000000-0000-0000-0000-000000000001', 'sponsor_owner_test', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', 'sponsor_admin_test', 'admin'),
  ('a0000000-0000-0000-0000-000000000003', 'sponsor_moderator_test', 'moderator'),
  ('a0000000-0000-0000-0000-000000000004', 'sponsor_resident_test', 'user')
on conflict (id) do update
set username = excluded.username,
    role = excluded.role;

select has_table('public', 'sponsor_settings', 'sponsor settings table exists');
select has_table('public', 'sponsor_campaigns', 'sponsor campaigns table exists');
select has_table(
  'public',
  'sponsor_campaign_placements',
  'sponsor campaign placements table exists'
);
select has_table('public', 'sponsor_daily_stats', 'sponsor daily stats table exists');
select has_table(
  'private',
  'sponsor_metric_tokens',
  'private sponsor metric tokens table exists'
);

select results_eq(
  $$
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'sponsor_settings',
        'sponsor_campaigns',
        'sponsor_campaign_placements',
        'sponsor_daily_stats'
      )
    order by c.relname
  $$,
  $$ values (true), (true), (true), (true) $$,
  'RLS is enabled on every public sponsorship table'
);

select is(
  (
    select jsonb_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'sponsor_metric_tokens'
  ),
  '[
    "token_hash",
    "campaign_id",
    "placement",
    "expires_at",
    "impression_counted",
    "click_counted"
  ]'::jsonb,
  'private metric tokens contain only aggregate-token fields'
);

select has_index(
  'public',
  'sponsor_campaigns',
  'sponsor_campaigns_state_schedule_idx',
  'campaign state and schedule index exists'
);
select has_index(
  'public',
  'sponsor_campaign_placements',
  'sponsor_campaign_placements_campaign_idx',
  'placement campaign join index exists'
);
select has_index(
  'public',
  'sponsor_daily_stats',
  'sponsor_daily_stats_campaign_date_idx',
  'daily stats campaign and date index exists'
);
select has_index(
  'private',
  'sponsor_metric_tokens',
  'sponsor_metric_tokens_expires_at_idx',
  'metric token expiry index exists'
);

select is(
  (
    select jsonb_build_array(
      commercial_enabled,
      minimum_paragraphs,
      minimum_characters,
      max_ads_per_page,
      eligible_probability,
      cooldown_page_views,
      max_ad_pages_per_ten,
      timezone
    )
    from public.sponsor_settings
    where id
  ),
  '[false, 8, 1200, 2, 60, 2, 4, "Asia/Kuala_Lumpur"]'::jsonb,
  'sponsor singleton uses the approved safe defaults'
);

select results_eq(
  $$
    select
      jsonb_typeof(placement_enabled) = 'object'
      and placement_enabled ?& array[
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
      and placement_enabled -> 'home_wide' = 'false'::jsonb
      and placement_enabled -> 'space_wide' = 'false'::jsonb
      and placement_enabled -> 'article_inline' = 'false'::jsonb
      and placement_enabled -> 'diary_inline' = 'false'::jsonb
      and placement_enabled -> 'article_after' = 'false'::jsonb
      and placement_enabled -> 'diary_after' = 'false'::jsonb
      and placement_enabled -> 'desktop_left' = 'false'::jsonb
      and placement_enabled -> 'desktop_right' = 'false'::jsonb
    from public.sponsor_settings
    where id
  $$,
  $$ values (true) $$,
  'every seeded placement switch is false'
);

select lives_ok(
  $$
    update public.sponsor_settings
    set placement_enabled = placement_enabled || '{"home_wide":true}'::jsonb
    where id
  $$,
  'a placement switch can be enabled'
);
select results_eq(
  $$ select placement_enabled -> 'home_wide' from public.sponsor_settings where id $$,
  $$ values ('true'::jsonb) $$,
  'enabled placement switch stores a JSON true value'
);
select lives_ok(
  $$
    update public.sponsor_settings
    set placement_enabled = placement_enabled || '{"home_wide":false}'::jsonb
    where id
  $$,
  'a placement switch can be disabled again'
);

select is(
  (select to_jsonb(placement_priority) from public.sponsor_settings where id),
  '[
    "article_inline",
    "diary_inline",
    "article_after",
    "diary_after",
    "desktop_left",
    "desktop_right",
    "home_wide",
    "space_wide"
  ]'::jsonb,
  'placement priority uses the approved complete ordering'
);

select throws_ok(
  $$ update public.sponsor_settings set minimum_paragraphs = -1 where id $$,
  '23514',
  null,
  'minimum paragraphs cannot be negative'
);
select throws_ok(
  $$ update public.sponsor_settings set minimum_characters = -1 where id $$,
  '23514',
  null,
  'minimum characters cannot be negative'
);
select throws_ok(
  $$ update public.sponsor_settings set max_ads_per_page = 4 where id $$,
  '23514',
  null,
  'page ad limit cannot exceed three'
);
select throws_ok(
  $$ update public.sponsor_settings set eligible_probability = 101 where id $$,
  '23514',
  null,
  'eligible probability cannot exceed one hundred'
);
select throws_ok(
  $$ update public.sponsor_settings set cooldown_page_views = 21 where id $$,
  '23514',
  null,
  'cooldown cannot exceed twenty page views'
);
select throws_ok(
  $$ update public.sponsor_settings set max_ad_pages_per_ten = 11 where id $$,
  '23514',
  null,
  'ad pages per ten cannot exceed ten'
);
select throws_ok(
  $$
    update public.sponsor_settings
    set placement_enabled = placement_enabled - 'desktop_right'
    where id
  $$,
  '23514',
  null,
  'placement switch JSON cannot omit an approved placement'
);
select throws_ok(
  $$
    update public.sponsor_settings
    set placement_enabled = placement_enabled || '{"unknown":false}'::jsonb
    where id
  $$,
  '23514',
  null,
  'placement switch JSON cannot contain unknown placements'
);
select throws_ok(
  $$ update public.sponsor_settings set placement_enabled = '[]'::jsonb where id $$,
  '23514',
  null,
  'placement switches must be a JSON object'
);
select throws_ok(
  $$
    update public.sponsor_settings
    set placement_enabled = jsonb_set(placement_enabled, '{home_wide}', '"false"'::jsonb)
    where id
  $$,
  '23514',
  null,
  'placement switches must be JSON booleans'
);
select throws_ok(
  $$
    update public.sponsor_settings
    set placement_priority = array[
      'article_inline',
      'article_inline',
      'article_after',
      'diary_after',
      'desktop_left',
      'desktop_right',
      'home_wide',
      'space_wide'
    ]
    where id
  $$,
  '23514',
  null,
  'placement priority cannot contain duplicates'
);
select throws_ok(
  $$
    update public.sponsor_settings
    set placement_priority = array[
      'article_inline',
      'diary_inline',
      'article_after',
      'diary_after',
      'desktop_left',
      'desktop_right',
      'home_wide',
      'footer_banner'
    ]
    where id
  $$,
  '23514',
  null,
  'placement priority rejects unsupported placements'
);

select lives_ok(
  $$
    insert into public.sponsor_campaigns (
      id,
      internal_name,
      partner_name,
      public_title,
      description,
      destination_url,
      state,
      starts_at,
      ends_at,
      weight,
      created_by,
      updated_by
    )
    values (
      'c0000000-0000-0000-0000-000000000001',
      'fixture campaign',
      'fixture partner',
      'fixture title',
      'fixture description',
      'https://partner.example/fixture',
      'published',
      '2026-08-25 00:00:00+00',
      '2026-09-01 00:00:00+00',
      100,
      'a0000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001'
    )
  $$,
  'valid campaign fixture can be created'
);

select throws_ok(
  $$
    insert into public.sponsor_campaigns (
      internal_name, partner_name, public_title, description,
      destination_url, state, starts_at, ends_at, weight, created_by, updated_by
    ) values (
      'invalid state', 'partner', 'title', 'description',
      'https://partner.example', 'live', now(), now() + interval '1 day', 100,
      'a0000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001'
    )
  $$,
  '23514',
  null,
  'campaign state is exhaustive'
);
select throws_ok(
  $$
    insert into public.sponsor_campaigns (
      internal_name, partner_name, public_title, description,
      destination_url, state, starts_at, ends_at, weight, created_by, updated_by
    ) values (
      'unsafe URL', 'partner', 'title', 'description',
      'javascript:alert(1)', 'draft', now(), now() + interval '1 day', 100,
      'a0000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001'
    )
  $$,
  '23514',
  null,
  'campaign URL only allows HTTP or HTTPS'
);
select throws_ok(
  $$
    insert into public.sponsor_campaigns (
      internal_name, partner_name, public_title, description,
      destination_url, state, starts_at, ends_at, weight, created_by, updated_by
    ) values (
      'bad schedule', 'partner', 'title', 'description',
      'https://partner.example', 'draft', now(), now(), 100,
      'a0000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001'
    )
  $$,
  '23514',
  null,
  'campaign end must be after start'
);
select throws_ok(
  $$
    insert into public.sponsor_campaigns (
      internal_name, partner_name, public_title, description,
      destination_url, state, starts_at, ends_at, weight, created_by, updated_by
    ) values (
      'zero weight', 'partner', 'title', 'description',
      'https://partner.example', 'draft', now(), now() + interval '1 day', 0,
      'a0000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001'
    )
  $$,
  '23514',
  null,
  'campaign weight must be positive'
);
select throws_ok(
  $$
    insert into public.sponsor_campaigns (
      internal_name, partner_name, public_title, description,
      destination_url, state, starts_at, ends_at, weight, created_by, updated_by
    ) values (
      'heavy weight', 'partner', 'title', 'description',
      'https://partner.example', 'draft', now(), now() + interval '1 day', 1001,
      'a0000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001'
    )
  $$,
  '23514',
  null,
  'campaign weight cannot exceed one thousand'
);

select throws_ok(
  $$
    insert into public.sponsor_campaign_placements (
      campaign_id, placement, image_path, alt_text
    ) values (
      'c0000000-0000-0000-0000-000000000001',
      'footer_banner',
      'sponsors/c0000000-0000-0000-0000-000000000001/footer_banner/banner.webp',
      'Partner banner'
    )
  $$,
  '23514',
  null,
  'campaign placements reject unsupported values'
);
select throws_ok(
  $$
    insert into public.sponsor_campaign_placements (
      campaign_id, placement, image_path, alt_text
    ) values (
      'c0000000-0000-0000-0000-000000000001',
      'article_inline',
      ' ',
      'Partner banner'
    )
  $$,
  '23514',
  null,
  'campaign placement image path cannot be empty'
);
select throws_ok(
  $$
    insert into public.sponsor_campaign_placements (
      campaign_id, placement, image_path, alt_text
    ) values (
      'c0000000-0000-0000-0000-000000000001',
      'article_inline',
      'sponsors/c0000000-0000-0000-0000-000000000001/article_inline/banner.webp',
      ' '
    )
  $$,
  '23514',
  null,
  'campaign placement alt text cannot be empty'
);
select throws_ok(
  $$
    insert into public.sponsor_campaign_placements (
      campaign_id, placement, image_path, alt_text
    ) values (
      'c0000000-0000-0000-0000-000000000001',
      'article_inline',
      'sponsors/ffffffff-ffff-ffff-ffff-ffffffffffff/article_inline/banner.webp',
      'Partner banner'
    )
  $$,
  '23514',
  null,
  'campaign placement path must match its campaign and placement'
);

select lives_ok(
  $$
    insert into public.sponsor_campaign_placements (
      campaign_id, placement, image_path, alt_text, enabled
    ) values (
      'c0000000-0000-0000-0000-000000000001',
      'home_wide',
      'sponsors/c0000000-0000-0000-0000-000000000001/home_wide/banner.webp',
      'Fixture campaign banner',
      true
    )
  $$,
  'valid campaign placement fixture can be created'
);
select throws_ok(
  $$
    insert into public.sponsor_campaign_placements (
      campaign_id, placement, image_path, alt_text
    ) values (
      'c0000000-0000-0000-0000-000000000001',
      'home_wide',
      'sponsors/c0000000-0000-0000-0000-000000000001/home_wide/duplicate.webp',
      'Duplicate fixture campaign banner'
    )
  $$,
  '23505',
  null,
  'a campaign can configure each placement only once'
);

select lives_ok(
  $$
    insert into public.sponsor_daily_stats (
      stat_date, campaign_id, placement, impressions, clicks
    ) values (
      '2026-08-24',
      'c0000000-0000-0000-0000-000000000001',
      'home_wide',
      10,
      1
    )
  $$,
  'valid daily stats fixture can be created'
);
select throws_ok(
  $$
    insert into public.sponsor_daily_stats (
      stat_date, campaign_id, placement, impressions, clicks
    ) values (
      '2026-08-24',
      'c0000000-0000-0000-0000-000000000001',
      'home_wide',
      0,
      0
    )
  $$,
  '23505',
  null,
  'daily stats are unique by date, campaign, and placement'
);

select throws_ok(
  $$
    insert into public.sponsor_daily_stats (
      stat_date, campaign_id, placement, impressions, clicks
    ) values (
      current_date,
      'c0000000-0000-0000-0000-000000000001',
      'footer_banner',
      0,
      0
    )
  $$,
  '23514',
  null,
  'daily stats reject unsupported placements'
);
select throws_ok(
  $$
    insert into public.sponsor_daily_stats (
      stat_date, campaign_id, placement, impressions, clicks
    ) values (
      current_date,
      'c0000000-0000-0000-0000-000000000001',
      'article_inline',
      -1,
      0
    )
  $$,
  '23514',
  null,
  'daily impressions cannot be negative'
);
select throws_ok(
  $$
    insert into public.sponsor_daily_stats (
      stat_date, campaign_id, placement, impressions, clicks
    ) values (
      current_date,
      'c0000000-0000-0000-0000-000000000001',
      'article_inline',
      0,
      -1
    )
  $$,
  '23514',
  null,
  'daily clicks cannot be negative'
);
select throws_ok(
  $$
    insert into private.sponsor_metric_tokens (
      token_hash, campaign_id, placement, expires_at
    ) values (
      'invalid-placement-token',
      'c0000000-0000-0000-0000-000000000001',
      'footer_banner',
      now() + interval '5 minutes'
    )
  $$,
  '23514',
  null,
  'private metric tokens reject unsupported placements'
);

select ok(
  not has_table_privilege('anon', 'public.sponsor_settings', 'SELECT')
  and not has_table_privilege('anon', 'public.sponsor_settings', 'INSERT')
  and not has_table_privilege('anon', 'public.sponsor_settings', 'UPDATE')
  and not has_table_privilege('anon', 'public.sponsor_settings', 'DELETE')
  and not has_table_privilege('authenticated', 'public.sponsor_settings', 'SELECT')
  and not has_table_privilege('authenticated', 'public.sponsor_settings', 'INSERT')
  and not has_table_privilege('authenticated', 'public.sponsor_settings', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.sponsor_settings', 'DELETE'),
  'client roles have no sponsor settings grants'
);
select ok(
  not has_table_privilege('anon', 'public.sponsor_campaigns', 'SELECT')
  and not has_table_privilege('anon', 'public.sponsor_campaigns', 'INSERT')
  and not has_table_privilege('anon', 'public.sponsor_campaigns', 'UPDATE')
  and not has_table_privilege('anon', 'public.sponsor_campaigns', 'DELETE')
  and not has_table_privilege('authenticated', 'public.sponsor_campaigns', 'SELECT')
  and not has_table_privilege('authenticated', 'public.sponsor_campaigns', 'INSERT')
  and not has_table_privilege('authenticated', 'public.sponsor_campaigns', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.sponsor_campaigns', 'DELETE'),
  'client roles have no sponsor campaign grants'
);
select ok(
  not has_table_privilege('anon', 'public.sponsor_campaign_placements', 'SELECT')
  and not has_table_privilege('anon', 'public.sponsor_campaign_placements', 'INSERT')
  and not has_table_privilege('anon', 'public.sponsor_campaign_placements', 'UPDATE')
  and not has_table_privilege('anon', 'public.sponsor_campaign_placements', 'DELETE')
  and not has_table_privilege('authenticated', 'public.sponsor_campaign_placements', 'SELECT')
  and not has_table_privilege('authenticated', 'public.sponsor_campaign_placements', 'INSERT')
  and not has_table_privilege('authenticated', 'public.sponsor_campaign_placements', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.sponsor_campaign_placements', 'DELETE'),
  'client roles have no sponsor placement grants'
);
select ok(
  not has_table_privilege('anon', 'public.sponsor_daily_stats', 'SELECT')
  and not has_table_privilege('anon', 'public.sponsor_daily_stats', 'INSERT')
  and not has_table_privilege('anon', 'public.sponsor_daily_stats', 'UPDATE')
  and not has_table_privilege('anon', 'public.sponsor_daily_stats', 'DELETE')
  and not has_table_privilege('authenticated', 'public.sponsor_daily_stats', 'SELECT')
  and not has_table_privilege('authenticated', 'public.sponsor_daily_stats', 'INSERT')
  and not has_table_privilege('authenticated', 'public.sponsor_daily_stats', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.sponsor_daily_stats', 'DELETE'),
  'client roles have no sponsor stats grants'
);
select ok(
  has_table_privilege('service_role', 'public.sponsor_settings', 'SELECT')
  and has_table_privilege('service_role', 'public.sponsor_settings', 'INSERT')
  and has_table_privilege('service_role', 'public.sponsor_settings', 'UPDATE')
  and has_table_privilege('service_role', 'public.sponsor_settings', 'DELETE'),
  'service role has explicit CRUD on sponsor settings'
);
select ok(
  has_table_privilege('service_role', 'public.sponsor_campaigns', 'SELECT')
  and has_table_privilege('service_role', 'public.sponsor_campaigns', 'INSERT')
  and has_table_privilege('service_role', 'public.sponsor_campaigns', 'UPDATE')
  and has_table_privilege('service_role', 'public.sponsor_campaigns', 'DELETE'),
  'service role has explicit CRUD on sponsor campaigns'
);
select ok(
  has_table_privilege('service_role', 'public.sponsor_campaign_placements', 'SELECT')
  and has_table_privilege('service_role', 'public.sponsor_campaign_placements', 'INSERT')
  and has_table_privilege('service_role', 'public.sponsor_campaign_placements', 'UPDATE')
  and has_table_privilege('service_role', 'public.sponsor_campaign_placements', 'DELETE'),
  'service role has explicit CRUD on sponsor placements'
);
select ok(
  has_table_privilege('service_role', 'public.sponsor_daily_stats', 'SELECT')
  and has_table_privilege('service_role', 'public.sponsor_daily_stats', 'INSERT')
  and has_table_privilege('service_role', 'public.sponsor_daily_stats', 'UPDATE')
  and has_table_privilege('service_role', 'public.sponsor_daily_stats', 'DELETE'),
  'service role has explicit CRUD on sponsor stats'
);
select ok(
  has_schema_privilege('service_role', 'private', 'USAGE')
  and has_table_privilege('service_role', 'private.sponsor_metric_tokens', 'SELECT')
  and has_table_privilege('service_role', 'private.sponsor_metric_tokens', 'INSERT')
  and has_table_privilege('service_role', 'private.sponsor_metric_tokens', 'UPDATE')
  and has_table_privilege('service_role', 'private.sponsor_metric_tokens', 'DELETE'),
  'service role has explicit access to private metric tokens'
);
select ok(
  not has_schema_privilege('anon', 'private', 'USAGE')
  and not has_table_privilege('anon', 'private.sponsor_metric_tokens', 'SELECT')
  and not has_table_privilege('authenticated', 'private.sponsor_metric_tokens', 'SELECT'),
  'browser roles cannot access private metric tokens'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select * from public.sponsor_settings $$,
  '42501',
  null,
  'owner browser role is denied by table grants'
);
select throws_ok(
  $$ update public.sponsor_daily_stats set impressions = impressions + 1 $$,
  '42501',
  null,
  'owner cannot update stats directly through browser grants'
);
select throws_ok(
  $$ select * from private.sponsor_metric_tokens $$,
  '42501',
  null,
  'owner cannot inspect private metric tokens'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select * from public.sponsor_campaigns $$,
  '42501',
  null,
  'admin browser role is denied by table grants'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select * from public.sponsor_campaigns $$,
  '42501',
  null,
  'moderator browser role is denied by table grants'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select * from public.sponsor_campaigns $$,
  '42501',
  null,
  'resident browser role is denied by table grants'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.sponsor_campaigns $$,
  '42501',
  null,
  'anonymous browser role is denied by table grants'
);
select throws_ok(
  $$ select * from private.sponsor_metric_tokens $$,
  '42501',
  null,
  'anonymous role cannot inspect private metric tokens'
);
reset role;

-- Temporary grants are rolled back with this test. They isolate and exercise the
-- defense-in-depth RLS policies even though production browser grants stay empty.
select lives_ok(
  $$
    grant select, insert, update, delete
    on table public.sponsor_settings,
      public.sponsor_campaigns,
      public.sponsor_campaign_placements,
      public.sponsor_daily_stats
    to authenticated
  $$,
  'test transaction can expose authenticated tables for RLS verification'
);
select lives_ok(
  $$
    grant select, insert, update, delete
    on table public.sponsor_settings,
      public.sponsor_campaigns,
      public.sponsor_campaign_placements,
      public.sponsor_daily_stats
    to anon
  $$,
  'test transaction can expose anonymous tables for RLS verification'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$ select * from public.sponsor_settings $$,
  'owner policy allows settings reads when the table grant exists'
);
select lives_ok(
  $$ update public.sponsor_settings set updated_by = auth.uid() where id $$,
  'owner policy allows settings updates when the table grant exists'
);
select lives_ok(
  $$
    insert into public.sponsor_campaigns (
      id, internal_name, partner_name, public_title, description,
      destination_url, state, starts_at, ends_at, created_by, updated_by
    ) values (
      'c0000000-0000-0000-0000-000000000010',
      'owner campaign', 'owner partner', 'owner title', 'owner description',
      'https://partner.example/owner', 'draft', now(), now() + interval '1 day',
      auth.uid(), auth.uid()
    )
  $$,
  'owner policy allows campaign creation'
);
select lives_ok(
  $$
    update public.sponsor_campaigns
    set state = 'paused', updated_by = auth.uid()
    where id = 'c0000000-0000-0000-0000-000000000010'
  $$,
  'owner policy allows campaign update execution'
);
select is(
  (
    select to_jsonb(state)
    from public.sponsor_campaigns
    where id = 'c0000000-0000-0000-0000-000000000010'
  ),
  '"paused"'::jsonb,
  'owner policy updates campaign state'
);
select is(
  (
    select to_jsonb(internal_name)
    from public.sponsor_campaigns
    where id = 'c0000000-0000-0000-0000-000000000010'
  ),
  '"owner campaign"'::jsonb,
  'owner policy allows campaign reads'
);
select lives_ok(
  $$
    insert into public.sponsor_campaign_placements (
      campaign_id, placement, image_path, alt_text, enabled
    ) values (
      'c0000000-0000-0000-0000-000000000010',
      'article_inline',
      'sponsors/c0000000-0000-0000-0000-000000000010/article_inline/banner.webp',
      'Owner campaign banner',
      true
    )
  $$,
  'owner policy allows campaign placement creation'
);
select lives_ok(
  $$
    update public.sponsor_campaign_placements
    set alt_text = 'Updated owner campaign banner'
    where campaign_id = 'c0000000-0000-0000-0000-000000000010'
      and placement = 'article_inline'
  $$,
  'owner policy allows campaign placement updates'
);
select lives_ok(
  $$
    delete from public.sponsor_campaign_placements
    where campaign_id = 'c0000000-0000-0000-0000-000000000010'
      and placement = 'article_inline'
  $$,
  'owner policy allows campaign placement deletion'
);
select lives_ok(
  $$
    delete from public.sponsor_campaigns
    where id = 'c0000000-0000-0000-0000-000000000010'
  $$,
  'owner policy allows campaign deletion'
);
select lives_ok(
  $$ select * from public.sponsor_daily_stats $$,
  'owner policy allows aggregate stats reads'
);
select is_empty(
  $$
    update public.sponsor_daily_stats
    set impressions = impressions + 1
    returning campaign_id
  $$,
  'owner RLS policy does not allow direct stats updates'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  $$ select * from public.sponsor_settings $$,
  'admin policy allows settings reads when the table grant exists'
);
select lives_ok(
  $$ update public.sponsor_settings set updated_by = auth.uid() where id $$,
  'admin policy allows settings updates when the table grant exists'
);
select lives_ok(
  $$
    insert into public.sponsor_campaigns (
      id, internal_name, partner_name, public_title, description,
      destination_url, state, starts_at, ends_at, created_by, updated_by
    ) values (
      'c0000000-0000-0000-0000-000000000020',
      'admin campaign', 'admin partner', 'admin title', 'admin description',
      'https://partner.example/admin', 'draft', now(), now() + interval '1 day',
      auth.uid(), auth.uid()
    )
  $$,
  'admin policy allows campaign creation'
);
select lives_ok(
  $$
    update public.sponsor_campaigns
    set state = 'published', updated_by = auth.uid()
    where id = 'c0000000-0000-0000-0000-000000000020'
  $$,
  'admin policy allows campaign update execution'
);
select is(
  (
    select to_jsonb(state)
    from public.sponsor_campaigns
    where id = 'c0000000-0000-0000-0000-000000000020'
  ),
  '"published"'::jsonb,
  'admin policy updates campaign state'
);
select is(
  (
    select to_jsonb(internal_name)
    from public.sponsor_campaigns
    where id = 'c0000000-0000-0000-0000-000000000020'
  ),
  '"admin campaign"'::jsonb,
  'admin policy allows campaign reads'
);
select lives_ok(
  $$
    delete from public.sponsor_campaigns
    where id = 'c0000000-0000-0000-0000-000000000020'
  $$,
  'admin policy allows campaign deletion'
);
select lives_ok(
  $$ select * from public.sponsor_daily_stats $$,
  'admin policy allows aggregate stats reads'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select is_empty(
  $$ select * from public.sponsor_settings $$,
  'moderator RLS policy cannot read sponsor settings'
);
select is_empty(
  $$ select * from public.sponsor_campaigns $$,
  'moderator RLS policy cannot read sponsor campaigns'
);
select throws_ok(
  $$
    insert into public.sponsor_campaigns (
      internal_name, partner_name, public_title, description,
      destination_url, state, starts_at, ends_at, created_by, updated_by
    ) values (
      'moderator campaign', 'partner', 'title', 'description',
      'https://partner.example', 'draft', now(), now() + interval '1 day',
      auth.uid(), auth.uid()
    )
  $$,
  '42501',
  null,
  'moderator RLS policy cannot create sponsor campaigns'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select is_empty(
  $$ select * from public.sponsor_campaigns $$,
  'resident RLS policy cannot read sponsor campaigns'
);
select throws_ok(
  $$
    insert into public.sponsor_campaigns (
      internal_name, partner_name, public_title, description,
      destination_url, state, starts_at, ends_at, created_by, updated_by
    ) values (
      'resident campaign', 'partner', 'title', 'description',
      'https://partner.example', 'draft', now(), now() + interval '1 day',
      auth.uid(), auth.uid()
    )
  $$,
  '42501',
  null,
  'resident RLS policy cannot create sponsor campaigns'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty(
  $$ select * from public.sponsor_campaigns $$,
  'anonymous RLS policy cannot read sponsor campaigns'
);
select throws_ok(
  $$
    insert into public.sponsor_campaigns (
      internal_name, partner_name, public_title, description,
      destination_url, state, starts_at, ends_at, created_by, updated_by
    ) values (
      'anonymous campaign', 'partner', 'title', 'description',
      'https://partner.example', 'draft', now(), now() + interval '1 day',
      'a0000000-0000-0000-0000-000000000004',
      'a0000000-0000-0000-0000-000000000004'
    )
  $$,
  '42501',
  null,
  'anonymous RLS policy cannot create sponsor campaigns'
);
reset role;

select lives_ok(
  $$ revoke all on table public.sponsor_settings,
    public.sponsor_campaigns,
    public.sponsor_campaign_placements,
    public.sponsor_daily_stats from anon, authenticated $$,
  'temporary public sponsorship grants are removed'
);

select results_eq(
  $$ select count(*)::bigint from storage.buckets where id = 'sponsors' $$,
  $$ values (0::bigint) $$,
  'migration does not create a sponsors bucket'
);
select is(
  (select to_jsonb(id::text) from storage.buckets where id = 'images' and public),
  '"images"'::jsonb,
  'existing public images bucket remains in use'
);
select is(
  (
    select jsonb_agg(
      policyname::text
      order by policyname::text collate "C"
    )
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'Users can upload own media',
        'Users can update own media',
        'Users can delete own media'
      )
  ),
  '[
    "Users can delete own media",
    "Users can update own media",
    "Users can upload own media"
  ]'::jsonb,
  'resident own-media storage policies remain untouched'
);
select is(
  (
    select jsonb_agg(
      policyname::text
      order by policyname::text collate "C"
    )
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'Owners and admins can upload sponsor images',
        'Owners and admins can update sponsor images',
        'Owners and admins can delete sponsor images'
      )
  ),
  '[
    "Owners and admins can delete sponsor images",
    "Owners and admins can update sponsor images",
    "Owners and admins can upload sponsor images"
  ]'::jsonb,
  'only the three sponsor write policy operations are added'
);

select lives_ok(
  $$ grant select, insert, update, delete on table storage.objects to authenticated $$,
  'test transaction can expose storage objects for RLS verification'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'images',
      'sponsors/c0000000-0000-0000-0000-000000000001/article_inline/owner.webp',
      auth.uid(),
      '{}'::jsonb
    )
  $$,
  'owner can write the exact sponsor image prefix'
);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'images',
      'not-sponsors/c0000000-0000-0000-0000-000000000001/article_inline/owner.webp',
      auth.uid(),
      '{}'::jsonb
    )
  $$,
  '42501',
  null,
  'owner cannot use the sponsor policy outside the sponsors prefix'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'images',
      'sponsors/c0000000-0000-0000-0000-000000000001/article_inline/moderator.webp',
      auth.uid(),
      '{}'::jsonb
    )
  $$,
  '42501',
  null,
  'moderator cannot write sponsor images'
);
reset role;

select lives_ok(
  $$ revoke all on table storage.objects from authenticated $$,
  'temporary storage grants are removed'
);

select * from finish();
rollback;

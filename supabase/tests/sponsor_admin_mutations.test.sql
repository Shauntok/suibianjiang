begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

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
    'b0000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'task4-owner@ourlittleage.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"task4_owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b0000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'task4-admin@ourlittleage.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"task4_admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b0000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'task4-moderator@ourlittleage.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"task4_moderator"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b0000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'task4-resident@ourlittleage.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"task4_resident"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.profiles (id, username, role)
values
  ('b0000000-0000-0000-0000-000000000001', 'task4_owner', 'owner'),
  ('b0000000-0000-0000-0000-000000000002', 'task4_admin', 'admin'),
  ('b0000000-0000-0000-0000-000000000003', 'task4_moderator', 'moderator'),
  ('b0000000-0000-0000-0000-000000000004', 'task4_resident', 'user')
on conflict (id) do update
set username = excluded.username,
    role = excluded.role;

select has_function(
  'public',
  'create_sponsor_campaign_with_log',
  array['uuid', 'jsonb'],
  'campaign creation RPC exists'
);
select has_function(
  'public',
  'update_sponsor_campaign_with_log',
  array['uuid', 'uuid', 'jsonb'],
  'campaign update RPC exists'
);
select has_function(
  'public',
  'update_sponsor_settings_with_log',
  array['uuid', 'jsonb'],
  'settings update RPC exists'
);

select results_eq(
  $$
    select p.prosecdef
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_sponsor_campaign_with_log',
        'update_sponsor_campaign_with_log',
        'update_sponsor_settings_with_log'
      )
    order by p.proname
  $$,
  $$ values (true), (true), (true) $$,
  'every sponsor mutation RPC is SECURITY DEFINER'
);

select is(
  (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'function', p.proname::text,
        'config', pg_catalog.to_jsonb(p.proconfig)
      )
      order by p.proname::text collate "C"
    )
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_sponsor_campaign_with_log',
        'update_sponsor_campaign_with_log',
        'update_sponsor_settings_with_log'
      )
  ),
  '[
    {"function":"create_sponsor_campaign_with_log","config":["search_path=\"\""]},
    {"function":"update_sponsor_campaign_with_log","config":["search_path=\"\""]},
    {"function":"update_sponsor_settings_with_log","config":["search_path=\"\""]}
  ]'::jsonb,
  'every sponsor mutation RPC fixes an empty search path'
);

select is(
  (
    with qualified_cast_types as (
      select distinct (cast_matches.captures)[1] as type_name
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      cross join lateral pg_catalog.regexp_matches(
        pg_catalog.pg_get_functiondef(p.oid),
        '::pg_catalog[.]([[:alpha:]_][[:alnum:]_]*)',
        'g'
      ) as cast_matches(captures)
      where n.nspname = 'public'
        and p.proname in (
          'create_sponsor_campaign_with_log',
          'update_sponsor_campaign_with_log',
          'update_sponsor_settings_with_log'
        )
    )
    select coalesce(
      pg_catalog.jsonb_agg(
        qualified_cast_types.type_name
        order by qualified_cast_types.type_name collate "C"
      ),
      '[]'::jsonb
    )
    from qualified_cast_types
    where not exists (
      select 1
      from pg_catalog.pg_type t
      join pg_catalog.pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'pg_catalog'
        and t.typname = qualified_cast_types.type_name
    )
  ),
  '[]'::jsonb,
  'every pg_catalog-qualified cast uses a real catalog type name'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_sponsor_campaign_with_log(uuid,jsonb)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.update_sponsor_campaign_with_log(uuid,uuid,jsonb)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.update_sponsor_settings_with_log(uuid,jsonb)',
    'EXECUTE'
  ),
  'service_role can execute every sponsor mutation RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_sponsor_campaign_with_log(uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.create_sponsor_campaign_with_log(uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.update_sponsor_campaign_with_log(uuid,uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.update_sponsor_campaign_with_log(uuid,uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.update_sponsor_settings_with_log(uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.update_sponsor_settings_with_log(uuid,jsonb)',
    'EXECUTE'
  ),
  'browser roles cannot execute sponsor mutation RPCs'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$
    select public.create_sponsor_campaign_with_log(
      'b0000000-0000-0000-0000-000000000003',
      '{
        "internalName":"forbidden",
        "partnerName":"forbidden",
        "publicTitle":"forbidden",
        "description":"forbidden",
        "destinationUrl":"https://partner.example/forbidden",
        "state":"draft",
        "startsAt":"2026-08-25T00:00:00.000Z",
        "endsAt":"2026-09-01T00:00:00.000Z",
        "weight":100
      }'::jsonb
    )
  $$,
  '42501',
  null,
  'moderator browser role cannot execute campaign creation'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$
    select public.update_sponsor_settings_with_log(
      'b0000000-0000-0000-0000-000000000001',
      '{}'::jsonb
    )
  $$,
  '42501',
  null,
  'anonymous role cannot execute settings mutation'
);
reset role;

set local role service_role;
select throws_ok(
  $$
    select public.create_sponsor_campaign_with_log(
      'b0000000-0000-0000-0000-000000000004',
      '{
        "internalName":"forged resident",
        "partnerName":"forged resident",
        "publicTitle":"forged resident",
        "description":"forged resident",
        "destinationUrl":"https://partner.example/forged",
        "state":"draft",
        "startsAt":"2026-08-25T00:00:00.000Z",
        "endsAt":"2026-09-01T00:00:00.000Z",
        "weight":100
      }'::jsonb
    )
  $$,
  '42501',
  null,
  'service role cannot forge a resident actor id'
);
select throws_ok(
  $$
    select public.create_sponsor_campaign_with_log(
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '{
        "internalName":"unknown actor",
        "partnerName":"unknown actor",
        "publicTitle":"unknown actor",
        "description":"unknown actor",
        "destinationUrl":"https://partner.example/unknown",
        "state":"draft",
        "startsAt":"2026-08-25T00:00:00.000Z",
        "endsAt":"2026-09-01T00:00:00.000Z",
        "weight":100
      }'::jsonb
    )
  $$,
  '42501',
  null,
  'service role cannot forge an unknown actor id'
);

select is(
  (
    select count(*)::bigint
    from public.admin_logs
    where admin_id = 'b0000000-0000-0000-0000-000000000001'
      and action = 'sponsor_campaign_created'
  ),
  0::bigint,
  'campaign creation log starts empty for the owner fixture'
);
select throws_ok(
  $$
    select public.create_sponsor_campaign_with_log(
      'b0000000-0000-0000-0000-000000000001',
      '{
        "internalName":"invalid schedule",
        "partnerName":"Moonlight Coffee",
        "publicTitle":"Invalid schedule",
        "description":"This write must roll back.",
        "destinationUrl":"https://partner.example/invalid",
        "state":"draft",
        "startsAt":"2026-09-01T00:00:00.000Z",
        "endsAt":"2026-08-25T00:00:00.000Z",
        "weight":100
      }'::jsonb
    )
  $$,
  '22023',
  null,
  'invalid campaign business data fails inside the RPC'
);
select is(
  (
    select count(*)::bigint
    from public.sponsor_campaigns
    where internal_name = 'invalid schedule'
  ),
  0::bigint,
  'failed campaign creation leaves no business row'
);
select is(
  (
    select count(*)::bigint
    from public.admin_logs
    where admin_id = 'b0000000-0000-0000-0000-000000000001'
      and action = 'sponsor_campaign_created'
  ),
  0::bigint,
  'failed campaign creation leaves no admin log'
);

select lives_ok(
  $$
    select public.create_sponsor_campaign_with_log(
      'b0000000-0000-0000-0000-000000000001',
      '{
        "internalName":"task4 atomic campaign",
        "partnerName":"Moonlight Coffee",
        "publicTitle":"A quiet cup",
        "description":"A quiet cup for the evening.",
        "destinationUrl":"https://partner.example/coffee",
        "state":"draft",
        "startsAt":"2026-08-25T00:00:00.000Z",
        "endsAt":"2026-09-01T00:00:00.000Z",
        "weight":100,
        "placements":[]
      }'::jsonb
    )
  $$,
  'owner actor id can create a campaign through service_role'
);
select is(
  (
    select count(*)::bigint
    from public.sponsor_campaigns
    where internal_name = 'task4 atomic campaign'
      and created_by = 'b0000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'successful campaign creation writes one business row'
);
select is(
  (
    select count(*)::bigint
    from public.admin_logs l
    join public.sponsor_campaigns c on c.id::text = l.target_id
    where c.internal_name = 'task4 atomic campaign'
      and l.admin_id = 'b0000000-0000-0000-0000-000000000001'
      and l.action = 'sponsor_campaign_created'
      and l.target_type = 'sponsor_campaign'
  ),
  1::bigint,
  'successful campaign creation writes exactly one matching admin log'
);

select lives_ok(
  pg_catalog.format(
    'select public.update_sponsor_campaign_with_log(%L::uuid, %L::uuid, %L::jsonb)',
    'b0000000-0000-0000-0000-000000000002',
    (
      select id::text
      from public.sponsor_campaigns
      where internal_name = 'task4 atomic campaign'
    ),
    (
      select pg_catalog.jsonb_build_object(
        'internalName', 'task4 atomic campaign',
        'partnerName', 'Moonlight Coffee',
        'publicTitle', 'A quiet cup',
        'description', 'A quiet cup for the evening.',
        'destinationUrl', 'https://partner.example/coffee',
        'state', 'paused',
        'startsAt', '2026-08-25T00:00:00.000Z',
        'endsAt', '2026-09-01T00:00:00.000Z',
        'weight', 100,
        'placements', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'placement', 'home_wide',
            'imagePath', pg_catalog.format(
              'sponsors/%s/home_wide/banner.webp',
              id
            ),
            'altText', 'A quiet coffee banner',
            'enabled', false
          )
        )
      )::text
      from public.sponsor_campaigns
      where internal_name = 'task4 atomic campaign'
    )
  ),
  'admin actor id can update campaign and placements through service_role'
);
select is(
  (
    select count(*)::bigint
    from public.sponsor_campaign_placements p
    join public.sponsor_campaigns c on c.id = p.campaign_id
    where c.internal_name = 'task4 atomic campaign'
      and p.placement = 'home_wide'
      and not p.enabled
  ),
  1::bigint,
  'campaign update saves placements in the same RPC'
);
select is(
  (
    select count(*)::bigint
    from public.admin_logs l
    join public.sponsor_campaigns c on c.id::text = l.target_id
    where c.internal_name = 'task4 atomic campaign'
      and l.admin_id = 'b0000000-0000-0000-0000-000000000002'
      and l.action = 'sponsor_campaign_paused'
  ),
  1::bigint,
  'pausing a campaign writes the specific paused action'
);

select lives_ok(
  $$
    select public.update_sponsor_settings_with_log(
      'b0000000-0000-0000-0000-000000000001',
      '{
        "commercialEnabled":false,
        "placementEnabled":{
          "home_wide":false,
          "space_wide":false,
          "article_inline":false,
          "diary_inline":false,
          "article_after":false,
          "diary_after":false,
          "desktop_left":false,
          "desktop_right":false
        },
        "minimumParagraphs":9,
        "minimumCharacters":1300,
        "maxAdsPerPage":2,
        "eligibleProbability":55,
        "cooldownPageViews":2,
        "maxAdPagesPerTen":4,
        "timezone":"Asia/Kuala_Lumpur",
        "placementPriority":[
          "article_inline",
          "article_after",
          "desktop_left",
          "desktop_right",
          "home_wide",
          "space_wide",
          "diary_inline",
          "diary_after"
        ]
      }'::jsonb
    )
  $$,
  'owner actor id can update sponsorship settings through service_role'
);
select results_eq(
  $$
    select commercial_enabled, placement_enabled
    from public.sponsor_settings
    where id
  $$,
  $$
    values (
      false,
      '{
        "home_wide":false,
        "space_wide":false,
        "article_inline":false,
        "diary_inline":false,
        "article_after":false,
        "diary_after":false,
        "desktop_left":false,
        "desktop_right":false
      }'::jsonb
    )
  $$,
  'settings and every placement remain off unless explicitly enabled'
);
select is(
  (
    select count(*)::bigint
    from public.admin_logs
    where admin_id = 'b0000000-0000-0000-0000-000000000001'
      and action = 'sponsor_settings_updated'
      and target_type = 'sponsor_settings'
  ),
  1::bigint,
  'successful settings update writes exactly one admin log'
);
reset role;

select * from finish();
rollback;

begin;

create or replace function public.create_sponsor_campaign_with_log(
  p_actor_id uuid,
  p_campaign jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.sponsor_campaigns%rowtype;
  v_placements jsonb;
  v_placement jsonb;
  v_placement_name text;
  v_image_path text;
  v_alt_text text;
  v_enabled boolean;
  v_placement_title text;
  v_placement_description text;
  v_internal_name text;
  v_partner_name text;
  v_public_title text;
  v_description text;
  v_destination_url text;
  v_state text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_weight integer;
  v_saved_placements jsonb;
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_actor_id
      and role in ('owner', 'admin')
  ) then
    raise exception 'Sponsor administrator required'
      using errcode = '42501';
  end if;

  if p_campaign is null
    or pg_catalog.jsonb_typeof(p_campaign) <> 'object'
    or not p_campaign ?& array[
      'internalName',
      'partnerName',
      'publicTitle',
      'description',
      'destinationUrl',
      'state',
      'startsAt',
      'endsAt',
      'weight'
    ]::pg_catalog.text[]
    or p_campaign - array[
      'internalName',
      'partnerName',
      'publicTitle',
      'description',
      'destinationUrl',
      'state',
      'startsAt',
      'endsAt',
      'weight',
      'placements'
    ]::pg_catalog.text[] <> '{}'::pg_catalog.jsonb
    or pg_catalog.jsonb_typeof(p_campaign -> 'internalName') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'partnerName') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'publicTitle') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'description') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'destinationUrl') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'state') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'startsAt') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'endsAt') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'weight') <> 'number'
  then
    raise exception 'Invalid sponsor campaign payload'
      using errcode = '22023';
  end if;

  v_internal_name := nullif(
    pg_catalog.btrim(p_campaign ->> 'internalName'),
    ''
  );
  v_partner_name := nullif(
    pg_catalog.btrim(p_campaign ->> 'partnerName'),
    ''
  );
  v_public_title := nullif(
    pg_catalog.btrim(p_campaign ->> 'publicTitle'),
    ''
  );
  v_description := nullif(
    pg_catalog.btrim(p_campaign ->> 'description'),
    ''
  );
  v_destination_url := nullif(
    pg_catalog.btrim(p_campaign ->> 'destinationUrl'),
    ''
  );
  v_state := p_campaign ->> 'state';
  v_starts_at := (p_campaign ->> 'startsAt')::pg_catalog.timestamptz;
  v_ends_at := (p_campaign ->> 'endsAt')::pg_catalog.timestamptz;
  v_weight := (p_campaign ->> 'weight')::pg_catalog.integer;
  v_placements := coalesce(
    p_campaign -> 'placements',
    '[]'::pg_catalog.jsonb
  );

  if v_internal_name is null
    or v_partner_name is null
    or v_public_title is null
    or v_description is null
    or v_destination_url is null
    or v_destination_url !~* '^https?://[^[:space:]]+$'
    or v_state not in ('draft', 'published', 'paused', 'archived')
    or v_ends_at <= v_starts_at
    or v_weight not between 1 and 1000
    or pg_catalog.jsonb_typeof(v_placements) <> 'array'
  then
    raise exception 'Invalid sponsor campaign values'
      using errcode = '22023';
  end if;

  insert into public.sponsor_campaigns (
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
    v_internal_name,
    v_partner_name,
    v_public_title,
    v_description,
    v_destination_url,
    v_state,
    v_starts_at,
    v_ends_at,
    v_weight,
    p_actor_id,
    p_actor_id
  )
  returning * into v_campaign;

  for v_placement in
    select item
    from pg_catalog.jsonb_array_elements(v_placements) as placement_items(item)
  loop
    if pg_catalog.jsonb_typeof(v_placement) <> 'object'
      or not v_placement ?& array[
        'placement',
        'imagePath',
        'altText',
        'enabled'
      ]::pg_catalog.text[]
      or v_placement - array[
        'placement',
        'imagePath',
        'altText',
        'enabled',
        'publicTitle',
        'description'
      ]::pg_catalog.text[] <> '{}'::pg_catalog.jsonb
      or pg_catalog.jsonb_typeof(v_placement -> 'placement') <> 'string'
      or pg_catalog.jsonb_typeof(v_placement -> 'imagePath') <> 'string'
      or pg_catalog.jsonb_typeof(v_placement -> 'altText') <> 'string'
      or pg_catalog.jsonb_typeof(v_placement -> 'enabled') <> 'boolean'
      or (
        v_placement ? 'publicTitle'
        and v_placement -> 'publicTitle' <> 'null'::pg_catalog.jsonb
        and pg_catalog.jsonb_typeof(v_placement -> 'publicTitle') <> 'string'
      )
      or (
        v_placement ? 'description'
        and v_placement -> 'description' <> 'null'::pg_catalog.jsonb
        and pg_catalog.jsonb_typeof(v_placement -> 'description') <> 'string'
      )
    then
      raise exception 'Invalid sponsor placement payload'
        using errcode = '22023';
    end if;

    v_placement_name := v_placement ->> 'placement';
    v_image_path := nullif(
      pg_catalog.btrim(v_placement ->> 'imagePath'),
      ''
    );
    v_alt_text := nullif(
      pg_catalog.btrim(v_placement ->> 'altText'),
      ''
    );
    v_enabled := (v_placement ->> 'enabled')::pg_catalog.boolean;
    v_placement_title := nullif(
      pg_catalog.btrim(v_placement ->> 'publicTitle'),
      ''
    );
    v_placement_description := nullif(
      pg_catalog.btrim(v_placement ->> 'description'),
      ''
    );

    if v_placement_name not in (
      'home_wide',
      'space_wide',
      'article_inline',
      'diary_inline',
      'article_after',
      'diary_after',
      'desktop_left',
      'desktop_right'
    )
      or v_image_path is null
      or v_alt_text is null
      or (
        v_placement ? 'publicTitle'
        and v_placement -> 'publicTitle' <> 'null'::pg_catalog.jsonb
        and v_placement_title is null
      )
      or (
        v_placement ? 'description'
        and v_placement -> 'description' <> 'null'::pg_catalog.jsonb
        and v_placement_description is null
      )
    then
      raise exception 'Invalid sponsor placement values'
        using errcode = '22023';
    end if;

    insert into public.sponsor_campaign_placements (
      campaign_id,
      placement,
      image_path,
      alt_text,
      enabled,
      public_title,
      description
    )
    values (
      v_campaign.id,
      v_placement_name,
      v_image_path,
      v_alt_text,
      v_enabled,
      v_placement_title,
      v_placement_description
    );
  end loop;

  insert into public.admin_logs (
    admin_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    p_actor_id,
    'sponsor_campaign_created',
    'sponsor_campaign',
    v_campaign.id::pg_catalog.text,
    'Created sponsor campaign: ' || v_campaign.internal_name
  );

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'placement', placement,
        'image_path', image_path,
        'alt_text', alt_text,
        'enabled', enabled,
        'public_title', public_title,
        'description', description
      )
      order by placement
    ),
    '[]'::pg_catalog.jsonb
  )
  into v_saved_placements
  from public.sponsor_campaign_placements
  where campaign_id = v_campaign.id;

  return pg_catalog.jsonb_build_object(
    'id', v_campaign.id,
    'internal_name', v_campaign.internal_name,
    'partner_name', v_campaign.partner_name,
    'public_title', v_campaign.public_title,
    'description', v_campaign.description,
    'destination_url', v_campaign.destination_url,
    'state', v_campaign.state,
    'starts_at', v_campaign.starts_at,
    'ends_at', v_campaign.ends_at,
    'weight', v_campaign.weight,
    'placements', v_saved_placements,
    'created_by', v_campaign.created_by,
    'updated_by', v_campaign.updated_by,
    'created_at', v_campaign.created_at,
    'updated_at', v_campaign.updated_at
  );
end;
$$;

create or replace function public.update_sponsor_campaign_with_log(
  p_actor_id uuid,
  p_campaign_id uuid,
  p_campaign jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.sponsor_campaigns%rowtype;
  v_placements jsonb;
  v_placement jsonb;
  v_placement_name text;
  v_image_path text;
  v_alt_text text;
  v_enabled boolean;
  v_placement_title text;
  v_placement_description text;
  v_internal_name text;
  v_partner_name text;
  v_public_title text;
  v_description text;
  v_destination_url text;
  v_state text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_weight integer;
  v_action text;
  v_saved_placements jsonb;
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_actor_id
      and role in ('owner', 'admin')
  ) then
    raise exception 'Sponsor administrator required'
      using errcode = '42501';
  end if;

  if p_campaign_id is null
    or p_campaign is null
    or pg_catalog.jsonb_typeof(p_campaign) <> 'object'
    or not p_campaign ?& array[
      'internalName',
      'partnerName',
      'publicTitle',
      'description',
      'destinationUrl',
      'state',
      'startsAt',
      'endsAt',
      'weight'
    ]::pg_catalog.text[]
    or p_campaign - array[
      'internalName',
      'partnerName',
      'publicTitle',
      'description',
      'destinationUrl',
      'state',
      'startsAt',
      'endsAt',
      'weight',
      'placements'
    ]::pg_catalog.text[] <> '{}'::pg_catalog.jsonb
    or pg_catalog.jsonb_typeof(p_campaign -> 'internalName') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'partnerName') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'publicTitle') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'description') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'destinationUrl') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'state') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'startsAt') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'endsAt') <> 'string'
    or pg_catalog.jsonb_typeof(p_campaign -> 'weight') <> 'number'
  then
    raise exception 'Invalid sponsor campaign payload'
      using errcode = '22023';
  end if;

  v_internal_name := nullif(
    pg_catalog.btrim(p_campaign ->> 'internalName'),
    ''
  );
  v_partner_name := nullif(
    pg_catalog.btrim(p_campaign ->> 'partnerName'),
    ''
  );
  v_public_title := nullif(
    pg_catalog.btrim(p_campaign ->> 'publicTitle'),
    ''
  );
  v_description := nullif(
    pg_catalog.btrim(p_campaign ->> 'description'),
    ''
  );
  v_destination_url := nullif(
    pg_catalog.btrim(p_campaign ->> 'destinationUrl'),
    ''
  );
  v_state := p_campaign ->> 'state';
  v_starts_at := (p_campaign ->> 'startsAt')::pg_catalog.timestamptz;
  v_ends_at := (p_campaign ->> 'endsAt')::pg_catalog.timestamptz;
  v_weight := (p_campaign ->> 'weight')::pg_catalog.integer;

  if v_internal_name is null
    or v_partner_name is null
    or v_public_title is null
    or v_description is null
    or v_destination_url is null
    or v_destination_url !~* '^https?://[^[:space:]]+$'
    or v_state not in ('draft', 'published', 'paused', 'archived')
    or v_ends_at <= v_starts_at
    or v_weight not between 1 and 1000
  then
    raise exception 'Invalid sponsor campaign values'
      using errcode = '22023';
  end if;

  update public.sponsor_campaigns
  set internal_name = v_internal_name,
      partner_name = v_partner_name,
      public_title = v_public_title,
      description = v_description,
      destination_url = v_destination_url,
      state = v_state,
      starts_at = v_starts_at,
      ends_at = v_ends_at,
      weight = v_weight,
      updated_by = p_actor_id,
      updated_at = pg_catalog.now()
  where id = p_campaign_id
  returning * into v_campaign;

  if not found then
    raise exception 'Sponsor campaign not found'
      using errcode = 'P0002';
  end if;

  if p_campaign ? 'placements' then
    v_placements := p_campaign -> 'placements';

    if pg_catalog.jsonb_typeof(v_placements) <> 'array' then
      raise exception 'Invalid sponsor placements payload'
        using errcode = '22023';
    end if;

    delete from public.sponsor_campaign_placements
    where campaign_id = p_campaign_id;

    for v_placement in
      select item
      from pg_catalog.jsonb_array_elements(v_placements) as placement_items(item)
    loop
      if pg_catalog.jsonb_typeof(v_placement) <> 'object'
        or not v_placement ?& array[
          'placement',
          'imagePath',
          'altText',
          'enabled'
        ]::pg_catalog.text[]
        or v_placement - array[
          'placement',
          'imagePath',
          'altText',
          'enabled',
          'publicTitle',
          'description'
        ]::pg_catalog.text[] <> '{}'::pg_catalog.jsonb
        or pg_catalog.jsonb_typeof(v_placement -> 'placement') <> 'string'
        or pg_catalog.jsonb_typeof(v_placement -> 'imagePath') <> 'string'
        or pg_catalog.jsonb_typeof(v_placement -> 'altText') <> 'string'
        or pg_catalog.jsonb_typeof(v_placement -> 'enabled') <> 'boolean'
        or (
          v_placement ? 'publicTitle'
          and v_placement -> 'publicTitle' <> 'null'::pg_catalog.jsonb
          and pg_catalog.jsonb_typeof(v_placement -> 'publicTitle') <> 'string'
        )
        or (
          v_placement ? 'description'
          and v_placement -> 'description' <> 'null'::pg_catalog.jsonb
          and pg_catalog.jsonb_typeof(v_placement -> 'description') <> 'string'
        )
      then
        raise exception 'Invalid sponsor placement payload'
          using errcode = '22023';
      end if;

      v_placement_name := v_placement ->> 'placement';
      v_image_path := nullif(
        pg_catalog.btrim(v_placement ->> 'imagePath'),
        ''
      );
      v_alt_text := nullif(
        pg_catalog.btrim(v_placement ->> 'altText'),
        ''
      );
      v_enabled := (v_placement ->> 'enabled')::pg_catalog.boolean;
      v_placement_title := nullif(
        pg_catalog.btrim(v_placement ->> 'publicTitle'),
        ''
      );
      v_placement_description := nullif(
        pg_catalog.btrim(v_placement ->> 'description'),
        ''
      );

      if v_placement_name not in (
        'home_wide',
        'space_wide',
        'article_inline',
        'diary_inline',
        'article_after',
        'diary_after',
        'desktop_left',
        'desktop_right'
      )
        or v_image_path is null
        or v_alt_text is null
        or (
          v_placement ? 'publicTitle'
          and v_placement -> 'publicTitle' <> 'null'::pg_catalog.jsonb
          and v_placement_title is null
        )
        or (
          v_placement ? 'description'
          and v_placement -> 'description' <> 'null'::pg_catalog.jsonb
          and v_placement_description is null
        )
      then
        raise exception 'Invalid sponsor placement values'
          using errcode = '22023';
      end if;

      insert into public.sponsor_campaign_placements (
        campaign_id,
        placement,
        image_path,
        alt_text,
        enabled,
        public_title,
        description
      )
      values (
        p_campaign_id,
        v_placement_name,
        v_image_path,
        v_alt_text,
        v_enabled,
        v_placement_title,
        v_placement_description
      );
    end loop;
  end if;

  v_action := case
    when v_campaign.state = 'paused' then 'sponsor_campaign_paused'
    when v_campaign.state = 'archived' then 'sponsor_campaign_archived'
    else 'sponsor_campaign_updated'
  end;

  insert into public.admin_logs (
    admin_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    p_actor_id,
    v_action,
    'sponsor_campaign',
    v_campaign.id::pg_catalog.text,
    'Updated sponsor campaign: ' || v_campaign.internal_name
  );

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'placement', placement,
        'image_path', image_path,
        'alt_text', alt_text,
        'enabled', enabled,
        'public_title', public_title,
        'description', description
      )
      order by placement
    ),
    '[]'::pg_catalog.jsonb
  )
  into v_saved_placements
  from public.sponsor_campaign_placements
  where campaign_id = v_campaign.id;

  return pg_catalog.jsonb_build_object(
    'id', v_campaign.id,
    'internal_name', v_campaign.internal_name,
    'partner_name', v_campaign.partner_name,
    'public_title', v_campaign.public_title,
    'description', v_campaign.description,
    'destination_url', v_campaign.destination_url,
    'state', v_campaign.state,
    'starts_at', v_campaign.starts_at,
    'ends_at', v_campaign.ends_at,
    'weight', v_campaign.weight,
    'placements', v_saved_placements,
    'created_by', v_campaign.created_by,
    'updated_by', v_campaign.updated_by,
    'created_at', v_campaign.created_at,
    'updated_at', v_campaign.updated_at
  );
end;
$$;

create or replace function public.update_sponsor_settings_with_log(
  p_actor_id uuid,
  p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.sponsor_settings%rowtype;
  v_commercial_enabled boolean;
  v_placement_enabled jsonb;
  v_minimum_paragraphs integer;
  v_minimum_characters integer;
  v_max_ads_per_page integer;
  v_eligible_probability integer;
  v_cooldown_page_views integer;
  v_max_ad_pages_per_ten integer;
  v_timezone text;
  v_placement_priority text[];
  v_placement_key text;
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_actor_id
      and role in ('owner', 'admin')
  ) then
    raise exception 'Sponsor administrator required'
      using errcode = '42501';
  end if;

  if p_settings is null
    or pg_catalog.jsonb_typeof(p_settings) <> 'object'
    or not p_settings ?& array[
      'commercialEnabled',
      'placementEnabled',
      'minimumParagraphs',
      'minimumCharacters',
      'maxAdsPerPage',
      'eligibleProbability',
      'cooldownPageViews',
      'maxAdPagesPerTen',
      'timezone',
      'placementPriority'
    ]::pg_catalog.text[]
    or p_settings - array[
      'commercialEnabled',
      'placementEnabled',
      'minimumParagraphs',
      'minimumCharacters',
      'maxAdsPerPage',
      'eligibleProbability',
      'cooldownPageViews',
      'maxAdPagesPerTen',
      'timezone',
      'placementPriority'
    ]::pg_catalog.text[] <> '{}'::pg_catalog.jsonb
    or pg_catalog.jsonb_typeof(p_settings -> 'commercialEnabled') <> 'boolean'
    or pg_catalog.jsonb_typeof(p_settings -> 'placementEnabled') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings -> 'placementPriority') <> 'array'
    or pg_catalog.jsonb_typeof(p_settings -> 'minimumParagraphs') <> 'number'
    or pg_catalog.jsonb_typeof(p_settings -> 'minimumCharacters') <> 'number'
    or pg_catalog.jsonb_typeof(p_settings -> 'maxAdsPerPage') <> 'number'
    or pg_catalog.jsonb_typeof(p_settings -> 'eligibleProbability') <> 'number'
    or pg_catalog.jsonb_typeof(p_settings -> 'cooldownPageViews') <> 'number'
    or pg_catalog.jsonb_typeof(p_settings -> 'maxAdPagesPerTen') <> 'number'
    or pg_catalog.jsonb_typeof(p_settings -> 'timezone') <> 'string'
  then
    raise exception 'Invalid sponsor settings payload'
      using errcode = '22023';
  end if;

  v_commercial_enabled := (
    p_settings ->> 'commercialEnabled'
  )::pg_catalog.boolean;
  v_placement_enabled := p_settings -> 'placementEnabled';
  v_minimum_paragraphs := (
    p_settings ->> 'minimumParagraphs'
  )::pg_catalog.integer;
  v_minimum_characters := (
    p_settings ->> 'minimumCharacters'
  )::pg_catalog.integer;
  v_max_ads_per_page := (
    p_settings ->> 'maxAdsPerPage'
  )::pg_catalog.integer;
  v_eligible_probability := (
    p_settings ->> 'eligibleProbability'
  )::pg_catalog.integer;
  v_cooldown_page_views := (
    p_settings ->> 'cooldownPageViews'
  )::pg_catalog.integer;
  v_max_ad_pages_per_ten := (
    p_settings ->> 'maxAdPagesPerTen'
  )::pg_catalog.integer;
  v_timezone := nullif(
    pg_catalog.btrim(p_settings ->> 'timezone'),
    ''
  );

  if not v_placement_enabled ?& array[
    'home_wide',
    'space_wide',
    'article_inline',
    'diary_inline',
    'article_after',
    'diary_after',
    'desktop_left',
    'desktop_right'
  ]::pg_catalog.text[]
    or v_placement_enabled - array[
      'home_wide',
      'space_wide',
      'article_inline',
      'diary_inline',
      'article_after',
      'diary_after',
      'desktop_left',
      'desktop_right'
    ]::pg_catalog.text[] <> '{}'::pg_catalog.jsonb
  then
    raise exception 'Invalid sponsor placement switches'
      using errcode = '22023';
  end if;

  foreach v_placement_key in array array[
    'home_wide',
    'space_wide',
    'article_inline',
    'diary_inline',
    'article_after',
    'diary_after',
    'desktop_left',
    'desktop_right'
  ]::pg_catalog.text[]
  loop
    if pg_catalog.jsonb_typeof(
      v_placement_enabled -> v_placement_key
    ) <> 'boolean' then
      raise exception 'Sponsor placement switches must be boolean'
        using errcode = '22023';
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_settings -> 'placementPriority'
    ) as priority_items(item)
    where pg_catalog.jsonb_typeof(item) <> 'string'
  ) then
    raise exception 'Sponsor placement priority must contain strings'
      using errcode = '22023';
  end if;

  select pg_catalog.array_agg(priority.value order by priority.ordinality)
  into v_placement_priority
  from pg_catalog.jsonb_array_elements_text(
    p_settings -> 'placementPriority'
  ) with ordinality as priority(value, ordinality);

  if v_minimum_paragraphs < 0
    or v_minimum_characters < 0
    or v_max_ads_per_page not between 0 and 3
    or v_eligible_probability not between 0 and 100
    or v_cooldown_page_views not between 0 and 20
    or v_max_ad_pages_per_ten not between 0 and 10
    or v_timezone is null
    or pg_catalog.cardinality(v_placement_priority) <> 8
    or pg_catalog.array_position(v_placement_priority, null) is not null
    or not v_placement_priority <@ array[
      'home_wide',
      'space_wide',
      'article_inline',
      'diary_inline',
      'article_after',
      'diary_after',
      'desktop_left',
      'desktop_right'
    ]::pg_catalog.text[]
    or not array[
      'home_wide',
      'space_wide',
      'article_inline',
      'diary_inline',
      'article_after',
      'diary_after',
      'desktop_left',
      'desktop_right'
    ]::pg_catalog.text[] <@ v_placement_priority
  then
    raise exception 'Invalid sponsor settings values'
      using errcode = '22023';
  end if;

  update public.sponsor_settings
  set commercial_enabled = v_commercial_enabled,
      placement_enabled = v_placement_enabled,
      minimum_paragraphs = v_minimum_paragraphs,
      minimum_characters = v_minimum_characters,
      max_ads_per_page = v_max_ads_per_page,
      eligible_probability = v_eligible_probability,
      cooldown_page_views = v_cooldown_page_views,
      max_ad_pages_per_ten = v_max_ad_pages_per_ten,
      placement_priority = v_placement_priority,
      timezone = v_timezone,
      updated_by = p_actor_id,
      updated_at = pg_catalog.now()
  where id
  returning * into v_settings;

  if not found then
    raise exception 'Sponsor settings not found'
      using errcode = 'P0002';
  end if;

  insert into public.admin_logs (
    admin_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    p_actor_id,
    'sponsor_settings_updated',
    'sponsor_settings',
    'global',
    'Updated sponsorship settings'
  );

  return pg_catalog.jsonb_build_object(
    'commercial_enabled', v_settings.commercial_enabled,
    'placement_enabled', v_settings.placement_enabled,
    'minimum_paragraphs', v_settings.minimum_paragraphs,
    'minimum_characters', v_settings.minimum_characters,
    'max_ads_per_page', v_settings.max_ads_per_page,
    'eligible_probability', v_settings.eligible_probability,
    'cooldown_page_views', v_settings.cooldown_page_views,
    'max_ad_pages_per_ten', v_settings.max_ad_pages_per_ten,
    'timezone', v_settings.timezone,
    'placement_priority', v_settings.placement_priority
  );
end;
$$;

revoke execute on function public.create_sponsor_campaign_with_log(uuid, jsonb)
from public, anon, authenticated;
revoke execute on function public.update_sponsor_campaign_with_log(uuid, uuid, jsonb)
from public, anon, authenticated;
revoke execute on function public.update_sponsor_settings_with_log(uuid, jsonb)
from public, anon, authenticated;

grant execute on function public.create_sponsor_campaign_with_log(uuid, jsonb)
to service_role;
grant execute on function public.update_sponsor_campaign_with_log(uuid, uuid, jsonb)
to service_role;
grant execute on function public.update_sponsor_settings_with_log(uuid, jsonb)
to service_role;

commit;

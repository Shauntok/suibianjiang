begin;

create table public.sponsor_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  partner_name text not null,
  contact_name text not null,
  email text not null,
  phone_country text not null,
  phone_e164 text not null,
  subject text not null,
  proposal text not null,
  status text not null default 'pending',
  handled_by uuid references public.profiles(id),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_inquiries_partner_name_check
    check (char_length(btrim(partner_name)) between 2 and 120),
  constraint sponsor_inquiries_contact_name_check
    check (char_length(btrim(contact_name)) between 2 and 80),
  constraint sponsor_inquiries_email_check
    check (char_length(btrim(email)) between 3 and 254 and position('@' in email) > 1),
  constraint sponsor_inquiries_phone_country_check
    check (phone_country in ('MY', 'SG', 'ID', 'CN', 'HK', 'TW')),
  constraint sponsor_inquiries_phone_e164_check
    check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint sponsor_inquiries_subject_check
    check (char_length(btrim(subject)) between 3 and 160),
  constraint sponsor_inquiries_proposal_check
    check (char_length(btrim(proposal)) between 20 and 5000),
  constraint sponsor_inquiries_status_check
    check (status in ('pending', 'contacting', 'accepted', 'declined')),
  constraint sponsor_inquiries_handler_check check (
    (handled_by is null and handled_at is null and status = 'pending')
    or (handled_by is not null and handled_at is not null and status <> 'pending')
  )
);

create index sponsor_inquiries_status_created_idx
on public.sponsor_inquiries (status, created_at desc);

create index sponsor_inquiries_user_created_idx
on public.sponsor_inquiries (user_id, created_at desc);

alter table public.sponsor_inquiries enable row level security;

revoke all on table public.sponsor_inquiries from public, anon, authenticated;
grant select, insert, update, delete on table public.sponsor_inquiries to service_role;

commit;

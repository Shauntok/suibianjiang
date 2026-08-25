begin;

select plan(10);

select has_table('public', 'sponsor_inquiries', 'sponsor inquiries table exists');
select has_column('public', 'sponsor_inquiries', 'email', 'email is stored');
select has_column('public', 'sponsor_inquiries', 'phone_e164', 'normalized phone is stored');
select has_column('public', 'sponsor_inquiries', 'status', 'processing status is stored');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.sponsor_inquiries'::regclass),
  'RLS is enabled'
);

select is(
  has_table_privilege('anon', 'public.sponsor_inquiries', 'select'),
  false,
  'anonymous users cannot read inquiries'
);
select is(
  has_table_privilege('authenticated', 'public.sponsor_inquiries', 'select'),
  false,
  'authenticated users cannot read inquiries directly'
);
select is(
  has_table_privilege('authenticated', 'public.sponsor_inquiries', 'insert'),
  false,
  'authenticated users cannot insert inquiries directly'
);
select is(
  has_table_privilege('authenticated', 'public.sponsor_inquiries', 'update'),
  false,
  'authenticated users cannot update inquiries directly'
);
select ok(
  has_table_privilege('service_role', 'public.sponsor_inquiries', 'select,insert,update'),
  'server service role can manage inquiries'
);

select * from finish();
rollback;

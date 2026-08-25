# Sponsor Inquiries Design

## Goal

Add a resident-facing sponsorship inquiry option that stores commercial proposals separately from feedback and exposes them only to owners and admins.

## Public Form

`/feedback` keeps its current feedback flow. Selecting `sponsorship` changes the visible copy and fields to:

- Partner or brand name
- Contact name
- Required email
- Country/region and required phone number
- Cooperation subject
- Cooperation proposal

Phone input is validated against the selected country and normalized to E.164 before submission. The initial supported regions are Malaysia, Singapore, Indonesia, Mainland China, Hong Kong, and Taiwan. Validation errors stay inline and submission success uses cooperation-specific copy.

## Data And Security

Create one `public.sponsor_inquiries` table with applicant, contact, proposal, status, and handling timestamps. Statuses are `pending`, `contacting`, `accepted`, and `declined`.

RLS and grants are deliberately narrow:

- Browser roles receive no direct table privileges; authenticated residents submit through a validated server API.
- Owner and admin profiles read and update through existing server-authorized Admin APIs.
- Anonymous users, moderators, and ordinary residents cannot read or mutate inquiry rows.
- Existing `feedbacks` and sponsor campaign tables are unchanged.

## Admin Experience

Add `/admin/sponsors/inquiries` and a `合作申请` link under the existing `商业合作` sidebar section. The page supports status filtering, search, contact detail display, and status transitions. `accepted` and `declined` are final and no longer show action controls.

This phase does not create campaigns from inquiries, send notifications, upload proposal files, or expose inquiry data outside owner/admin views.

## Verification

Cover validation, role authorization, public form switching/submission, admin status behavior, locked-down grants/RLS, focused lint, Vitest, and production build.

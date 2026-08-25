# Sponsor Inquiries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate sponsorship inquiry intake and owner/admin processing flow.

**Architecture:** A small shared validation model drives the conditional public form and API payloads. A dedicated RLS-protected table stores inquiries, while owner/admin API routes provide the only read and update path used by the new Admin page.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Supabase/Postgres RLS, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-08-25-sponsor-inquiries-design.md`

## Global Constraints

- Keep sponsorship inquiries separate from `feedbacks`.
- Email and phone are required.
- Only owner and admin may read or process applications.
- Do not create campaigns, notifications, uploads, or public delivery behavior.

---

### Task 1: Inquiry Validation And Database Contract

**Files:**
- Create: `lib/sponsors/inquiry.ts`
- Create: `lib/sponsors/inquiry.test.ts`
- Create: `supabase/migrations/*_sponsor_inquiries.sql`
- Create: `supabase/tests/sponsor_inquiries.test.sql`

**Interfaces:**
- Produces: `sponsorInquiryInputSchema`, `normalizeSponsorInquiryInput`, inquiry status and country types.

- [ ] Write failing tests for required email, country-aware phone normalization, invalid numbers, trimmed proposal fields, and statuses.
- [ ] Run the focused Vitest file and confirm failures are caused by the missing model.
- [ ] Implement the smallest shared model that passes the tests.
- [ ] Generate a migration with the Supabase CLI, then define the table, checks, grants, indexes, and RLS policies.
- [ ] Add pgTAP coverage proving browser roles have no direct table access and RLS remains enabled.
- [ ] Re-run focused tests.

### Task 2: Resident Submission Flow

**Files:**
- Modify: `app/feedback/page.tsx`
- Create: `app/feedback/page.test.tsx`
- Create: `app/api/sponsor-inquiries/route.ts`
- Create: `app/api/sponsor-inquiries/route.test.ts`

**Interfaces:**
- Consumes: `normalizeSponsorInquiryInput` from Task 1.
- Produces: authenticated `POST /api/sponsor-inquiries`.

- [ ] Write failing component tests for conditional cooperation labels, required email/phone fields, and feedback-field preservation.
- [ ] Write failing route tests for authentication, validation, and a normalized insert.
- [ ] Run both focused test files and confirm expected failures.
- [ ] Implement conditional form copy and the authenticated insert route.
- [ ] Run both focused test files until green.

### Task 3: Owner/Admin Processing Page

**Files:**
- Modify: `components/AdminSidebar.tsx`
- Modify: `components/AdminSidebar.test.tsx`
- Create: `app/admin/sponsors/inquiries/page.tsx`
- Create: `components/admin/sponsors/SponsorInquiriesClient.tsx`
- Create: `components/admin/sponsors/SponsorInquiriesClient.test.tsx`
- Create: `app/api/admin/sponsors/inquiries/route.ts`
- Create: `app/api/admin/sponsors/inquiries/[id]/route.ts`

**Interfaces:**
- Produces: owner/admin list and update APIs plus the Admin processing UI.

- [ ] Write failing tests for the sidebar link, role authorization, filters, contact details, and final-state action removal.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement owner/admin list and update routes using existing authorization helpers.
- [ ] Implement the quiet, compact inquiry page and sidebar entry.
- [ ] Run focused tests until green.

### Task 4: Final Verification And Handoff

**Files:**
- Modify: `HANDOFF.md`
- Modify: `app/settings/changelog/page.tsx`

- [ ] Add resident-facing changelog text and technical handoff notes.
- [ ] Run all Vitest tests.
- [ ] Run focused ESLint for changed TypeScript and TSX files.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and report migration status and remaining risks.

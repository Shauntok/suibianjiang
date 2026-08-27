# Public Sharing Verification

Date: 2026-08-27
Branch: `codex/social-sharing`
Workspace: `.worktrees/social-sharing`

## Implemented

- Public owner mobile actions: Like / Share in two equal columns; Edit and Back retain full rows.
- Public visitor mobile actions: Like / Share / Report in three equal columns.
- Non-public owner: disabled Share; unlisted visitor: no Share.
- Shared dialog: copy, native link/file sharing, PNG preview, download fallback, focus trap, Escape and scroll restoration.
- Server-generated 1080x1920 PNG with existing book icon, local CJK font, bounded title/author/excerpt.
- Query gate: matching type, published, public and undeleted posts only. No schema, RLS, storage or database writes.

## Verification Fixes

- Replaced the variable CJK font with a static weight-400 instance: the actual ImageResponse parser failed on the variable font.
- Replaced import.meta URL file loading with traced filesystem paths. Both font and icon appear in the production route trace.
- Disabled HTTP/CDN caching so later privacy changes are checked on subsequent requests.
- Portaled the dialog to body to avoid clipping by article containers; matched Share button shape and height to existing actions.
- Reused the downloaded File for the preview instead of generating the PNG twice.
- Distinguished a no-longer-public 404 from rendering failures, disabling share commands after that response.
- Real renderer test catches issues missed by mocked ImageResponse tests, including CJK parser and multi-child text layout errors.

## Results

- Full Vitest suite: 34 files, 265 tests passed.
- TypeScript: passed (standalone check and final build).
- Scoped ESLint for new sharing code and tests: passed.
- Integrated legacy page lint: four pre-existing any errors and two pre-existing img warnings; confirmed in base commit 941f1d2. Not changed.
- `npm run build -- --webpack`: passed, no font-loading errors.
- `git diff --check`: passed.
- Production endpoint article/135: 200 image/png, 1080x1920, 136825 bytes, private/no-store.
- Production endpoint diary/131: 200 image/png, 1080x1920, 110116 bytes, private/no-store.
- Real private, unlisted and draft records: empty 404 (read-only checks, no content output).
- Invalid type, invalid ID and mismatched type/ID: empty 404.
- Browser: real article/diary previews load; copy reports success; native file-share call resolves. No third-party post was made.
- 400x858 article visitor actions measured 110.33px each and 46px high, in Like / Share / Report order.
- 1440x900 diary share dialog visually checked: compact centered layout, legible preview, no overlap.
- Ownership/unlisted layout branches verified with component fixtures; no login impersonation or database mutation used.

## Remaining Checks And Limits

- A physical iOS/Android device over HTTPS must confirm which native targets appear and how Instagram receives the PNG.
- Native API mocks cover unsupported sharing, download, clipboard failures and cancellation; not a guarantee of every mobile platform's behavior.
- No claim that a website can automatically publish to Instagram Story. Saved or externally shared PNGs cannot be revoked.
- Owner layouts still need a signed-in browser visual pass; automated tests cover their exact order and width classes.
- Worktree dependencies reuse the main node_modules junction; Turbopack rejects that setup, so webpack was used. Existing lockfile npm-ci issue was not changed.
- Merged locally into main on 2026-08-27 at 93f1022; post-merge suite passed all 265 tests. Not pushed or deployed.
- Temporary worktree and its preview were retired after integration; ignored verification artifacts were archived under .superpowers/social-sharing-verification-20260827.
- The existing port-3000 process returned an empty 404 for the public diary share image after integration. It was left untouched. Starting another main-directory development server on port 3001 was refused by Next.js's existing-server guard; restart the original dev server before repeating this local smoke test.

# SiteSync

A private project workspace for a small civil-engineering team (built for two collaborators; the schema supports more).
Next.js 15 (App Router, TypeScript) · Tailwind CSS 3 · Supabase (Auth, Postgres, Storage, Realtime) · PDF.js · dxf-parser.
The brand name lives in `src/lib/brand.ts` and the colours in `tailwind.config.ts`.

> **Read this first.** The database, security policies, business rules and the app's API queries are tested (see *Verification*).
> The web UI has been type-checked, linted, built and smoke-tested, but **has not been exercised in a browser or against real
> Supabase services** (no credentials or browser were available when it was written). Do the first-run checklist below before relying on it.

## Features

| Area | Status |
|---|---|
| Sign up / in / out, password reset, protected routes, persistent sessions, account page (name, avatar) | Built |
| Invitation-only membership (single-use, email-bound, hashed token, 7-day expiry), member removal | Built, DB-tested |
| Projects: code, status, dates, description, cover image, owner-only settings, onboarding checklist | Built |
| Documents: folders, upload (picker + drag-and-drop + progress), rename, move, download, delete, search, filters, sorting, uploader/last-modifier | Built, query-tested |
| Server-side validation of type/size; transactional document and version creation | Built, DB-tested |
| Version history: immutable versions, labels, notes, download, metadata compare, restore | Built, DB-tested |
| Viewers: PDF (zoom, fit width/page, pages, thumbnails, full screen), images (zoom, pan, fit), **DXF** (simplified read-only preview with layer toggles) | Built; geometry unit-tested; not browser-tested |
| Markups on **PDF and images**: pin, text, arrow, rectangle, revision cloud; normalised coordinates; replies; resolve | Built, DB-tested, not browser-tested |
| Tasks: list, Kanban, filters, assignment, deadlines/overdue, comments, linked documents | Built, DB- and query-tested |
| Discussions: threaded messages, document links, @mentions | Built, DB- and query-tested |
| In-app notifications (every event in the spec + mentions), mark read; deadline reminders on page open and hourly via pg_cron | Built, DB-tested |
| **Email notifications** (database trigger → signed webhook → Resend; per-user opt-out) | Built; trigger and route tested with stand-ins; **not tested against real pg_net/Resend** |
| Activity log (append-only, trigger-written) | Built, DB-tested |
| Project search (documents, folders, tasks, messages, drawing comments) | Built, query-tested |
| Realtime refresh of project pages | Built, **not verified** |
| Loading skeletons, error/404 screens, skip link, active nav, mobile header | Built, not browser-tested |
| DWG preview | **Not possible in-browser here.** DWG is a proprietary format; files are stored and downloadable. Export a PDF or DXF to review. |
| Markups on DXF | Not built |
| Simultaneous co-editing | **Not built / not claimed.** Realtime only syncs changes. |

## Setup

1. `npm install`
2. Create a Supabase project (Postgres 15+). In the SQL editor run, **in order**, `supabase/migrations/0001` … `0007`
   (or `supabase link` then `supabase db push`). `0006` schedules hourly deadline reminders if `pg_cron` is available (enable it under
   Database → Extensions first), otherwise it skips quietly.
3. Authentication: set **Site URL** to your app URL and add `<site>/auth/callback` to the redirect URLs. Configure a custom SMTP provider
   (Supabase's built-in mail is heavily rate-limited, which affects confirmation and password-reset emails). After both team members have
   accounts, turn **off** "Allow new users to sign up" so the app stays private (invitation links still work for existing accounts).
4. `cp .env.example .env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
   No service-role key is used anywhere; the anon key is safe in the browser because every table and bucket is protected by RLS.
5. `npm run dev`

### Email notifications (optional)
Without this, notifications stay in-app. To enable email:
1. Create a [Resend](https://resend.com) account and verify a sending domain. Set `RESEND_API_KEY`, `EMAIL_FROM` and a long random `EMAIL_WEBHOOK_SECRET` on the app (Vercel env vars or `.env.local`).
2. In Supabase enable the **pg_net** extension (Database → Extensions).
3. In the SQL editor run (your values):
   `insert into app_settings (key, value) values ('email_webhook_url','https://YOUR-APP/api/email-webhook'), ('email_webhook_secret','THE-SAME-SECRET') on conflict (key) do update set value = excluded.value;`
4. Create a task assigned to the other member and confirm they receive an email. Members can opt out on their account page.
`app_settings` is unreadable by clients. The webhook route answers 503 until configured and 401 without the secret. If delivery fails, the in-app notification is still created.

### First-run checklist (about 15 minutes, two browsers or one normal + one private window)
1. Sign up as A, create a project. 2. Team → invite B's email, copy the link (invitation links are shown once; they are not emailed). 3. Sign up as B with that email, open the link, accept.
4. A uploads a PDF; confirm B sees it and gets a notification. 5. Open the PDF, draw a rectangle with a comment; B should see it and be notified. Repeat on a PNG.
6. B uploads a new version; restore v1; confirm history is intact. 7. Upload a small DXF and open it in the viewer. 8. Create a task for B, drag it across the board. 9. Post a message with `@Name`.
10. Open a project URL signed out and as a third account: both must fail. 11. View on a phone.
If the **upload** step fails with "file not found" or a size mismatch, check that Supabase records `metadata.size` and accepts the signed-URL PUT headers used in `src/lib/upload.ts`.

## Testing

| Command | What it does |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint (Next + TypeScript rules) and `tsc` |
| `npm test` | 31 unit tests: upload validation, task rules, markup and DXF geometry, input schemas, redirect safety, email building and the webhook route |
| `npm run test:db` | Applies all migrations to a throwaway Postgres (stand-ins for Supabase's `auth`, `storage`, `pg_net`) and runs 125 security and business-rule assertions as three different users |
| `npm run test:api` | Starts a real PostgREST on the migrated database and runs 63 of the app's actual query shapes as JWT-authenticated users (embeds, filters, `or()` search, RPCs, outsider isolation). Needs `psql`, Node and a PostgREST binary (`POSTGREST_BIN`). |
| `npm run build` | Production build (dummy env vars are enough) |

CI (`.github/workflows/ci.yml`) runs all of the above.

## Security model
- Every table has RLS; membership is checked by `SECURITY DEFINER` helpers. A guessed project/document ID returns nothing (the UI shows 404).
- Clients cannot insert projects, memberships, documents, versions, notifications or activity rows directly; those go through RPCs/triggers that validate and log in one transaction.
- Versions are immutable; activity is append-only; ownership columns and `current_version_id` are not client-editable (column grants).
- Private buckets: `project-files` (members of the project in the first path segment) and `avatars` (owner, plus people sharing a project). Downloads use 60-second signed URLs.
- Invitation tokens: 32 random bytes, only the SHA-256 is stored, bound to an email, single use, 7-day expiry, owner can revoke.
- Server actions re-check the session with `getUser()`; open-redirect-safe `next`; security headers in `next.config.mjs`; the only unauthenticated API route authenticates with a constant-time secret check.
- Rate limits: invitations (10/project/hour) and project creation (10/user/day) in the database; sign-in/reset limits come from Supabase Auth.
- Secret scan of the repo found no keys; `.env*` is git-ignored.

## Deployment
1. Push to GitHub and import into Vercel (or any Node 20 host). 2. Set the env vars; `NEXT_PUBLIC_SITE_URL` = production URL.
3. Update Supabase Site URL and redirect URLs to the production domain. 4. Add HSTS at your host/CDN. 5. Enable Supabase backups.
6. Repeat the first-run checklist on production. **Nothing has been deployed by this project's author.**

## Verification (what was and was not done)
Done: lint, typecheck, 31 unit tests, production build, a smoke test of the running server (protected routes redirect to login; webhook route returns 401/400 as designed; security headers present),
125 database assertions on PostgreSQL 16, and 63 query checks through a real PostgREST. The PostgREST run caught and fixed one real bug (the download lookup embedded `documents(name)`
from `document_versions`, which PostgREST rejects as ambiguous, PGRST201).
Not done: any run against real Supabase Auth, Storage or Realtime (so real Auth emails, signed uploads, Supabase's own storage RLS engine and Realtime delivery are unverified); real pg_net and Resend delivery;
any real browser session (so drag-and-drop, PDF/DXF rendering, markup drawing, Kanban dragging and mobile layout are unverified); screen-reader testing; load testing.

## Known limitations
- Deadline reminders are created when a member opens a project page, and hourly if `pg_cron` is enabled (`0006`); at most one per task per 24 h. The scheduled path is tested as a database function, not under a real `pg_cron`.
- Dates are compared as UTC calendar dates, so "overdue" can be off by hours near midnight in other time zones.
- DXF preview is simplified: lines, polylines (with arcs), circles, arcs, ellipses, splines (as control/fit points), text and nested blocks. Hatches, solids, images and 3D are not drawn; very large files are truncated at 150,000 entities. Binary DXF is not supported.
- File contents are not scanned (extension, MIME type and size only). A member could upload objects straight to storage with their own token; unregistered objects stay private and unused.
- Cover images are uploaded to the project bucket under `<project>/cover/`; any member's token could write there, but only the owner can attach one to the project.
- The document list is capped at 500 rows and sorted in the app (fine at this team size).
- Deleting a document removes its files unless storage policy blocks removal of a file the other member uploaded (it stays private).
- Kanban drag-and-drop is desktop-only; on touch use each card's status dropdown. Dialogs use the browser's `prompt`/`confirm`.
- @mentions match the collaborator's full name in the text.

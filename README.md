# Merveille · La Boîte à Merveilles

A French-language Next.js App Router quiz platform with student and teacher portals, Tailwind CSS and Supabase Auth/Postgres. The application lives in `merveille/`.

## Run locally

```sh
cd merveille
npm ci --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable or legacy anon key), and the server-only `SUPABASE_SERVICE_ROLE_KEY`. The service role key is used only by the student registration/login server route; it must never receive a `NEXT_PUBLIC_` prefix. Without environment variables, the home page shows a clearly labeled preview. Preview buttons request authentication and never fabricate quiz scores.

## Supabase setup

Use a personal access token belonging to an account with organization access. Keep it in the environment; never commit it. Create a project in your organization, then:

```sh
cd merveille
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Migrations create `users`, `questions`, `assigned_quizzes`, `quiz_attempts`, `scores` and registration rate limits, apply RLS, install the `pg_cron` expiry job and seed 240 questions (20 for each of 12 chapters). All assignments begin locked. The seed is a migration, so `db push` applies it remotely without a separate seeding step. `node scripts/generate-seed.mjs` regenerates the seed source; use a new migration for later production bank edits.

## Create a teacher

Public signup always creates a student, regardless of metadata. Teacher signup is intentionally restricted to administrators. From `merveille/`, with `.env.local` configured:

```sh
# Set TEACHER_PASSWORD securely in your shell (at least 12 characters).
node --env-file=.env.local scripts/create-teacher.mjs teacher@example.com Prénom Nom
```

The script creates a confirmed email/password identity and grants its database profile the teacher role using the server-only service key. For an existing account, promote its `public.users.role` to `teacher` using the Supabase SQL editor. No default public admin password is shipped.

## Student accounts

Students register and log in with first name, last name and a password of at least 10 characters. Names are normalized, trimmed and case insensitive for sign-in, and mapped to an internal SHA-256 auth address. **Each full-name combination must be unique.** If two students share a name, use a teacher-agreed distinguishing suffix. These accounts do not collect email and cannot use email password recovery; an administrator must reset a forgotten password in Supabase Auth. Login remains subject to Supabase Auth limits; account creation has a database-backed 10-per-15-minute limit per trusted proxy IP. Vercel supplies the trusted IP header; other deployments should configure `x-real-ip` at their trusted reverse proxy. With no trusted IP, registrations share a single limit.

## Quiz behavior and authorization

- A teacher activates chapter quizzes, chooses an exact question count (up to the seeded pool size), and sets a duration of 1–180 minutes. Active assignments are available to every student in the class.
- The database rejects activation when there are too few questions. Students can only read active assignments and their own profile, attempts and scores.
- Starting a quiz selects random question IDs once and fixes the deadline server-side. Refresh resumes the same questions and deadline. Each student gets one attempt per chapter assignment.
- Correct answer indices are never returned to students. The browser cannot directly insert or modify attempts or scores. Privileged database functions authenticate the caller and own all timing and grading decisions.
- Answers save immediately, one at a time. The browser automatically submits on expiry. A `pg_cron` job grades expired attempts within roughly one minute even if the browser is closed. Late answer writes are rejected; repeated submission returns the original result.
- Existing attempts keep their question selection and deadline when assignment settings change. Keep question content immutable once a quiz has attempts; create new bank questions rather than editing/deleting questions used by existing attempts.
- Teacher results include all registered students, including those without completed quizzes. Students see their own saved results.

## Validation

```sh
cd merveille
npm run lint
npx tsc --noEmit
npm run build
npm run test:database
```

The database tests run the migrations in an isolated Postgres-compatible PGlite instance with mocked Supabase Auth roles. They exercise role escalation protection, score isolation, hidden correct answers, exact question counts, assignment limits, late-answer rejection, single-attempt resumption, idempotent submission and expiry grading. The scheduler invocation is tested independently of the hosted `pg_cron` extension.

## Deploy

Import this GitHub repository into Vercel, select `merveille` as the root directory, and configure the three environment variables. Use install command `npm ci --legacy-peer-deps`, build command `npm run build` and the Next.js framework preset. Configure the project URL and authentication redirect URL in Supabase Auth to match your deployed URL. The access token used to manage Supabase is never needed by the application. No hosted deployment is automatically created by this repository.

## Content

Original sample questions cover the 12 chapters plus recurring literary concepts. Chapter labels in the UI are editorial reading aids, not claimed original chapter titles. Teachers should review sample questions against the edition used in class before assigning assessments. Reference outlines: [AlloSchool, chapters I–III](https://www.alloschool.com/assets/documents/course-44/schema-des-chapitres-1-2-et-3.pdf), [Lycée Ibn Sina, twelve-chapter outline](https://www.myconnect.school/uploade/media_admin/pixel-junior20200513094850-9073822-9086064-1-0.pdf). Security follows [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database function guidance](https://supabase.com/docs/guides/database/functions).

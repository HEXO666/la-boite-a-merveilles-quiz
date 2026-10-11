# Verification

Verified on 2026-10-11 against the configured hosted Supabase project.

- Applied four migrations and seeded 240 questions across twelve chapters.
- Teacher signed in, activated chapter 1, and saved three questions with a one-minute limit.
- Student registered through the application using first name, last name, and password.
- Student dashboard exposed the assigned chapter and locked the remaining chapters.
- Quiz displayed exactly three questions, saved answers, and automatically submitted when the timer expired.
- Supabase stored one score of 3/3 (100%) with a sixty-second attempt deadline; the teacher results table displayed that score.
- Anonymous score reads were denied.
- Disposable accounts, attempts, and scores were removed; chapter 1 was restored to locked defaults.
- Production build and isolated database tests passed. Lint and TypeScript checks passed during implementation.

The isolated database suite additionally covers RLS isolation, role escalation prevention, fixed question selection on resume, idempotent grading, late-answer rejection, background expiry grading, and signup limits.

GitHub Actions could not start because GitHub reported an account billing lock. Local validation completed successfully.

Credentials are stored only in ignored local environment files. Deployment instructions are in the root README.

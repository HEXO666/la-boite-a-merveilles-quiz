import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 grant execute on function auth.uid() to authenticated;`);
for (const name of readdirSync("supabase/migrations")
  .filter((n) => n.endsWith(".sql"))
  .sort()) {
  const sql = readFileSync(`supabase/migrations/${name}`, "utf8")
    .replace(/^create extension if not exists pg_cron.*$/m, "")
    .replace(/^select cron.schedule.*$/m, "");
  await db.exec(sql);
}
const teacher = "00000000-0000-0000-0000-000000000001",
  student = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
await db.query(
  `insert into auth.users(id,raw_user_meta_data) values($1,'{"first_name":"Teacher"}'),($2,'{"first_name":"Student","role":"teacher"}'),($3,'{"first_name":"Other"}')`,
  [teacher, student, other],
);
await db.query(`update public.users set role='teacher' where id=$1`, [teacher]);
async function asUser(id) {
  await db.exec("reset role");
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]);
  await db.exec("set role authenticated");
}
async function admin() {
  await db.exec("reset role");
}
async function denied(sql, params = []) {
  await assert.rejects(() => db.query(sql, params));
}
const pool = await db.query(
  "select chapter_id,count(*)::int n from public.questions group by chapter_id",
);
assert.equal(pool.rows.length, 12);
assert(pool.rows.every((r) => r.n === 20));
await asUser(student);
assert.equal(
  (await db.query("select role from public.users")).rows[0].role,
  "student",
  "Signup metadata must not escalate roles",
);
assert.equal((await db.query("select * from public.users")).rows.length, 1);
assert.equal(
  (await db.query("select * from public.assigned_quizzes")).rows.length,
  0,
);
assert.equal(
  (await db.query("select * from public.questions")).rows.length,
  0,
  "Answers stay hidden",
);
await denied(`update public.users set role='teacher' where id=$1`, [student]);
await denied(`insert into public.scores(student_id) values($1)`, [student]);
await asUser(teacher);
const quiz = (
  await db.query("select id from public.assigned_quizzes where chapter_id=1")
).rows[0].id;
await denied("select public.start_quiz($1)", [quiz]);
await denied(
  "update public.assigned_quizzes set is_active=true,question_count=21 where id=$1",
  [quiz],
);
await db.query(
  "update public.assigned_quizzes set is_active=true,question_count=7,time_limit_minutes=2 where id=$1",
  [quiz],
);
await asUser(student);
const a = (await db.query("select public.start_quiz($1) a", [quiz])).rows[0].a;
assert.equal(a.questions.length, 7);
assert(a.questions.every((q) => !("correct_index" in q)));
const resumed = (await db.query("select public.start_quiz($1) a", [quiz]))
  .rows[0].a;
assert.equal(resumed.id, a.id);
assert.deepEqual(resumed.questions, a.questions);
assert.equal(resumed.deadline, a.deadline);
await asUser(other);
await denied("select public.save_answer($1,$2,0)", [a.id, a.questions[0].id]);
await denied("select public.submit_quiz($1)", [a.id]);
await asUser(teacher);
await denied("update public.questions set correct_index=0 where id=$1", [
  a.questions[0].id,
]);
await denied("delete from public.questions where id=$1", [a.questions[0].id]);
await admin();
const answers = (
  await db.query(
    "select id,correct_index from public.questions where id=any($1::bigint[])",
    [a.questions.map((q) => q.id)],
  )
).rows;
await asUser(student);
for (const q of answers)
  await db.query("select public.save_answer($1,$2,$3)", [
    a.id,
    q.id,
    q.correct_index,
  ]);
await denied("select public.save_answer($1,$2,4)", [a.id, a.questions[0].id]);
await denied("select public.save_answer($1,999999,0)", [a.id]);
const s = (await db.query("select (public.submit_quiz($1)).*", [a.id])).rows[0];
assert.equal(Number(s.score), 100);
assert.equal(s.question_count, 7);
const repeated = (await db.query("select (public.submit_quiz($1)).*", [a.id]))
  .rows[0];
assert.equal(s.id, repeated.id);
await denied("select public.start_quiz($1)", [quiz]);
await denied("select public.save_answer($1,$2,0)", [a.id, a.questions[0].id]);
await asUser(other);
assert.equal((await db.query("select * from public.scores")).rows.length, 0);
const expired = (await db.query("select public.start_quiz($1) a", [quiz]))
  .rows[0].a;
await admin();
await db.query(
  `update public.quiz_attempts set deadline=now()-interval '1 minute' where id=$1`,
  [expired.id],
);
await asUser(other);
await denied("select public.save_answer($1,$2,0)", [
  expired.id,
  expired.questions[0].id,
]);
await denied("select public.finalize_expired_quizzes()");
await admin();
await db.query("select public.finalize_expired_quizzes()");
await db.query("select public.finalize_expired_quizzes()");
await asUser(other);
assert.equal((await db.query("select * from public.scores")).rows.length, 1);
assert.equal(
  Number((await db.query("select score from public.scores")).rows[0].score),
  0,
);
await asUser(teacher);
assert.equal((await db.query("select * from public.scores")).rows.length, 2);
assert.equal((await db.query("select * from public.users")).rows.length, 3);
await admin();
await db.exec("set role anon");
await denied("select public.start_quiz($1)", [quiz]);
await denied("select * from public.scores");
await denied("select public.allow_registration($1)", ["test"]);
await admin();
await db.exec("set role service_role");
for (let i = 0; i < 10; i++)
  assert.equal(
    (await db.query("select public.allow_registration($1) ok", ["test"]))
      .rows[0].ok,
    true,
  );
assert.equal(
  (await db.query("select public.allow_registration($1) ok", ["test"])).rows[0]
    .ok,
  false,
);
await db.close();
console.log(
  "PASS: seed, student/teacher RLS, role protection, exact selection, resume, grading, idempotency, deadline enforcement, background expiry, registration limits.",
);

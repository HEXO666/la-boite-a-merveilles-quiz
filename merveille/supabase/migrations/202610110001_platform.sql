create table public.users (
 id uuid primary key references auth.users on delete cascade,
 role text not null default 'student' check(role in ('student','teacher')),
 first_name text not null, last_name text not null, created_at timestamptz not null default now()
);
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.users(id,first_name,last_name) values(new.id,coalesce(new.raw_user_meta_data->>'first_name','Teacher'),coalesce(new.raw_user_meta_data->>'last_name',''));
 return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create function public.is_teacher() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.users where id=auth.uid() and role='teacher'); $$;
create table public.questions (
 id bigint generated always as identity primary key,
 chapter_id integer not null check(chapter_id between 1 and 12),
 prompt text not null, options jsonb not null check(jsonb_array_length(options)=4),
 correct_index integer not null check(correct_index between 0 and 3), explanation text not null default '',
 unique(chapter_id,prompt)
);
create table public.assigned_quizzes (
 id uuid primary key default gen_random_uuid(), chapter_id integer not null unique check(chapter_id between 1 and 12),
 is_active boolean not null default false, question_count integer not null default 10 check(question_count between 1 and 100),
 time_limit_minutes integer not null default 15 check(time_limit_minutes between 1 and 180),
 updated_at timestamptz not null default now()
);
create table public.quiz_attempts (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.users on delete cascade,
 quiz_id uuid not null references public.assigned_quizzes on delete restrict,
 question_ids bigint[] not null, answers jsonb not null default '{}',
 started_at timestamptz not null default now(), deadline timestamptz not null, submitted_at timestamptz,
 unique(student_id,quiz_id)
);
create table public.scores (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.users on delete cascade,
 quiz_id uuid not null references public.assigned_quizzes on delete restrict,
 attempt_id uuid not null unique references public.quiz_attempts on delete cascade,
 chapter_id integer not null, correct_count integer not null, question_count integer not null, score numeric not null,
 created_at timestamptz not null default now()
);
create index scores_student_idx on public.scores(student_id);
alter table public.users enable row level security;
alter table public.questions enable row level security;
alter table public.assigned_quizzes enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.scores enable row level security;
revoke all on public.users,public.questions,public.assigned_quizzes,public.quiz_attempts,public.scores from anon,authenticated;
grant select on public.users,public.assigned_quizzes,public.quiz_attempts,public.scores to authenticated;
grant select,insert,update,delete on public.questions to authenticated;
grant usage,select on sequence public.questions_id_seq to authenticated;
grant update(is_active,question_count,time_limit_minutes) on public.assigned_quizzes to authenticated;
grant all on public.users,public.questions,public.assigned_quizzes,public.quiz_attempts,public.scores to service_role;
create policy users_read on public.users for select to authenticated using(id=auth.uid() or public.is_teacher());
create policy question_teacher on public.questions for all to authenticated using(public.is_teacher()) with check(public.is_teacher());
create policy assignments_read on public.assigned_quizzes for select to authenticated using(is_active or public.is_teacher());
create policy assignments_update on public.assigned_quizzes for update to authenticated using(public.is_teacher()) with check(public.is_teacher());
create policy attempts_read on public.quiz_attempts for select to authenticated using(student_id=auth.uid() or public.is_teacher());
create policy scores_read on public.scores for select to authenticated using(student_id=auth.uid() or public.is_teacher());

create function public.protect_used_question() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.quiz_attempts where old.id=any(question_ids)) then raise exception 'Questions used in attempts cannot be changed or deleted'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
create trigger question_immutable before update or delete on public.questions for each row execute function public.protect_used_question();

create function public.validate_assignment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_active and new.question_count > (select count(*) from public.questions where chapter_id=new.chapter_id) then raise exception 'Not enough questions in this chapter'; end if;
 new.updated_at=now(); return new;
end; $$;
create trigger assignment_validation before update on public.assigned_quizzes for each row execute function public.validate_assignment();

create function public.start_quiz(p_quiz_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.assigned_quizzes; a public.quiz_attempts; ids bigint[]; payload jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid() and role='student') then raise exception 'Student access required'; end if;
 -- Serialize concurrent starts for this student and assignment.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_quiz_id::text,0));
 select * into q from public.assigned_quizzes where id=p_quiz_id and is_active;
 if not found then raise exception 'This quiz is locked'; end if;
 select * into a from public.quiz_attempts where student_id=auth.uid() and quiz_id=q.id;
 if found and a.submitted_at is not null then raise exception 'This quiz has already been submitted'; end if;
 if a.id is null then
  select array_agg(id) into ids from (select id from public.questions where chapter_id=q.chapter_id order by random() limit q.question_count) pool;
  if coalesce(cardinality(ids),0)<>q.question_count then raise exception 'Not enough questions'; end if;
  insert into public.quiz_attempts(student_id,quiz_id,question_ids,deadline) values(auth.uid(),q.id,ids,now()+make_interval(mins=>q.time_limit_minutes)) returning * into a;
 end if;
 select jsonb_agg(jsonb_build_object('id',x.id,'prompt',x.prompt,'options',x.options) order by position) into payload
 from unnest(a.question_ids) with ordinality chosen(id,position) join public.questions x using(id);
 return jsonb_build_object('id',a.id,'deadline',a.deadline,'answers',a.answers,'questions',payload,'chapter_id',q.chapter_id,'server_now',clock_timestamp());
end; $$;

create function public.save_answer(p_attempt_id uuid,p_question_id bigint,p_answer integer) returns void language plpgsql security definer set search_path='' as $$
declare a public.quiz_attempts;
begin
 select * into a from public.quiz_attempts where id=p_attempt_id and student_id=auth.uid() for update;
 if not found then raise exception 'Attempt not found'; end if;
 if a.submitted_at is not null or clock_timestamp()>=a.deadline then raise exception 'Quiz deadline has passed'; end if;
 if not p_question_id=any(a.question_ids) or p_answer not between 0 and 3 or p_answer is null then raise exception 'Invalid answer'; end if;
 update public.quiz_attempts set answers=jsonb_set(answers,array[p_question_id::text],to_jsonb(p_answer),true) where id=a.id;
end; $$;

create function public.submit_quiz(p_attempt_id uuid) returns public.scores language plpgsql security definer set search_path='' as $$
declare a public.quiz_attempts; s public.scores; correct integer;
begin
 select * into a from public.quiz_attempts where id=p_attempt_id and student_id=auth.uid() for update;
 if not found then raise exception 'Attempt not found'; end if;
 select * into s from public.scores where attempt_id=a.id;
 if found then return s; end if;
 select count(*) into correct from public.questions q where q.id=any(a.question_ids) and a.answers->>q.id::text=q.correct_index::text;
 insert into public.scores(student_id,quiz_id,attempt_id,chapter_id,correct_count,question_count,score)
 values(a.student_id,a.quiz_id,a.id,(select chapter_id from public.assigned_quizzes where id=a.quiz_id),correct,cardinality(a.question_ids),round(100.0*correct/cardinality(a.question_ids),2)) returning * into s;
 update public.quiz_attempts set submitted_at=clock_timestamp() where id=a.id;
 return s;
end; $$;

-- Expired attempts are also graded while the browser is closed.
create function public.finalize_expired_quizzes() returns void language plpgsql security definer set search_path='' as $$
declare a public.quiz_attempts; correct integer;
begin
 for a in select * from public.quiz_attempts where submitted_at is null and deadline<=clock_timestamp() for update skip locked loop
  select count(*) into correct from public.questions q where q.id=any(a.question_ids) and a.answers->>q.id::text=q.correct_index::text;
  insert into public.scores(student_id,quiz_id,attempt_id,chapter_id,correct_count,question_count,score) values(a.student_id,a.quiz_id,a.id,(select chapter_id from public.assigned_quizzes where id=a.quiz_id),correct,cardinality(a.question_ids),round(100.0*correct/cardinality(a.question_ids),2)) on conflict(attempt_id) do nothing;
  update public.quiz_attempts set submitted_at=clock_timestamp() where id=a.id;
 end loop;
end; $$;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_teacher(),public.start_quiz(uuid),public.save_answer(uuid,bigint,integer),public.submit_quiz(uuid) to authenticated;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('finalize-expired-quizzes','* * * * *','select public.finalize_expired_quizzes()');
insert into public.assigned_quizzes(chapter_id) select generate_series(1,12);

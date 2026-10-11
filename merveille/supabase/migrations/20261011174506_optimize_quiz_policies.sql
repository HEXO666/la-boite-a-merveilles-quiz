-- Keep ownership and teacher checks constant for each statement.
alter policy users_read on public.users using (id=(select auth.uid()) or (select public.is_teacher()));
alter policy attempts_read on public.quiz_attempts using (student_id=(select auth.uid()) or (select public.is_teacher()));
alter policy scores_read on public.scores using (student_id=(select auth.uid()) or (select public.is_teacher()));
alter policy assignments_read on public.assigned_quizzes using (is_active or (select public.is_teacher()));
alter policy assignments_update on public.assigned_quizzes using ((select public.is_teacher())) with check ((select public.is_teacher()));
alter policy question_teacher on public.questions using ((select public.is_teacher())) with check ((select public.is_teacher()));
create index quiz_attempts_quiz_idx on public.quiz_attempts(quiz_id);
create index scores_quiz_idx on public.scores(quiz_id);
create index quiz_attempts_pending_deadline_idx on public.quiz_attempts(deadline) where submitted_at is null;

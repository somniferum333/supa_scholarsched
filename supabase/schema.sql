create table public.scheduling_periods (
  id            bigint generated always as identity primary key,
  academic_year text not null,                       -- e.g. 2026-2027
  semester      text not null check (semester in ('1st','2nd','Summer')),
  is_active     boolean not null default false
);
-- Only one period can be active at a time
create unique index one_active_period on public.scheduling_periods (is_active) where is_active;
 
create table public.programs (
  id           bigint generated always as identity primary key,
  program_name text not null unique
);
 
create table public.year_levels (
  id         bigint generated always as identity primary key,
  year_level text not null unique
);
 
create table public.subjects (
  id           bigint generated always as identity primary key,
  subject_code text not null unique,
  subject_name text not null,
  units        smallint not null check (units > 0),
  prerequisite text
);
 
create table public.teachers (
  id           bigint generated always as identity primary key,
  teacher_name text not null,
  email        text,
  availability text
);
 
create table public.rooms (
  id           bigint generated always as identity primary key,
  room_name    text not null unique,
  availability text not null default 'Available' check (availability in ('Available','Unavailable'))
);
 
-- One row per staff login (Program Head or Teacher). Students have no account.
create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       text not null check (role in ('admin','teacher')),
  teacher_id bigint references public.teachers(id) on delete set null
);
 
create table public.schedules (
  id            bigint generated always as identity primary key,
  period_id     bigint not null references public.scheduling_periods(id),
  subject_id    bigint not null references public.subjects(id),
  program_id    bigint not null references public.programs(id),
  year_level_id bigint not null references public.year_levels(id),
  teacher_id    bigint not null references public.teachers(id),
  room_id       bigint not null references public.rooms(id),
  day           text   not null check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
  start_time    time   not null,
  end_time      time   not null,
  status        text   not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED')),
  created_at    timestamptz not null default now(),
  check (end_time > start_time),
 
  -- Conflict rules enforced by the database itself. '[)' means back-to-back
  -- classes (8-9 then 9-10) do NOT overlap. Drafts and published both count.
  constraint no_room_overlap exclude using gist (
    period_id with =, day with =, room_id with =,
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time, '[)') with &&),
  constraint no_teacher_overlap exclude using gist (
    period_id with =, day with =, teacher_id with =,
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time, '[)') with &&),
  constraint no_program_year_overlap exclude using gist (
    period_id with =, day with =, program_id with =, year_level_id with =,
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time, '[)') with &&)
);
 
-- ---------- Helper functions ----------
 
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;
 
create function public.my_teacher_id() returns bigint
language sql stable security definer set search_path = public as $$
  select teacher_id from public.profiles where user_id = auth.uid();
$$;
 
-- ---------- Row Level Security ----------
 
alter table public.scheduling_periods enable row level security;
alter table public.programs           enable row level security;
alter table public.year_levels        enable row level security;
alter table public.subjects           enable row level security;
alter table public.teachers           enable row level security;
alter table public.rooms              enable row level security;
alter table public.profiles           enable row level security;
alter table public.schedules          enable row level security;
 
-- Program Head: full control of the scheduling data
do $$
declare t text;
begin
  foreach t in array array['scheduling_periods','programs','year_levels','subjects','teachers','rooms'] loop
    execute format(
      'create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
 
-- Everyone (including anonymous students) may read the picker data
create policy public_read on public.programs           for select to anon, authenticated using (true);
create policy public_read on public.year_levels        for select to anon, authenticated using (true);
create policy public_read on public.scheduling_periods for select to anon, authenticated using (true);
 
-- Profiles: you can read your own; the Program Head manages all
create policy own_profile  on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy admin_all    on public.profiles for all    to authenticated using (public.is_admin()) with check (public.is_admin());
 
-- Schedules: Program Head only. Only DRAFTs can be deleted.
create policy admin_select on public.schedules for select to authenticated using (public.is_admin());
create policy admin_insert on public.schedules for insert to authenticated with check (public.is_admin());
create policy admin_update on public.schedules for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_delete on public.schedules for delete to authenticated using (public.is_admin() and status = 'DRAFT');
 
-- ---------- Read-only views ----------
-- Views run with the owner's rights, so they expose ONLY the columns and rows
-- below. Students never touch the raw tables (no teacher emails, no drafts).
 
create view public.student_schedule as
select s.id, s.program_id, s.year_level_id, s.day, s.start_time, s.end_time,
       sub.subject_code, sub.subject_name, sub.units,
       t.teacher_name, r.room_name
from public.schedules s
join public.scheduling_periods p on p.id = s.period_id and p.is_active
join public.subjects sub on sub.id = s.subject_id
join public.teachers t   on t.id = s.teacher_id
join public.rooms r      on r.id = s.room_id
where s.status = 'PUBLISHED';
 
create view public.teacher_schedule as
select s.id, s.day, s.start_time, s.end_time, s.status,
       sub.subject_code, sub.subject_name, sub.units,
       pr.program_name, y.year_level, t.teacher_name, r.room_name
from public.schedules s
join public.scheduling_periods p on p.id = s.period_id and p.is_active
join public.subjects sub   on sub.id = s.subject_id
join public.programs pr    on pr.id = s.program_id
join public.year_levels y  on y.id = s.year_level_id
join public.teachers t     on t.id = s.teacher_id
join public.rooms r        on r.id = s.room_id
where s.status = 'PUBLISHED' and s.teacher_id = public.my_teacher_id();
 
grant select on public.student_schedule to anon, authenticated;
revoke all   on public.teacher_schedule from anon;
grant select on public.teacher_schedule to authenticated;
 
-- ---------- Create a schedule with friendly conflict messages ----------
 
create function public.create_schedule(
  p_subject_id bigint, p_program_id bigint, p_year_level_id bigint,
  p_teacher_id bigint, p_room_id bigint, p_day text,
  p_start time, p_end time
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_period    bigint;
  v_conflicts text[] := '{}';
  v_row       public.schedules%rowtype;
  v_name      text;
  v_id        bigint;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to do this');
  end if;
  if p_end <= p_start then
    return jsonb_build_object('ok', false, 'error', 'End time must be after start time');
  end if;
 
  select id into v_period from public.scheduling_periods where is_active limit 1;
  if v_period is null then
    return jsonb_build_object('ok', false, 'error', 'No active scheduling period');
  end if;
 
  -- Overlap rule: new_start < existing_end AND new_end > existing_start
  select * into v_row from public.schedules
   where period_id = v_period and day = p_day and room_id = p_room_id
     and p_start < end_time and p_end > start_time limit 1;
  if found then
    select room_name into v_name from public.rooms where id = p_room_id;
    v_conflicts := v_conflicts || format('Schedule Conflict: %s is already occupied on %s from %s–%s.',
      v_name, p_day, to_char(v_row.start_time, 'FMHH12:MI AM'), to_char(v_row.end_time, 'FMHH12:MI AM'));
  end if;
 
  select * into v_row from public.schedules
   where period_id = v_period and day = p_day and teacher_id = p_teacher_id
     and p_start < end_time and p_end > start_time limit 1;
  if found then
    select teacher_name into v_name from public.teachers where id = p_teacher_id;
    v_conflicts := v_conflicts || format('Schedule Conflict: %s already has a class on %s from %s–%s.',
      v_name, p_day, to_char(v_row.start_time, 'FMHH12:MI AM'), to_char(v_row.end_time, 'FMHH12:MI AM'));
  end if;
 
  select * into v_row from public.schedules
   where period_id = v_period and day = p_day
     and program_id = p_program_id and year_level_id = p_year_level_id
     and p_start < end_time and p_end > start_time limit 1;
  if found then
    v_conflicts := v_conflicts || format('Schedule Conflict: this Program and Year Level already has a class on %s from %s–%s.',
      p_day, to_char(v_row.start_time, 'FMHH12:MI AM'), to_char(v_row.end_time, 'FMHH12:MI AM'));
  end if;
 
  if array_length(v_conflicts, 1) > 0 then
    return jsonb_build_object('ok', false, 'error', 'Schedule Conflict', 'conflicts', to_jsonb(v_conflicts));
  end if;
 
  begin
    insert into public.schedules
      (period_id, subject_id, program_id, year_level_id, teacher_id, room_id, day, start_time, end_time, status)
    values
      (v_period, p_subject_id, p_program_id, p_year_level_id, p_teacher_id, p_room_id, p_day, p_start, p_end, 'DRAFT')
    returning id into v_id;
  exception
    -- Safety net: two people saving the same slot at the same moment
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'error', 'Schedule Conflict',
        'conflicts', jsonb_build_array('Schedule Conflict: this time was just taken. Check again.'));
    when foreign_key_violation then
      return jsonb_build_object('ok', false, 'error', 'One of the selected items does not exist');
    when check_violation then
      return jsonb_build_object('ok', false, 'error', 'Invalid day or time');
  end;
 
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
 
revoke all on function public.create_schedule(bigint,bigint,bigint,bigint,bigint,text,time,time) from public, anon;
grant execute on function public.create_schedule(bigint,bigint,bigint,bigint,bigint,text,time,time) to authenticated;
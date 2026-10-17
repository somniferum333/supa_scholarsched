insert into public.scheduling_periods (academic_year, semester, is_active) values ('2026-2027', '2nd', true);
 
insert into public.programs (program_name) values ('BS Computer Science'), ('BS Information Technology');
insert into public.year_levels (year_level) values ('1st Year'), ('2nd Year'), ('3rd Year'), ('4th Year');
 
insert into public.subjects (subject_code, subject_name, units, prerequisite) values
  ('CS101', 'Introduction to Computing', 3, null),
  ('CS102', 'Computer Programming 1', 3, 'CS101'),
  ('CS201', 'Data Structures', 3, 'CS102');
 
insert into public.teachers (teacher_name, email, availability) values
  ('Juan Dela Cruz', 'juan@example.com', 'Mon-Fri'),
  ('Maria Santos', 'maria@example.com', 'Mon-Fri');
 
insert into public.rooms (room_name, availability) values
  ('Room 201', 'Available'), ('Room 202', 'Available'), ('Lab 1', 'Available');
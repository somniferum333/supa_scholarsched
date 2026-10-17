--   head@example.com    (Program Head)
--   juan@example.com    (Teacher)
--   maria@example.com   (Teacher)
 
insert into public.profiles (user_id, name, role)
select id, 'Program Head', 'admin' from auth.users where email = 'head@example.com';
 
insert into public.profiles (user_id, name, role, teacher_id)
select u.id, 'Juan Dela Cruz', 'teacher', (select id from public.teachers where email = 'juan@example.com')
from auth.users u where u.email = 'juan@example.com';
 
insert into public.profiles (user_id, name, role, teacher_id)
select u.id, 'Maria Santos', 'teacher', (select id from public.teachers where email = 'maria@example.com')
from auth.users u where u.email = 'maria@example.com';
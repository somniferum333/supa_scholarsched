const $ = (id) => document.getElementById(id);
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 
let currentUser = null; // { id, name, role, teacher_id }
 
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
 
function esc(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}
 
function to12h(time) {               // "08:00:00" -> "8:00 AM"
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}
 
function sortSchedules(rows) {
  return rows.sort((a, b) =>
    DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start_time.localeCompare(b.start_time));
}
 
function roleLabel(role) {
  return { admin: 'Program Head', teacher: 'Teacher' }[role] || role;
}
 
/* ---------- views ---------- */
 
function showLogin() {
  currentUser = null;
  $('app-view').hidden = true;
  $('student-view').hidden = true;
  $('login-view').hidden = false;
}
 
async function showApp(user) {
  currentUser = user;
  $('login-view').hidden = true;
  $('student-view').hidden = true;
  $('app-view').hidden = false;
  $('user-label').textContent = `${user.name} (${roleLabel(user.role)})`;
 
  const isAdmin = user.role === 'admin';
  $('create-panel').hidden = !isAdmin;
  document.querySelectorAll('.admin-only').forEach((el) => (el.hidden = !isAdmin));
  $('list-title').textContent = isAdmin ? 'All schedules' : 'My published schedule';
 
  if (isAdmin) await loadLookups();
  else await loadPeriodLabel();
  await loadSchedules();
}
 
/* ---------- login / logout ---------- */
 
async function loadProfile(authUser) {
  const { data, error } = await sb
    .from('profiles')
    .select('name, role, teacher_id')
    .eq('user_id', authUser.id)
    .maybeSingle();
  if (error || !data) return null;
  return { id: authUser.id, ...data };
}
 
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = $('login-error');
  errBox.hidden = true;
 
  const { data, error } = await sb.auth.signInWithPassword({
    email: $('login-email').value.trim(),
    password: $('login-password').value,
  });
  if (error) {
    errBox.textContent = 'Invalid email or password';
    errBox.hidden = false;
    return;
  }
 
  const profile = await loadProfile(data.user);
  if (!profile) {
    await sb.auth.signOut();
    errBox.textContent = 'This account has no role assigned. Ask the Program Head.';
    errBox.hidden = false;
    return;
  }
  $('login-password').value = '';
  showApp(profile);
});
 
$('logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  showStudent();
});
 
/* ---------- period label and dropdowns ---------- */
 
async function loadPeriodLabel() {
  const { data } = await sb
    .from('scheduling_periods')
    .select('academic_year, semester')
    .eq('is_active', true)
    .maybeSingle();
  $('period-label').textContent = data
    ? `${data.academic_year}, ${data.semester} Semester`
    : 'No active scheduling period';
}
 
function fillSelect(id, rows, labelFn) {
  $(id).innerHTML = rows
    .map((r) => `<option value="${esc(r.id)}">${esc(labelFn(r))}</option>`)
    .join('');
}
 
async function loadLookups() {
  const [subjects, programs, years, teachers, rooms] = await Promise.all([
    sb.from('subjects').select('id, subject_code, subject_name').order('subject_code'),
    sb.from('programs').select('id, program_name').order('program_name'),
    sb.from('year_levels').select('id, year_level').order('id'),
    sb.from('teachers').select('id, teacher_name').order('teacher_name'),
    sb.from('rooms').select('id, room_name').order('room_name'),
  ]);
  fillSelect('f-subject', subjects.data || [], (r) => `${r.subject_code} – ${r.subject_name}`);
  fillSelect('f-program', programs.data || [], (r) => r.program_name);
  fillSelect('f-year', years.data || [], (r) => r.year_level);
  fillSelect('f-teacher', teachers.data || [], (r) => r.teacher_name);
  fillSelect('f-room', rooms.data || [], (r) => r.room_name);
  await loadPeriodLabel();
}
 
/* ---------- schedule table (staff) ---------- */
 
async function fetchStaffSchedules() {
  if (currentUser.role === 'admin') {
    const { data, error } = await sb
      .from('schedules')
      .select(`id, day, start_time, end_time, status,
               subjects(subject_code, subject_name),
               programs(program_name), year_levels(year_level),
               teachers(teacher_name), rooms(room_name),
               scheduling_periods!inner(is_active)`)
      .eq('scheduling_periods.is_active', true);
    if (error) return null;
    return data.map((s) => ({
      id: s.id, day: s.day, start_time: s.start_time, end_time: s.end_time, status: s.status,
      subject_code: s.subjects.subject_code, subject_name: s.subjects.subject_name,
      program_name: s.programs.program_name, year_level: s.year_levels.year_level,
      teacher_name: s.teachers.teacher_name, room_name: s.rooms.room_name,
    }));
  }
  const { data, error } = await sb.from('teacher_schedule').select('*');
  return error ? null : data;
}
 
async function loadSchedules() {
  const rows = await fetchStaffSchedules();
  const body = $('schedule-body');
  if (!rows) {
    body.innerHTML = '';
    return;
  }
  sortSchedules(rows);
 
  const isAdmin = currentUser.role === 'admin';
  body.innerHTML = rows.map((s) => `
    <tr>
      <td>${esc(s.subject_code)} – ${esc(s.subject_name)}</td>
      <td>${esc(s.program_name)}, ${esc(s.year_level)}</td>
      <td>${esc(s.teacher_name)}</td>
      <td>${esc(s.room_name)}</td>
      <td>${esc(s.day)}</td>
      <td>${to12h(s.start_time)} – ${to12h(s.end_time)}</td>
      <td><span class="badge ${esc(s.status)}">${esc(s.status)}</span></td>
      ${isAdmin ? `<td class="actions">${actionButtons(s)}</td>` : ''}
    </tr>`).join('');
 
  const empty = $('empty-msg');
  empty.hidden = rows.length > 0;
  empty.textContent = isAdmin
    ? 'No schedules yet. Create one above.'
    : 'Nothing is published for you yet.';
}
 
function actionButtons(s) {
  if (s.status === 'DRAFT') {
    return `<button data-id="${s.id}" data-action="publish" class="primary">Publish</button>
            <button data-id="${s.id}" data-action="delete" class="danger">Delete</button>`;
  }
  return `<button data-id="${s.id}" data-action="unpublish">Unpublish</button>`;
}
 
async function changeStatus(id, action) {
  let result;
  if (action === 'publish') {
    result = await sb.from('schedules').update({ status: 'PUBLISHED' }).eq('id', id).eq('status', 'DRAFT').select();
    return { ok: !result.error && result.data.length > 0, message: 'Published', error: 'Only drafts can be published' };
  }
  if (action === 'unpublish') {
    result = await sb.from('schedules').update({ status: 'DRAFT' }).eq('id', id).eq('status', 'PUBLISHED').select();
    return { ok: !result.error && result.data.length > 0, message: 'Returned to draft', error: 'Only published schedules can be unpublished' };
  }
  result = await sb.from('schedules').delete().eq('id', id).eq('status', 'DRAFT').select();
  return { ok: !result.error && result.data.length > 0, message: 'Draft deleted', error: 'Only drafts can be deleted. Unpublish it first.' };
}
 
$('schedule-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { id, action } = btn.dataset;
 
  if (action === 'delete' && !confirm('Delete this draft schedule?')) return;
 
  btn.disabled = true;
  const res = await changeStatus(Number(id), action);
  showFormAlert(res.ok ? 'ok' : 'error', res.ok ? res.message : res.error);
  loadSchedules();
});
 
/* ---------- create schedule ---------- */
 
function showFormAlert(type, message, list = []) {
  const box = $('form-alert');
  box.className = `alert ${type}`;
  box.innerHTML = esc(message) +
    (list.length ? `<ul>${list.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '');
  box.hidden = false;
}
 
$('schedule-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('form-alert').hidden = true;
 
  const { data, error } = await sb.rpc('create_schedule', {
    p_subject_id: Number($('f-subject').value),
    p_program_id: Number($('f-program').value),
    p_year_level_id: Number($('f-year').value),
    p_teacher_id: Number($('f-teacher').value),
    p_room_id: Number($('f-room').value),
    p_day: $('f-day').value,
    p_start: $('f-start').value,
    p_end: $('f-end').value,
  });
 
  if (error) {
    showFormAlert('error', 'Could not save the schedule. Please try again.');
  } else if (data.ok) {
    showFormAlert('ok', 'Saved as draft.');
    loadSchedules();
  } else if (data.conflicts) {
    showFormAlert('error', 'Not saved. Change the details and check again.', data.conflicts);
  } else {
    showFormAlert('error', data.error || 'Could not save the schedule');
  }
});
 
/* ---------- student view (no login) ---------- */
 
async function showStudent() {
  currentUser = null;
  $('app-view').hidden = true;
  $('login-view').hidden = true;
  $('student-view').hidden = false;
 
  const [period, programs, years] = await Promise.all([
    sb.from('scheduling_periods').select('academic_year, semester').eq('is_active', true).maybeSingle(),
    sb.from('programs').select('id, program_name').order('program_name'),
    sb.from('year_levels').select('id, year_level').order('id'),
  ]);
 
  $('student-period').textContent = period.data
    ? `${period.data.academic_year}, ${period.data.semester} Semester`
    : '';
 
  const withPlaceholder = (label, rows, labelKey) =>
    `<option value="">${label}</option>` +
    (rows || []).map((r) => `<option value="${esc(r.id)}">${esc(r[labelKey])}</option>`).join('');
 
  $('s-program').innerHTML = withPlaceholder('Select program', programs.data, 'program_name');
  $('s-year').innerHTML = withPlaceholder('Select year level', years.data, 'year_level');
 
  // Remember the last choice on this device (convenience only)
  try {
    const saved = JSON.parse(localStorage.getItem('scholarsched_student') || '{}');
    if (saved.program) $('s-program').value = saved.program;
    if (saved.year) $('s-year').value = saved.year;
  } catch (_) { /* storage unavailable */ }
 
  loadStudentSchedule();
}
 
async function loadStudentSchedule() {
  const program = $('s-program').value;
  const year = $('s-year').value;
  const body = $('student-body');
  const empty = $('student-empty');
 
  try {
    localStorage.setItem('scholarsched_student', JSON.stringify({ program, year }));
  } catch (_) { /* storage unavailable */ }
 
  if (!program || !year) {
    body.innerHTML = '';
    empty.textContent = 'Choose your program and year level.';
    empty.hidden = false;
    return;
  }
 
  const { data, error } = await sb
    .from('student_schedule')
    .select('*')
    .eq('program_id', Number(program))
    .eq('year_level_id', Number(year));
 
  if (error) {
    body.innerHTML = '';
    empty.textContent = 'Could not load the schedule.';
    empty.hidden = false;
    return;
  }
 
  sortSchedules(data);
  body.innerHTML = data.map((s) => `
    <tr>
      <td>${esc(s.subject_code)} – ${esc(s.subject_name)}</td>
      <td>${esc(s.teacher_name)}</td>
      <td>${esc(s.room_name)}</td>
      <td>${esc(s.day)}</td>
      <td>${to12h(s.start_time)} – ${to12h(s.end_time)}</td>
    </tr>`).join('');
 
  empty.hidden = data.length > 0;
  empty.textContent = 'No published schedule for this program and year level yet.';
}
 
$('s-program').addEventListener('change', loadStudentSchedule);
$('s-year').addEventListener('change', loadStudentSchedule);
$('show-login-btn').addEventListener('click', showLogin);
$('back-to-student').addEventListener('click', showStudent);
 
/* ---------- start ---------- */
 
(async function init() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    const profile = await loadProfile(data.session.user);
    if (profile) return showApp(profile);
    await sb.auth.signOut();
  }
  showStudent();
})();
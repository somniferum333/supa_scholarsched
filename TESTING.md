# Testing ScholarSched

ScholarSched has no automated test suite, so testing is done in four layers. Work through
them in order. Each layer finds a different kind of problem.

| Layer | What it proves | Tool |
| --- | --- | --- |
| 1. Setup check | The database, users, and config are in place | Supabase dashboard |
| 2. Functional tests | The app behaves as the workflow describes | Browser |
| 3. Security tests | Each role can only do what it should | Browser console |
| 4. API and database tests | The rules hold without the front end | Postman, SQL Editor |

Record every result in the test log at the end. It is good evidence for your project.

## 1. Setup check

In the Supabase dashboard:

1. **Table Editor** shows these tables with rows: `scheduling_periods` (1, with `is_active`
   true), `programs` (2), `year_levels` (4), `subjects` (3), `teachers` (2), `rooms` (3),
   `profiles` (3). `schedules` is empty.
2. **Authentication > Users** lists the three staff users.
3. **Database > Extensions** shows `btree_gist` enabled. Without it `schema.sql` fails.
4. `public/js/config.js` has your real project URL and anon key, not the placeholders.
5. Open the app through Live Server or `python -m http.server`. The student page shows the
   Program and Year level dropdowns filled in. Empty dropdowns mean the config or the seed
   data is wrong. Press **F12** and read the Console for the error.

## 2. Functional tests (browser)

Use a private/incognito window for the student tests so no staff session interferes.

### 2.1 Student page (no login)

| # | Test | Expected |
| --- | --- | --- |
| S1 | Open the site | Student page with Program and Year level pickers |
| S2 | Pick nothing | "Choose your program and year level." |
| S3 | Pick a group with nothing published | "No published schedule for this program and year level yet." |
| S4 | Pick a group with a published schedule | Only that group's classes appear |
| S5 | Reload the page | The last choice is remembered on this device |

### 2.2 Login

| # | Test | Expected |
| --- | --- | --- |
| L1 | Staff log in with a wrong password | "Invalid email or password" |
| L2 | Log in as the Program Head | Create form and all-schedules table, period label at the top |
| L3 | Log in as a teacher | Only "My published schedule", no create form, no action buttons |
| L4 | Log out | Returns to the student page |
| L5 | Reload while logged in | Still logged in |

### 2.3 Creating schedules and conflicts (Program Head)

Create the first schedule: CS101, BS Computer Science, 3rd Year, Juan Dela Cruz, Room 201,
Monday 8:00-9:00 AM.

| # | Test | Expected |
| --- | --- | --- |
| C1 | Save the schedule above | "Saved as draft." It appears with status DRAFT |
| C2 | Same room, Monday 8:30-9:30, different teacher and a different program | Room conflict, not saved |
| C3 | Same teacher, Monday 8:30-9:30, different room and a different program | Teacher conflict, not saved |
| C4 | Same program and year, Monday 8:30-9:30, different room and a different teacher | Program/Year Level conflict, not saved |
| C5 | Room 201, Monday 9:00-10:00, different teacher and program | **Saved** (back-to-back is not an overlap) |
| C6 | Same room, a different day | Saved |
| C7 | Start 10:00, end 9:00 | Rejected: end time must be after start time |
| C8 | Create a schedule that hits room, teacher, and program at once | One alert listing all three conflicts |

### 2.4 Draft and publish workflow

| # | Test | Expected |
| --- | --- | --- |
| P1 | Publish a draft | Status becomes PUBLISHED, buttons change to Unpublish |
| P2 | No Delete button on a published row | Confirmed |
| P3 | Unpublish | Returns to DRAFT |
| P4 | Delete a draft | Confirmation prompt, then removed |

### 2.5 Visibility

Create and publish two schedules: one for Juan with BS Computer Science 3rd Year, one for
Maria with BS Information Technology 2nd Year.

| # | Test | Expected |
| --- | --- | --- |
| V1 | Log in as Juan | Sees only his schedule |
| V2 | Log in as Maria | Sees only hers |
| V3 | Student picks BS Computer Science, 3rd Year | Sees only the first schedule |
| V4 | Student picks BS Information Technology, 2nd Year | Sees only the second |
| V5 | Program Head unpublishes the first, then teacher and student refresh | It disappears for both |
| V6 | Create a draft and never publish it | Never appears for any teacher or student |

## 3. Security tests (browser console)

The safety of this system depends on Row Level Security, so test it directly. These
commands call Supabase exactly as the page does. Open the site, press **F12**, choose the
**Console** tab, and paste each line. `sb` is the Supabase client defined in `schedules.js`.

A blocked read returns an **empty list**, not an error. That is correct.

### 3.1 As an anonymous student (not logged in)

```js
(await sb.from('schedules').select()).data          // expect []  (no drafts, no raw table)
(await sb.from('teachers').select()).data           // expect []  (no teacher emails)
(await sb.from('profiles').select()).data           // expect []
(await sb.from('student_schedule').select()).data   // expect published classes only
(await sb.from('schedules').insert({status:'DRAFT'})).error   // expect an error
(await sb.rpc('create_schedule', {p_subject_id:1,p_program_id:1,p_year_level_id:1,
  p_teacher_id:1,p_room_id:1,p_day:'Monday',p_start:'13:00',p_end:'14:00'})).error  // expect a permission error
```

### 3.2 As a teacher (log in as Juan first)

```js
(await sb.from('teacher_schedule').select()).data   // expect only Juan's published classes
(await sb.from('schedules').select()).data          // expect []
(await sb.from('schedules').update({status:'PUBLISHED'}).eq('id',1).select()).data  // expect []
(await sb.from('schedules').delete().eq('id',1).select()).data                      // expect []
(await sb.rpc('create_schedule', {p_subject_id:1,p_program_id:1,p_year_level_id:1,
  p_teacher_id:1,p_room_id:1,p_day:'Tuesday',p_start:'13:00',p_end:'14:00'})).data
  // expect { ok: false, error: "You do not have permission to do this" }
```

### 3.3 As the Program Head

```js
// Deleting a PUBLISHED schedule must delete nothing (replace 1 with a published id)
(await sb.from('schedules').delete().eq('id',1).eq('status','PUBLISHED').select()).data  // expect []
```

If any anonymous or teacher test returns data it should not, **stop and fix the policy in
`schema.sql` before going further.** That is a real data leak.

## 4. API and database tests

### 4.1 Database rules without the front end (SQL Editor)

The SQL Editor bypasses Row Level Security, but the exclusion constraints still apply, so
this tests the second layer of conflict protection. First create the C1 schedule in the app.

```sql
-- Same room, overlapping time: expect ERROR ... violates exclusion constraint "no_room_overlap"
insert into schedules (period_id, subject_id, program_id, year_level_id, teacher_id, room_id, day, start_time, end_time)
values (1, 2, 2, 1, 2, 1, 'Monday', '08:30', '09:30');

-- Back-to-back in the same room: expect success
insert into schedules (period_id, subject_id, program_id, year_level_id, teacher_id, room_id, day, start_time, end_time)
values (1, 2, 2, 1, 2, 1, 'Monday', '09:00', '10:00');

-- End before start: expect ERROR (check constraint)
insert into schedules (period_id, subject_id, program_id, year_level_id, teacher_id, room_id, day, start_time, end_time)
values (1, 2, 2, 1, 2, 2, 'Monday', '10:00', '09:00');
```

Then clean up the row you inserted, and check that no overlaps exist in the data. This
query should return **zero rows**:

```sql
select a.id, b.id, a.day
from schedules a
join schedules b on a.id < b.id
 and a.period_id = b.period_id and a.day = b.day
 and a.start_time < b.end_time and a.end_time > b.start_time
 and (a.room_id = b.room_id or a.teacher_id = b.teacher_id
      or (a.program_id = b.program_id and a.year_level_id = b.year_level_id));
```

### 4.2 REST API tests (Postman)

Supabase exposes your tables and functions over HTTP, so Postman can test the backend
directly. Create a Postman **environment** with these variables:

| Variable | Value |
| --- | --- |
| `base` | `https://YOUR-PROJECT-REF.supabase.co` |
| `anon` | your anon key |
| `token` | filled in by the login request below |

Postman environments are ignored by `.gitignore`, so your keys and passwords stay private.

**Request 1: Log in as the Program Head** (`POST {{base}}/auth/v1/token?grant_type=password`)

- Header: `apikey: {{anon}}`
- Body (raw JSON): `{ "email": "head@example.com", "password": "YOUR-PASSWORD" }`
- Tests tab:
  ```js
  pm.test("Logged in", () => pm.response.to.have.status(200));
  pm.environment.set("token", pm.response.json().access_token);
  ```

For the next requests, add the headers `apikey: {{anon}}` and
`Authorization: Bearer {{token}}`.

| # | Request | Expected |
| --- | --- | --- |
| A1 | `GET {{base}}/rest/v1/schedules?select=*` | 200, list of schedules |
| A2 | `POST {{base}}/rest/v1/rpc/create_schedule` with the body below | 200 and `ok: true` |
| A3 | Repeat A2 with the same body | 200 and `ok: false` with a `conflicts` list |
| A4 | `PATCH {{base}}/rest/v1/schedules?id=eq.1` with `{ "status": "PUBLISHED" }` and header `Prefer: return=representation` | 200, status PUBLISHED |
| A5 | `DELETE {{base}}/rest/v1/schedules?id=eq.1` (published) with `Prefer: return=representation` | 200 and `[]`, nothing deleted |
| A6 | Log in as a teacher and repeat A2 | 200 and `ok: false`, permission error |

Body for A2:

```json
{
  "p_subject_id": 1, "p_program_id": 1, "p_year_level_id": 3,
  "p_teacher_id": 1, "p_room_id": 1,
  "p_day": "Monday", "p_start": "08:00", "p_end": "09:00"
}
```

For the anonymous student checks, use the anon key as both `apikey` and
`Authorization: Bearer`:

| # | Request | Expected |
| --- | --- | --- |
| A7 | `GET {{base}}/rest/v1/student_schedule?program_id=eq.1&year_level_id=eq.3` | 200, published classes only |
| A8 | `GET {{base}}/rest/v1/schedules` | 200 and `[]` |
| A9 | `GET {{base}}/rest/v1/teachers` | 200 and `[]` |

Add checks to each request's **Tests** tab, for example:

```js
pm.test("Status is 200", () => pm.response.to.have.status(200));
pm.test("Conflict reported", () => pm.expect(pm.response.json().ok).to.eql(false));
```

Then run the whole collection with **Run collection**. This is your automated test run.
Export the collection to the `postman/` folder and commit it.

## 5. Test on other devices

After deploying (for example to GitHub Pages):

1. Open the site on a phone using mobile data, not your Wi-Fi.
2. Check that the student picker works and the table scrolls sideways without breaking
   the page.
3. Log in as a teacher on the phone and check the schedule.

## Test log

Copy this table into your documentation and fill it in.

| ID | Test | Expected | Actual | Pass/Fail | Date | Tester |
| --- | --- | --- | --- | --- | --- | --- |
| C2 | Room conflict | Blocked with room message | | | | |
| C5 | Back-to-back classes | Saved | | | | |
| P2 | Delete a published schedule | Not allowed | | | | |
| V3 | Student sees own group only | Only that group | | | | |

## Common problems

| Symptom | Likely cause |
| --- | --- |
| `schema.sql` fails with "no default operator class for gist" | `btree_gist` is missing. Add `create extension if not exists btree_gist;` at the very top and rerun |
| Dropdowns are empty | `config.js` still has placeholders, or `seed.sql` was not run |
| Login works but "no role assigned" | `users.sql` was not run, or its emails differ from the users you created |
| Program Head sees an empty table after creating schedules | No active scheduling period (`is_active` must be true for one row) |
| Console error "sb is not defined" | You are on a different page or the script failed to load. Reload and check the Console |
| Everything works for the Program Head but teachers see nothing | The schedule is still a draft, or belongs to a different teacher |
| Changes not showing | Hard refresh with Ctrl+F5 |

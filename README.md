# ScholarSched

A web-based scheduling system for the College Department of Unida Christian Colleges.
It helps the Program Head create class schedules, detect conflicts, publish finalized
schedules, and lets teachers and students view them.

ScholarSched assists the person who builds the schedule. It does not generate the
timetable automatically.

## Features

- **Conflict detection.** A schedule cannot be saved if the same room, the same teacher,
  or the same Program + Year Level already has a class at an overlapping time on that day.
  Back-to-back classes (8:00-9:00 then 9:00-10:00) are allowed.
- **Draft and publish workflow.** New schedules are saved as private drafts. The Program Head
  publishes them, can unpublish them, and can delete drafts.
- **Student view without login.** Students choose their Program and Year Level and see only
  published schedules.
- **Teacher view.** Teachers log in and see their own published teaching schedule.
- **Scheduling period.** All schedules belong to the active Academic Year and Semester.

## Roles

| Role | Account | Can do |
| --- | --- | --- |
| Program Head | Yes | Create, publish, unpublish, and delete draft schedules |
| Teacher | Yes | View own published schedule |
| Student | No | View published schedule for a Program + Year Level |

## Tech stack

| Layer | Technology |
| --- | --- |
| Front end | HTML, CSS, JavaScript |
| Backend and database | Supabase (PostgreSQL, Auth, Row Level Security) |
| Version control | Git / GitHub |
| Development tool | VS Code |
| Testing | Postman and manual test cases (see [TESTING.md](TESTING.md)) |
| Deployment | Any static host, such as GitHub Pages |

## Project structure

```
ScholarSched/
├── .gitignore
├── README.md
├── TESTING.md
├── index.html            Redirects to public/
├── public/
│   ├── index.html        The app (student page, staff login, Program Head and teacher screens)
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── config.js     Supabase URL and anon key
│       └── schedules.js  All app logic (talks to Supabase)
└── supabase/
    ├── schema.sql        Tables, conflict constraints, security rules, views, create_schedule()
    ├── seed.sql          Sample period, programs, subjects, teachers, rooms
    └── users.sql         Links staff logins to roles (run after creating the users)
```

## Setup

### 1. Create the Supabase project

1. Create a free project at [supabase.com](https://supabase.com) and wait for it to finish starting.

### 2. Create the database

Open **SQL Editor** in the Supabase dashboard and run these files in order:

1. `supabase/schema.sql`
2. `supabase/seed.sql` (sample data; replace with real data later)

`schema.sql` must begin with `create extension if not exists btree_gist;`. The conflict
constraints need it.

### 3. Create staff logins

1. Go to **Authentication > Users > Add user** and create three users, ticking
   **Auto Confirm User**:
   - `head@example.com` (Program Head)
   - `juan@example.com` (Teacher)
   - `maria@example.com` (Teacher)
2. Run `supabase/users.sql` in the SQL Editor. It gives each login its role.

Students do not need accounts.

### 4. Connect the app

Open `public/js/config.js` and set:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-OR-PUBLISHABLE-KEY';
```

Both values are in **Project Settings > API**. Use the **anon / publishable** key only.
**Never put the `service_role` (secret) key in this project.**

### 5. Run it locally

The app is static files, but it should be served over HTTP rather than opened directly.

- **VS Code:** install the *Live Server* extension, right-click `index.html`, then
  *Open with Live Server*.
- **Or with Python:** run `python -m http.server 8000` in the project folder, then open
  `http://localhost:8000/`.

## Deploy to GitHub Pages

1. Push the project to GitHub.
2. In the repository, open **Settings > Pages**.
3. Set the source to the `main` branch and the `/ (root)` folder, then save.
4. After a minute the site is available at `https://<username>.github.io/<repository>/`.

Because the backend is Supabase, no server of your own is needed.

## Using the system

- **Students:** open the site, choose Program and Year level, and read the schedule.
- **Teachers:** click **Staff log in**, sign in, and view **My published schedule**.
- **Program Head:** click **Staff log in**, sign in, fill in the **Create schedule** form,
  then **Publish**, **Unpublish**, or **Delete** (drafts only) from the table.

## How conflicts are enforced

Two classes overlap when `new_start < existing_end` and `new_end > existing_start`, in the
same period on the same day, and they share a room, a teacher, or a Program + Year Level.

The rule is enforced twice:

1. The `create_schedule()` database function checks first and returns readable messages such
   as "Room 201 is already occupied on Monday from 8:00 AM-9:00 AM."
2. PostgreSQL exclusion constraints (`no_room_overlap`, `no_teacher_overlap`,
   `no_program_year_overlap`) block any overlap that slips through, such as two people saving
   at the same moment.

## Security notes

- The anon key is public by design. Data is protected by **Row Level Security** policies in
  `supabase/schema.sql`. Do not loosen them without testing (see [TESTING.md](TESTING.md)).
- Students read only the `student_schedule` view: published schedules for the active period,
  with no drafts and no teacher emails.
- Teachers read only their own published schedules through the `teacher_schedule` view.
- Only the Program Head can create, update, or delete schedules, and only drafts can be deleted.
- Use real passwords for real accounts and delete the sample accounts before real use.

## Limitations

- Subjects, teachers, rooms, programs, and periods are managed in the Supabase Table Editor,
  not inside the app.
- Schedules cannot be edited. To change one, unpublish it if needed, delete the draft, and
  recreate it.
- Reports (teaching load, student schedule, room availability) are not built yet.
- An internet connection is required.

## Documentation

- [TESTING.md](TESTING.md): how to test the system
- `ScholarSched_Current_Workflow_Updated.docx`: workflow and design decisions

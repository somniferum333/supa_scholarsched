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



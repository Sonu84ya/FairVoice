1) Gender Equality & Workplace Safe Reporting Platform

A complete workplace misconduct reporting platform with four dashboards
(Employee, Administrator, Supreme Administrator, NGO/INGO) and a
multi-level escalation workflow.

 Node.js + Express (backend/API) · MySQL (storage) · HTML/CSS/vanilla JavaScript (frontend, no build step)

# What's included

- Anonymous or open reporting: across 9 misconduct categories (harassment,
  gender discrimination, bullying, abuse, unfair treatment, mental
  harassment, toxic workplace behaviour, safety violations, other).
  
- Secure evidence upload: (images, PDF, Word, audio, video) with
  randomized filenames on disk and access-controlled downloads.
- Status tracking for employees, with a visual escalation ladder.

- Three-tier accountability workflow: Administrator pass to Supreme
  Administrator pass to NGO/INGO, each with their own priority-ordered queue.
  If a level doesn't act, the report can be escalated (by staff, or by the
  employee themselves if they feel it's stalled) to the next level. NGOs can
  refer a case to legal action.
  
- Support resources: page (hotlines, counseling, legal aid, policy docs).
- Full audit trail: every comment, escalation, resolution, and closure
  is timestamped and attributed on the report's timeline.
- Role-based staff provisioning: only a Supreme Administrator can create
  Administrator / Supreme Administrator / NGO accounts, so nobody can grant
  themselves elevated access via public sign-up.

---

# Project structure

gender-equality-platform/
├── backend/                  Node.js + Express API
│   ├── config/db.js          MySQL connection pool
│   ├── middleware/           JWT auth + role guards, secure file upload
│   ├── controllers/          Business logic (auth, reports, users, resources)
│   ├── routes/                Express route definitions
│   ├── sql/schema.sql         Full MySQL schema + seed support resources
│   ├── sql/seed_users.js      Creates one demo login per role
│   ├── uploads/                Evidence files are stored here (gitignored)
│   ├── server.js              App entry point
│   └── .env.example           Copy to .env and fill in
└── frontend/public/           Static HTML/CSS/JS — open directly or serve
    ├── index.html              Sign in
    ├── register.html           Employee sign-up
    ├── user-dashboard.html     Employee dashboard
    ├── admin-dashboard.html    Administrator dashboard
    ├── supreme-admin-dashboard.html
    ├── ngo-dashboard.html
    ├── css/style.css
    └── js/                     api.js, dashboard-common.js, staff-dashboard.js, user-dashboard.js



1. An employee submits a report from New Report. It's created with
   status = submitted and current_level = admin.
   
3. It appears in the Administrators priority-ordered queue
   (critical pass to high pass to medium pass to low, oldest first within each tier).
   
5. The Administrator can comment, escalate to Supreme Administrator,
   resolve, or close the case.

7. If escalated, it moves into the **Supreme Administrator**'s queue with
   the same set of actions, plus the ability to escalate to NGO/INGO.
   
9. The NGO/INGO dashboard is the final internal stage. From there a
   case can be resolved, closed, or referred to legal action
   
11. At any point before resolution, the employee who filed the report can
   open it from their dashboard and choose Not resolved — escalate this
   case to move it forward themselves, even if staff haven't acted.

13. Every step is recorded on the report's timeline, visible to the employee
   and to staff, for full accountability.

# Security notes

- Passwords are hashed with bcrypt (12 rounds); JWTs expire after 8 hours
  by default.
  
- Anonymous reports hide the employee's name/email/department from every
  staff dashboard — the employee can still track their own report.
  
- Uploaded evidence is renamed to a random token on disk; only the
  original filename is stored as metadata, and downloads are gated by the
  same access control as the report itself (owner or staff only).
  
- Only Supreme Administrators can create Administrator / Supreme
  Administrator / NGO accounts — the public registration endpoint only
  ever creates standard employee accounts.
  
- This is a functional prototype: before production use, add HTTPS
  termination, rate limiting on auth endpoints, virus scanning on
  uploads, and a real secrets manager for JWT_SECRET / DB credentials.


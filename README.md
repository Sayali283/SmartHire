# SmartHire — AI-Assisted Recruitment Platform

A full-stack recruitment platform: React frontend (Babel-in-browser, no build step) + Flask/SQLite backend. Candidates get resume feedback and can apply to jobs; recruiters post jobs, receive applications, and get resumes ranked against required skills.

This version has been hardened for a real deployment — see **What changed** below if you're comparing against an earlier copy of this project.

## Project structure

```
├── index.html          # Entry point: Tailwind CDN, fonts, React/Babel, loads App.jsx
├── App.jsx             # All React components (Navbar, Hero, Candidate/Recruiter suites, Auth, Dashboard...)
├── index.js            # Mounts <App /> to #root
├── styles.css          # Design system: palette, type, hero background, cards, buttons, focus states
├── backend.py          # Flask API + SQLite persistence
├── app.py              # Convenience launcher (installs deps, starts backend.py)
├── requirements.txt    # Python dependencies
├── data.db             # SQLite database (auto-created/auto-migrated on first run)
└── README.md
```

## Running it

```bash
pip install -r requirements.txt
python backend.py
```

Then open `http://localhost:5000`. `backend.py` serves the frontend directly, so you don't need a separate static server. `app.py` is an optional convenience wrapper that checks/installs dependencies for you first.

For anything beyond local testing, run it behind a real WSGI server instead of Flask's dev server:

```bash
gunicorn -w 4 -b 0.0.0.0:8000 backend:app
```

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Port the Flask dev server binds to | `5000` |
| `FLASK_ENV` | Set to `development` to enable debug mode/auto-reload | off (safe default) |
| `SMARTHIRE_ALLOWED_ORIGINS` | Comma-separated list of origins allowed to call the API. Leave unset only for local dev. | `*` (dev only) |

## How authentication actually works now

Login and signup return a **bearer session token**, stored in `localStorage` on the frontend (`AuthStore` in `App.jsx`) and sent as `Authorization: Bearer <token>` on every authenticated request (`authFetch` wrapper). The backend looks the token up in a `sessions` table (14-day expiry) to determine who's making the request.

This replaces the previous scheme, which trusted a plain `X-User-Email` header — meaning anyone could open dev tools, set that header to any email, and act as that recruiter. That header is still sent alongside the token for logging/display purposes only; it is **never** used to authorize anything server-side (`recruiter_auth_email()` is the single choke point every ownership check goes through, and it now only trusts the verified session).

Passwords are hashed with salted PBKDF2 (`werkzeug.security`) instead of the old unsalted SHA-256. Any existing account created under the old scheme is transparently upgraded to the new hash the next time that user logs in — no migration script needed.

## Resume matching & scoring — what it does and doesn't do

Being upfront about this matters if you're asked about it in an interview:

- **Skill matching** (`compute_match_score`, `matched_skills`) uses word-boundary regex matching plus a small alias table (`SKILL_ALIASES` in `backend.py`) so "JS" matches "JavaScript", "K8s" matches "Kubernetes", etc. It fixed a real bug where a required skill like "Java" matched any resume that only mentioned "JavaScript" (plain substring matching, `"java" in "javascript"` → `True`).
- **Resume parsing** (`extract_resume_text`) supports both PDF (via `pdfplumber`, with a `PyPDF2` fallback) and DOCX (via `python-docx`), and normalizes ligature characters (e.g. "ﬁ" → "fi") that otherwise silently break keyword matching on resumes exported from certain editors.
- **ATS score** (`/api/scan-resume`) is a transparent, rule-based heuristic — word count in a sensible range, variety (not just repetition) of action verbs, presence of standard resume sections, and genuinely quantified achievements (percentages and real numbers, not just "how many digits are in this document," which used to let a phone number inflate the score). The response includes a `breakdown` field so you can show your work.
- **Candidate ranking** (`/api/analyze-candidates`) is 70% required-skill coverage + 30% keyword overlap with the job description. It used to return two hardcoded fake candidates ("Sarah Chen", "Marcus Johnson") regardless of input — that's gone; it now scores whatever candidates you actually send it.
- None of this is a semantic/embedding model. It's deliberately simple and explainable rather than a black box — a reasonable, honest place to be for a project at this stage. If you want to go further, the natural next step is embedding-based similarity (e.g. sentence-transformers) for the text-overlap component.

## What changed from the original version

**Fixed bugs / accuracy**
- Skill matching used plain substring checks (`"java" in "javascript"` incorrectly matched); now word-boundary + alias aware.
- ATS scoring counted every digit character in the resume as a "quantified achievement" (a phone number counted the same as a real metric); now detects percentages and plausible numeric achievements specifically.
- `analyze_candidates` and `export_resume` were stubs that returned hardcoded/fake data; both are now real.
- A broken operator-precedence bug in `admin_rebuild_db` could crash on non-JSON requests; fixed.

**Security**
- Replaced spoofable `X-User-Email` header auth with real bearer-token sessions.
- Replaced unsalted SHA-256 password hashing with salted PBKDF2, with automatic upgrade for existing accounts.
- Removed hardcoded `debug=True` (the Werkzeug debugger allows remote code execution if it's ever exposed).
- CORS origins are now configurable instead of wide open by default.

**Usability**
- Login now persists across page refresh (session token in `localStorage`).
- Resume upload accepts DOCX as well as PDF, both in the UI and the backend.
- Redesigned UI: Space Grotesk/Inter type system, violet/cyan palette, a signature "neural network" hero background, elevated cards with hover states, consistent button styling, and visible keyboard focus states for accessibility.

## Known limitations (good to know before a production launch)

- Matching is keyword/heuristic-based, not semantic — a resume that says "wrote automated tests" won't be credited for a required skill of "QA automation" unless the wording overlaps or an alias is added.
- Candidate-facing endpoints (e.g. `/api/candidate/applications?email=...`) still take the email as a plain parameter rather than deriving it from the session — lower risk than the recruiter-side fix (it exposes only that candidate's own application history, not employer data), but the same token-based pattern used for recruiters should be extended here for a full production launch.
- SQLite is fine for a single-instance deployment or demo; a real multi-user production deployment should move to Postgres.
- There's no rate limiting on `/api/auth/login`, so it doesn't resist brute-force password guessing on its own — put it behind a rate limiter (e.g. Flask-Limiter or your reverse proxy) before going live.

## License

© 2024 SmartHire Neural Systems.

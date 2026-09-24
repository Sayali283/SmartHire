from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
import os
from datetime import datetime, timedelta
import sqlite3
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import hashlib
import secrets
import shutil
import time
from io import BytesIO
import re
import threading

app = Flask(__name__, static_folder='.')
# Serialize SQLite writes from multiple Flask threads (dev server) to avoid "database is locked"
_db_write_lock = threading.Lock()

# CORS: lock this down to your real frontend origin(s) in production instead of "*".
# Example: CORS(app, origins=["https://yourdomain.com"], supports_credentials=True)
ALLOWED_ORIGINS = os.environ.get('SMARTHIRE_ALLOWED_ORIGINS', '*')
CORS(app, origins=(ALLOWED_ORIGINS.split(',') if ALLOWED_ORIGINS != '*' else '*'))

app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
app.config['EXPORT_FOLDER'] = os.path.join(os.path.dirname(__file__), 'exports')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB is plenty for a resume PDF/DOCX
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['EXPORT_FOLDER'], exist_ok=True)

SESSION_TTL_HOURS = 24 * 14  # 14 days

def db_conn():
    path = os.path.join(os.path.dirname(__file__), 'data.db')
    # timeout: seconds to wait on "database is locked" before failing
    conn = sqlite3.connect(path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute('PRAGMA foreign_keys=ON')
    except Exception:
        pass
    try:
        # WAL allows one writer + concurrent readers; reduces "database is locked" under Flask
        conn.execute('PRAGMA journal_mode=WAL')
    except Exception:
        pass
    try:
        conn.execute('PRAGMA synchronous=NORMAL')
    except Exception:
        pass
    try:
        conn.execute('PRAGMA busy_timeout=30000')
    except Exception:
        pass
    return conn

def db_path():
    return os.path.join(os.path.dirname(__file__), 'data.db')

def _session_token_from_request():
    auth = request.headers.get('Authorization', '') or ''
    if auth.lower().startswith('bearer '):
        return auth[7:].strip()
    # fallback header some older frontend code may still send
    return (request.headers.get('X-Session-Token') or '').strip()


def create_session(email, user_type):
    """Create a signed-in session for email/user_type, returns a bearer token.
    This is what real authorization should be based on -- never trust a
    client-supplied 'X-User-Email' header on its own, since anyone can set it."""
    token = secrets.token_urlsafe(32)
    conn = db_conn()
    cur = conn.cursor()
    expires_at = (datetime.now() + timedelta(hours=SESSION_TTL_HOURS)).isoformat()
    cur.execute(
        'INSERT INTO sessions (token, email, user_type, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        (token, (email or '').strip().lower(), user_type or '', datetime.now().isoformat(), expires_at)
    )
    conn.commit()
    conn.close()
    return token


def get_session():
    """Returns the session row for the current request's bearer token, or None
    if missing/invalid/expired. This is the ONLY thing protected routes should
    trust for identity -- request headers like X-User-Email are just labels."""
    token = _session_token_from_request()
    if not token:
        return None
    conn = db_conn()
    cur = conn.cursor()
    row = cur.execute('SELECT * FROM sessions WHERE token=?', (token,)).fetchone()
    conn.close()
    if not row:
        return None
    try:
        if datetime.fromisoformat(row['expires_at']) < datetime.now():
            return None
    except Exception:
        return None
    return row


def recruiter_auth_email():
    """Authoritative recruiter identity: derived from a verified session token,
    NOT from the client-supplied X-User-Email header (which can be spoofed by
    anyone with dev tools). Every ownership check in this file funnels through
    here, so fixing it here fixes authorization for the whole recruiter API."""
    session = get_session()
    if session and (session['user_type'] or '').lower() == 'recruiter':
        return (session['email'] or '').strip().lower()
    return ''

def job_managed_by_request_recruiter(job_row):
    if not job_row:
        return False
    owner = (job_row['recruiter_email'] or '').strip().lower()
    me = recruiter_auth_email()
    return bool(me) and bool(owner) and owner == me

def assert_recruiter_owns_job(cur, job_id):
    """Returns (job_row, None) on success, or (None, (json_body, status_code))."""
    me = recruiter_auth_email()
    if not me:
        return None, ({'error': 'Authentication required'}, 401)
    job = cur.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
    if not job:
        return None, ({'error': 'Job not found'}, 404)
    if not job_managed_by_request_recruiter(job):
        return None, ({'error': 'Forbidden'}, 403)
    return job, None

def assert_recruiter_owns_resume(cur, resume_id):
    me = recruiter_auth_email()
    if not me:
        return None, ({'error': 'Authentication required'}, 401)
    row = cur.execute(
        'SELECT resumes.id, jobs.recruiter_email FROM resumes JOIN jobs ON jobs.id = resumes.job_id WHERE resumes.id=?',
        (resume_id,)
    ).fetchone()
    if not row:
        return None, ({'error': 'Resume not found'}, 404)
    owner = (row['recruiter_email'] or '').strip().lower()
    if owner != me:
        return None, ({'error': 'Forbidden'}, 403)
    return row, None

def assert_recruiter_owns_application(cur, app_id):
    me = recruiter_auth_email()
    if not me:
        return None, ({'error': 'Authentication required'}, 401)
    row = cur.execute(
        'SELECT applications.id, jobs.recruiter_email FROM applications JOIN jobs ON jobs.id = applications.job_id WHERE applications.id=?',
        (app_id,)
    ).fetchone()
    if not row:
        return None, ({'error': 'Application not found'}, 404)
    owner = (row['recruiter_email'] or '').strip().lower()
    if owner != me:
        return None, ({'error': 'Forbidden'}, 403)
    return row, None

def integrity_ok():
    try:
        conn = db_conn()
        cur = conn.cursor()
        rows = cur.execute('PRAGMA integrity_check').fetchall()
        conn.close()
        if not rows:
            return False
        return all(r[0].lower() == 'ok' for r in rows)
    except sqlite3.DatabaseError:
        return False
    except Exception:
        return False

def backup_db():
    try:
        src = db_path()
        if os.path.exists(src):
            ts = time.strftime('%Y%m%d%H%M%S')
            dst = os.path.join(os.path.dirname(src), f'data.db.bak-{ts}')
            shutil.move(src, dst)
            return dst
    except Exception:
        pass
    return None

def rebuild_db_fresh():
    b = backup_db()
    init_db()
    return b

def init_db():
    conn = db_conn()
    cur = conn.cursor()
    cur.execute('CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, recruiter_email TEXT, company TEXT, position TEXT NOT NULL, location TEXT NOT NULL, mode TEXT NOT NULL, details TEXT, skills TEXT, openings INTEGER NOT NULL DEFAULT 1, close_date TEXT, experience TEXT, salary_range TEXT, created_at TEXT NOT NULL)')
    cur.execute('CREATE TABLE IF NOT EXISTS resumes (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, filename TEXT NOT NULL, original_name TEXT NOT NULL, text TEXT, score REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT "new", uploaded_at TEXT NOT NULL)')
    cur.execute('CREATE TABLE IF NOT EXISTS applications (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, email TEXT NOT NULL, name TEXT, resume_text TEXT, match_score REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT "applied", created_at TEXT NOT NULL)')
    cur.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_app_unique ON applications(job_id, email)')
    cur.execute('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, user_type TEXT, name TEXT, password_hash TEXT, created_at TEXT NOT NULL)')
    cur.execute('CREATE TABLE IF NOT EXISTS user_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, action_type TEXT NOT NULL, metadata TEXT, created_at TEXT NOT NULL)')
    cur.execute('CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL)')
    cur.execute('CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE NOT NULL, email TEXT NOT NULL, user_type TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)')
    try:
        cols = [r['name'] for r in cur.execute('PRAGMA table_info(jobs)').fetchall()]
        if 'recruiter_email' not in cols:
            cur.execute('ALTER TABLE jobs ADD COLUMN recruiter_email TEXT')
        if 'company' not in cols:
            cur.execute('ALTER TABLE jobs ADD COLUMN company TEXT')
        if 'close_date' not in cols:
            cur.execute('ALTER TABLE jobs ADD COLUMN close_date TEXT')
        if 'experience' not in cols:
            cur.execute('ALTER TABLE jobs ADD COLUMN experience TEXT')
        if 'salary_range' not in cols:
            cur.execute('ALTER TABLE jobs ADD COLUMN salary_range TEXT')
    except Exception:
        pass
    try:
        cols = [r['name'] for r in cur.execute('PRAGMA table_info(users)').fetchall()]
        if 'password_hash' not in cols:
            cur.execute('ALTER TABLE users ADD COLUMN password_hash TEXT')
    except Exception:
        pass
    try:
        cols = [r['name'] for r in cur.execute('PRAGMA table_info(applications)').fetchall()]
        if 'name' not in cols:
            cur.execute('ALTER TABLE applications ADD COLUMN name TEXT')
        if 'resume_text' not in cols:
            cur.execute('ALTER TABLE applications ADD COLUMN resume_text TEXT')
        if 'match_score' not in cols:
            cur.execute('ALTER TABLE applications ADD COLUMN match_score REAL NOT NULL DEFAULT 0')
        if 'resume_id' not in cols:
            cur.execute('ALTER TABLE applications ADD COLUMN resume_id INTEGER')
    except Exception:
        pass
    try:
        cols = [r['name'] for r in cur.execute('PRAGMA table_info(resumes)').fetchall()]
        if 'text' not in cols:
            cur.execute('ALTER TABLE resumes ADD COLUMN text TEXT')
    except Exception:
        pass
    cur.execute('CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_jobs_recruiter ON jobs(recruiter_email)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_resumes_job ON resumes(job_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_resumes_status ON resumes(status)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_applications_email ON applications(email)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_applications_resume ON applications(resume_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_user_actions_user ON user_actions(user_id)')
    try:
        c = cur.execute('SELECT COUNT(*) AS c FROM jobs').fetchone()['c']
        if c == 0:
            now = datetime.now().isoformat()
            cur.execute('INSERT INTO jobs (recruiter_email, position, location, mode, details, skills, openings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        ('seed@smarthire.local', 'Senior React Developer', 'Remote', 'online', 'Build modern SPA with React and TypeScript', 'React,JavaScript,TypeScript,Redux', 3, now))
            cur.execute('INSERT INTO jobs (recruiter_email, position, location, mode, details, skills, openings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        ('seed@smarthire.local', 'Python Backend Engineer', 'New York', 'hybrid', 'APIs and microservices with Python', 'Python,FastAPI,SQL,Docker', 2, now))
            cur.execute('INSERT INTO jobs (recruiter_email, position, location, mode, details, skills, openings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        ('seed@smarthire.local', 'Full Stack Developer', 'San Francisco', 'offline', 'End-to-end web apps', 'React,Node.js,MongoDB,CI/CD', 1, now))
    except Exception:
        pass
    conn.commit()
    conn.close()

def _extract_pdf_text(path):
    """Try pdfplumber first (much better layout/column handling than PyPDF2,
    which regularly mangles multi-column resumes and drops text). Fall back
    to PyPDF2 if pdfplumber isn't available or fails."""
    try:
        import pdfplumber
        parts = []
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                try:
                    parts.append(page.extract_text() or '')
                except Exception:
                    parts.append('')
        text = '\n'.join(parts).strip()
        if text:
            return text
    except Exception:
        pass
    try:
        import PyPDF2
        text = []
        with open(path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                try:
                    text.append(page.extract_text() or '')
                except Exception:
                    text.append('')
        return '\n'.join(text)
    except Exception:
        return ''


def _extract_docx_text(path):
    try:
        import docx
        d = docx.Document(path)
        parts = [p.text for p in d.paragraphs]
        for table in d.tables:
            for row in table.rows:
                for cell in row.cells:
                    if cell.text:
                        parts.append(cell.text)
        return '\n'.join(p for p in parts if p)
    except Exception:
        return ''


def extract_resume_text(path, filename):
    """Extracts resume text from PDF or DOCX. Also normalizes whitespace and
    strips PDF ligature artifacts (e.g. 'ﬁ' -> 'fi') that otherwise silently
    break keyword matching (a resume saying 'proﬁcient' would never match
    'proficient')."""
    ext = (filename or path or '').rsplit('.', 1)[-1].lower()
    if ext == 'docx':
        text = _extract_docx_text(path)
    else:
        text = _extract_pdf_text(path)
    if not text:
        return ''
    ligatures = {'\ufb01': 'fi', '\ufb02': 'fl', '\ufb00': 'ff', '\ufb03': 'ffi', '\ufb04': 'ffl'}
    for k, v in ligatures.items():
        text = text.replace(k, v)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


# Common aliases so "JS" matches "JavaScript", "ML" matches "Machine Learning",
# etc. This is the single biggest accuracy lever for skill matching short of
# a full NLP/embedding model -- most false negatives are just naming variants.
SKILL_ALIASES = {
    'javascript': ['js', 'ecmascript'],
    'typescript': ['ts'],
    'python': ['py'],
    'node.js': ['node', 'nodejs'],
    'react': ['react.js', 'reactjs'],
    'vue': ['vue.js', 'vuejs'],
    'angular': ['angularjs'],
    'machine learning': ['ml'],
    'artificial intelligence': ['ai'],
    'natural language processing': ['nlp'],
    'deep learning': ['dl'],
    'postgresql': ['postgres'],
    'mongodb': ['mongo'],
    'kubernetes': ['k8s'],
    'amazon web services': ['aws'],
    'google cloud platform': ['gcp', 'google cloud'],
    'microsoft azure': ['azure'],
    'continuous integration': ['ci/cd', 'ci', 'cd'],
    'c#': ['csharp', 'c sharp'],
    'c++': ['cpp'],
    '.net': ['dotnet', '.net core', 'asp.net'],
    'html': ['html5'],
    'css': ['css3'],
    'sql': ['mysql', 'structured query language'],
    'ui/ux': ['ux', 'ui', 'user experience', 'user interface'],
    'rest api': ['restful', 'rest', 'api development'],
    'object oriented programming': ['oop'],
    'flask': ['flask api'],
    'django': ['django rest framework', 'drf'],
    'git': ['github', 'version control'],
    'docker': ['containerization'],
}
# Vocabulary used to auto-detect likely tech skills mentioned in free-text
# (a job description, or a resume) when no explicit skills list is given.
COMMON_TECH_SKILLS = {
    'react', 'reactjs', 'react.js', 'typescript', 'javascript', 'node', 'node.js', 'express', 'redux', 'next.js',
    'vue', 'angular', 'python', 'django', 'flask', 'fastapi', 'pandas', 'numpy', 'tensorflow', 'pytorch',
    'java', 'spring', 'spring boot', 'c#', '.net', '.net core', 'c++', 'go', 'rust', 'php', 'ruby',
    'sql', 'mysql', 'postgres', 'postgresql', 'sqlite', 'nosql', 'mongodb', 'redis',
    'docker', 'kubernetes', 'k8s', 'helm', 'terraform', 'ansible',
    'aws', 'azure', 'gcp', 'lambda', 's3', 'ec2', 'cloud',
    'graphql', 'rest', 'api', 'microservices', 'git', 'jenkins', 'ci/cd', 'kafka',
    'html', 'css', 'tailwind', 'sass', 'figma', 'ui/ux',
    'machine learning', 'deep learning', 'nlp', 'data analysis', 'excel', 'power bi', 'tableau',
}

# Reverse index: alias -> canonical skill, so we can also expand the other way
_ALIAS_TO_CANONICAL = {}
for _canon, _aliases in SKILL_ALIASES.items():
    for _a in _aliases:
        _ALIAS_TO_CANONICAL[_a] = _canon


def _skill_variants(skill_lower):
    """Returns every string form (the skill itself + known aliases in both
    directions) that should count as a match for this skill."""
    variants = {skill_lower}
    if skill_lower in SKILL_ALIASES:
        variants.update(SKILL_ALIASES[skill_lower])
    if skill_lower in _ALIAS_TO_CANONICAL:
        canon = _ALIAS_TO_CANONICAL[skill_lower]
        variants.add(canon)
        variants.update(SKILL_ALIASES.get(canon, []))
    return variants


def _compile_skill_pattern(term):
    """Word-boundary regex for a skill term. Plain \\b breaks on '.', '+', '#'
    (so '\\bc++\\b' or '\\bc#\\b' would never match), so we use manual
    lookaround boundaries instead. This is what fixes bugs like the required
    skill "Java" incorrectly matching every resume that only mentions
    "JavaScript"."""
    escaped = re.escape(term.strip().lower())
    return re.compile(r'(?<![a-z0-9+#.])' + escaped + r'(?![a-z0-9+#])')


def _skill_present(term, haystack_lower):
    return bool(_compile_skill_pattern(term).search(haystack_lower))


def compute_match_score(text_source, filename, skills_csv):
    """Word-boundary + alias-aware skill matching, scored as % of required
    skills genuinely found in the resume. Replaces the old substring check
    (`skill in text`), which produced false positives like "Java" matching
    "JavaScript", "R" matching almost any word, etc."""
    skills = [s.strip().lower() for s in (skills_csv or '').split(',') if s.strip()]
    if not skills:
        return 0.0
    text = ((text_source or '') + ' ' + (filename or '')).lower()
    hits = 0
    for s in skills:
        if any(_skill_present(v, text) for v in _skill_variants(s)):
            hits += 1
    return round(hits / len(skills) * 100.0, 2)

def matched_skills(text_source, filename, skills_csv):
    skills = [s.strip() for s in (skills_csv or '').split(',') if s.strip()]
    lower_text = ((text_source or '') + ' ' + (filename or '')).lower()
    matched = []
    missing = []
    for s in skills:
        if any(_skill_present(v, lower_text) for v in _skill_variants(s.lower())):
            matched.append(s)
        else:
            missing.append(s)
    return matched, missing

def _ensure_user_id(cur, email, user_type=None, name=None):
    """Upsert user using an existing cursor; caller commits. Returns user id or None."""
    if not email:
        return None
    row = cur.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone()
    if row:
        uid = row['id']
        if user_type or name:
            cur.execute(
                'UPDATE users SET user_type=COALESCE(?, user_type), name=COALESCE(?, name) WHERE email=?',
                (user_type, name, email),
            )
        return uid
    cur.execute(
        'INSERT INTO users (email, user_type, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
        (email, user_type or '', name or '', '', datetime.now().isoformat()),
    )
    return cur.lastrowid


def upsert_user(email, user_type=None, name=None):
    if not email:
        return None
    init_db()
    with _db_write_lock:
        conn = db_conn()
        try:
            cur = conn.cursor()
            uid = _ensure_user_id(cur, email, user_type=user_type, name=name)
            conn.commit()
            return uid
        finally:
            conn.close()

def log_action(email, action_type, metadata='', user_type=None, name=None):
    try:
        init_db()
        uid = upsert_user(email, user_type=user_type, name=name) if email else None
        conn = db_conn()
        cur = conn.cursor()
        cur.execute('INSERT INTO user_actions (user_id, action_type, metadata, created_at) VALUES (?, ?, ?, ?)', (uid, action_type, str(metadata or ''), datetime.now().isoformat()))
        conn.commit()
        conn.close()
    except Exception:
        pass

@app.route('/')
def index():
    try:
        with open(os.path.join(os.path.dirname(__file__), 'index.html'), 'r') as f:
            return f.read()
    except Exception as e:
        return jsonify({'error': f'Failed to load index.html: {str(e)}'}), 500

@app.route('/<path:filename>')
def serve_static(filename):
    try:
        return send_from_directory('.', filename)
    except Exception:
        return jsonify({'error': f'File not found: {filename}'}), 404

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat(), 'service': 'SmartHire Backend'})

ACTION_VERBS = ['built', 'developed', 'implemented', 'designed', 'led', 'optimized', 'created',
                'delivered', 'improved', 'automated', 'launched', 'architected', 'reduced',
                'increased', 'managed', 'mentored', 'streamlined', 'migrated', 'deployed', 'scaled']
RESUME_SECTIONS = {
    'experience': ['experience', 'work experience', 'professional experience', 'employment history'],
    'education': ['education', 'academic background', 'qualifications'],
    'skills': ['skills', 'technical skills', 'core competencies'],
    'projects': ['projects', 'personal projects', 'key projects'],
    'summary': ['summary', 'profile', 'objective', 'about me'],
    'contact': ['contact', 'email', 'phone', 'linkedin'],
}
_YEAR_RE = re.compile(r'\b(19|20)\d{2}\b')
_PHONE_RE = re.compile(r'\b\d{10}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b')
_PERCENT_RE = re.compile(r'\d+(?:\.\d+)?\s?%')
_NUMBER_RE = re.compile(r'\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\+?\b')


def _quantified_achievement_count(raw_text, lower_text):
    """Counts real quantified achievements (percentages, counts like '50+
    users', 'reduced by 3x') instead of the old approach of counting every
    single digit character in the resume -- which meant a phone number or a
    long list of dates could inflate the score just as much as a genuine
    metric like '40% reduction in review time'."""
    percent_hits = len(_PERCENT_RE.findall(lower_text))
    numbers = _NUMBER_RE.findall(raw_text)
    phones = set(_PHONE_RE.findall(raw_text))
    meaningful = 0
    for n in numbers:
        clean = n.rstrip('+').replace(',', '')
        if not clean.isdigit():
            continue
        if _YEAR_RE.fullmatch(clean):
            continue  # a bare year like "2023" isn't an achievement metric
        if len(clean) >= 10:
            continue  # looks like a phone number
        meaningful += 1
    return percent_hits * 2 + meaningful  # weight percentages higher, they're the strongest signal


@app.route('/api/scan-resume', methods=['POST'])
def scan_resume():
    try:
        data = request.get_json()
        resume_text = data.get('resume_text', '')
        if not resume_text or not resume_text.strip():
            return jsonify({'error': 'Resume text is required'}), 400
        text = resume_text.lower()
        tokens = [t for t in re.split(r'\s+', text) if t]
        word_count = len(tokens)

        # Length: resumes that are far too short (<150 words) or bloated (>1200)
        # both hurt readability, so this is no longer a straight line to 800+.
        if word_count < 150:
            length_score = (word_count / 150) * 15
        elif word_count <= 800:
            length_score = 15 + ((word_count - 150) / 650) * 10
        else:
            length_score = max(25 - (word_count - 800) / 200 * 5, 15)
        length_score = round(min(max(length_score, 0), 25), 2)

        unique_verbs_used = sorted({v for v in ACTION_VERBS if re.search(r'\b' + v + r'\b', text)})
        action_hits = sum(len(re.findall(r'\b' + v + r'\b', text)) for v in ACTION_VERBS)
        # Reward variety of verbs more than repeating the same one over and over
        verb_score = round(min(len(unique_verbs_used) * 3.0, 18) + min(action_hits * 0.4, 7), 2)

        section_hits = 0
        found_sections = []
        for canonical, variants in RESUME_SECTIONS.items():
            if any(v in text for v in variants):
                section_hits += 1
                found_sections.append(canonical)
        section_score = round(min(section_hits / len(RESUME_SECTIONS) * 25, 25), 2)

        quantified_hits = _quantified_achievement_count(resume_text, text)
        quantified_score = round(min(quantified_hits / 12 * 25, 25), 2)

        score = round(length_score + verb_score + section_score + quantified_score, 2)
        if score >= 80:
            friendly = 'Excellent'
        elif score >= 65:
            friendly = 'Good'
        elif score >= 50:
            friendly = 'Average'
        else:
            friendly = 'Poor'

        suggestions = []
        if len(unique_verbs_used) < 4:
            suggestions.append('Use a wider variety of strong action verbs (e.g. Developed, Led, Optimized) instead of repeating the same one')
        missing_sections = [c for c in RESUME_SECTIONS if c not in found_sections and c != 'contact']
        if missing_sections:
            suggestions.append(f"Add missing section(s): {', '.join(s.title() for s in missing_sections)}")
        if quantified_hits < 6:
            suggestions.append('Add measurable outcomes with numbers and percentages (e.g. "reduced processing time by 30%")')
        if word_count < 150:
            suggestions.append('Your resume looks too short — add more detail on responsibilities and results')
        elif word_count > 1200:
            suggestions.append('Your resume is quite long — trim it to the most relevant, recent experience (aim for 1-2 pages)')
        if 'contact' not in found_sections:
            suggestions.append('Make sure your email, phone, and LinkedIn are clearly visible near the top')

        log_action(request.headers.get('X-User-Email', ''), 'scan_resume', {'len': len(resume_text), 'score': score})
        return jsonify({
            'success': True,
            'score': score,
            'friendlyness': friendly,
            'suggestions': suggestions,
            'breakdown': {
                'length_score': length_score,
                'action_verb_score': verb_score,
                'section_score': section_score,
                'quantified_score': quantified_score,
                'word_count': word_count,
                'sections_found': found_sections,
            },
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/scan-resume-pdf', methods=['POST'])
def scan_resume_pdf():
    try:
        if 'resume_pdf' not in request.files and 'file' not in request.files:
            return jsonify({'error': 'PDF file is required'}), 400
        file = request.files.get('resume_pdf') or request.files.get('file')
        if not file or not file.filename or not allowed_pdf(file.filename):
            return jsonify({'error': 'Invalid or missing PDF'}), 400
        safe = secure_filename(file.filename)
        base = f"{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{safe}"
        path = os.path.join(app.config['UPLOAD_FOLDER'], base)
        file.save(path)
        text = extract_resume_text(path, safe)
        try:
            os.remove(path)
        except Exception:
            pass
        data = {'resume_text': text}
        with app.test_request_context(json=data):
            return scan_resume()
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def _extract_skills_from_text(text):
    """Best-effort skill extraction from free-text (e.g. a pasted job
    description) by matching against the known tech-skill vocabulary. Used
    when the caller hasn't supplied an explicit skills list."""
    lower = (text or '').lower()
    found = [s for s in COMMON_TECH_SKILLS if _skill_present(s, lower)]
    return found


@app.route('/api/analyze-candidates', methods=['POST'])
def analyze_candidates():
    """Ranks candidates against a job description using the same
    word-boundary/alias skill-matching engine used everywhere else in the
    app, plus a lightweight text-overlap score. This used to return two
    hardcoded fake people ("Sarah Chen", "Marcus Johnson") regardless of
    input -- that has been replaced with a real, if intentionally simple,
    scoring pipeline (see README for its documented limits)."""
    try:
        data = request.get_json(force=True)
        job_description = (data.get('job_description') or '').strip()
        required_skills_csv = data.get('required_skills') or ''
        candidates = data.get('candidates', [])
        if not job_description:
            return jsonify({'error': 'Job description is required'}), 400
        if not isinstance(candidates, list) or not candidates:
            return jsonify({'error': 'At least one candidate (with resume_text) is required'}), 400

        required_skills = [s.strip() for s in required_skills_csv.split(',') if s.strip()]
        if not required_skills:
            required_skills = _extract_skills_from_text(job_description)
        skills_csv = ','.join(required_skills) if required_skills else ''

        jd_tokens = set(re.findall(r'[a-z0-9]+', job_description.lower()))
        jd_tokens = {t for t in jd_tokens if len(t) > 3}

        ranked = []
        for idx, c in enumerate(candidates):
            name = (c.get('name') or f'Candidate {idx + 1}').strip()
            resume_text = c.get('resume_text') or ''
            cand_id = c.get('id', idx + 1)

            skill_match_pct = compute_match_score(resume_text, name, skills_csv) if skills_csv else 0.0
            matched, missing = matched_skills(resume_text, name, skills_csv) if skills_csv else ([], [])

            resume_tokens = set(re.findall(r'[a-z0-9]+', resume_text.lower()))
            resume_tokens = {t for t in resume_tokens if len(t) > 3}
            overlap = len(jd_tokens & resume_tokens)
            text_similarity_pct = round(min(overlap / max(len(jd_tokens), 1) * 100, 100), 2)

            total_score = round(skill_match_pct * 0.7 + text_similarity_pct * 0.3, 2)
            if total_score >= 80:
                band = 'Excellent'
            elif total_score >= 60:
                band = 'Good'
            elif total_score >= 40:
                band = 'Average'
            else:
                band = 'Weak'

            ranked.append({
                'id': cand_id,
                'name': name,
                'skill_match': round(skill_match_pct / 100, 4),
                'text_similarity': round(text_similarity_pct / 100, 4),
                'total_score': total_score,
                'matched_skills': matched,
                'missing_skills': missing,
                'type': band,
            })

        ranked.sort(key=lambda c: c['total_score'], reverse=True)
        log_action(request.headers.get('X-User-Email', ''), 'analyze_candidates', {'candidates': len(candidates)})
        return jsonify({
            'success': True,
            'candidates': ranked,
            'total_matches': len(ranked),
            'skills_considered': required_skills,
            'note': 'Scoring = 70% required-skill coverage + 30% keyword overlap with the job description. This is a transparent heuristic, not a semantic/embedding model.',
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/export-resume', methods=['POST'])
def export_resume():
    """Generates a real, downloadable PDF from structured resume data. The
    previous version returned a fake file_url pointing at a PDF that was
    never created."""
    try:
        from reportlab.lib.pagesizes import LETTER
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_LEFT

        data = request.get_json(force=True)
        name = (data.get('name') or 'Resume').strip()
        email = (data.get('email') or '').strip()
        phone = (data.get('phone') or '').strip()
        summary = (data.get('summary') or '').strip()
        skills = data.get('skills') or []
        if isinstance(skills, str):
            skills = [s.strip() for s in skills.split(',') if s.strip()]
        experience = data.get('experience') or []   # list of {title, company, dates, bullets: []}
        education = data.get('education') or []     # list of {degree, school, dates}

        safe_name = secure_filename(name) or 'resume'
        filename = f"{safe_name}_{int(time.time())}.pdf"
        out_path = os.path.join(app.config['EXPORT_FOLDER'], filename)

        styles = getSampleStyleSheet()
        h1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=20, spaceAfter=2)
        contact_style = ParagraphStyle('Contact', parent=styles['Normal'], fontSize=10, textColor='#555555', spaceAfter=12)
        h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=13, spaceBefore=14, spaceAfter=6, textColor='#1e293b')
        body = ParagraphStyle('Body', parent=styles['Normal'], fontSize=10.5, leading=15, alignment=TA_LEFT)

        doc = SimpleDocTemplate(out_path, pagesize=LETTER,
                                 topMargin=0.7 * inch, bottomMargin=0.7 * inch,
                                 leftMargin=0.75 * inch, rightMargin=0.75 * inch)
        story = [Paragraph(name, h1)]
        contact_line = ' | '.join(p for p in [email, phone] if p)
        if contact_line:
            story.append(Paragraph(contact_line, contact_style))

        if summary:
            story.append(Paragraph('SUMMARY', h2))
            story.append(Paragraph(summary, body))

        if skills:
            story.append(Paragraph('SKILLS', h2))
            story.append(Paragraph(', '.join(skills), body))

        if experience:
            story.append(Paragraph('EXPERIENCE', h2))
            for job in experience:
                title = job.get('title', '')
                company = job.get('company', '')
                dates = job.get('dates', '')
                header = f"<b>{title}</b>{' — ' + company if company else ''}"
                if dates:
                    header += f"  <font color='#666666'>({dates})</font>"
                story.append(Paragraph(header, body))
                bullets = job.get('bullets') or []
                if bullets:
                    story.append(ListFlowable(
                        [ListItem(Paragraph(b, body)) for b in bullets],
                        bulletType='bullet', leftIndent=14,
                    ))
                story.append(Spacer(1, 6))

        if education:
            story.append(Paragraph('EDUCATION', h2))
            for ed in education:
                line = f"<b>{ed.get('degree', '')}</b>{' — ' + ed.get('school', '') if ed.get('school') else ''}"
                if ed.get('dates'):
                    line += f"  <font color='#666666'>({ed.get('dates')})</font>"
                story.append(Paragraph(line, body))

        doc.build(story)
        log_action(request.headers.get('X-User-Email', ''), 'export_resume', {'name': name})
        return jsonify({'success': True, 'message': 'Resume exported successfully', 'file_url': f'/api/exports/{filename}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/exports/<path:filename>', methods=['GET'])
def download_export(filename):
    safe = secure_filename(filename)
    path = os.path.join(app.config['EXPORT_FOLDER'], safe)
    if not os.path.exists(path):
        return jsonify({'error': 'File not found'}), 404
    return send_file(path, as_attachment=True, download_name=safe)

@app.route('/api/contact', methods=['POST'])
def contact():
    try:
        data = request.get_json()
        name = data.get('name', '')
        email = data.get('email', '')
        message = data.get('message', '')
        if not all([name, email, message]):
            return jsonify({'error': 'All fields are required'}), 400
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        cur.execute('INSERT INTO contacts (name, email, message, created_at) VALUES (?, ?, ?, ?)', (name, email, message, datetime.now().isoformat()))
        conn.commit()
        conn.close()
        log_action(email, 'contact', {'name': name})
        return jsonify({'success': True, 'message': 'Thank you for your inquiry. We will get back to you shortly.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs', methods=['POST'])
def create_job():
    conn = None
    try:
        data = request.get_json(force=True)
        company = (data.get('company') or '').strip()
        position = data.get('position', '').strip()
        location = data.get('location', '').strip()
        mode = data.get('mode', '').strip()
        details = data.get('details', '').strip()
        skills = data.get('skills', '').strip()
        openings = int(data.get('openings', 1))
        close_date = (data.get('close_date') or '').strip()
        experience = (data.get('experience') or '').strip()
        salary_range = (data.get('salary_range') or '').strip()
        if not position or not location or not mode:
            return jsonify({'error': 'position, location, mode are required'}), 400
        recruiter_email = recruiter_auth_email()
        if not recruiter_email:
            return jsonify({'error': 'Authentication required'}), 401
        hdr_type = 'recruiter'
        # One connection, one commit: user + job + audit row (avoids nested connections while a writer is open)
        with _db_write_lock:
            init_db()
            conn = db_conn()
            cur = conn.cursor()
            uid = None
            if recruiter_email:
                uid = _ensure_user_id(cur, recruiter_email, user_type=hdr_type, name=None)
            cur.execute(
                'INSERT INTO jobs (recruiter_email, company, position, location, mode, details, skills, openings, close_date, experience, salary_range, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (recruiter_email, company, position, location, mode, details, skills, openings, close_date, experience, salary_range, datetime.now().isoformat()),
            )
            job_id = cur.lastrowid
            try:
                cur.execute(
                    'INSERT INTO user_actions (user_id, action_type, metadata, created_at) VALUES (?, ?, ?, ?)',
                    (uid, 'create_job', str({'job_id': job_id, 'position': position}), datetime.now().isoformat()),
                )
            except Exception:
                pass
            conn.commit()
        return jsonify(
            {
                'success': True,
                'job': {
                    'id': job_id,
                    'company': company,
                    'position': position,
                    'location': location,
                    'mode': mode,
                    'details': details,
                    'skills': skills,
                    'openings': openings,
                    'close_date': close_date,
                    'experience': experience,
                    'salary_range': salary_range,
                },
            }
        )
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

@app.route('/api/jobs/<int:job_id>/analytics', methods=['GET'])
def job_analytics(job_id):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        job, err = assert_recruiter_owns_job(cur, job_id)
        if err:
            conn.close()
            return jsonify(err[0]), err[1]
        skills = [s.strip() for s in (job['skills'] or '').split(',') if s.strip()]
        items = []
        for s in skills:
            like = f'%{s.lower()}%'
            app_count = cur.execute('SELECT COUNT(*) AS c FROM applications WHERE job_id=? AND LOWER(COALESCE(resume_text, "")) LIKE ?', (job_id, like)).fetchone()['c']
            up_count = cur.execute('SELECT COUNT(*) AS c FROM resumes WHERE job_id=? AND (LOWER(COALESCE(text, "")) LIKE ? OR LOWER(original_name) LIKE ?)', (job_id, like, like)).fetchone()['c']
            items.append({'skill': s, 'applicants': app_count, 'uploads': up_count})
        conn.close()
        return jsonify({'success': True, 'skills': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs/<int:job_id>/upload-analytics', methods=['GET'])
def upload_analytics(job_id):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        job, err = assert_recruiter_owns_job(cur, job_id)
        if err:
            conn.close()
            return jsonify(err[0]), err[1]
        required_skills_lower = [s.strip().lower() for s in (job['skills'] or '').split(',') if s.strip()]
        required_skills_display = [s.strip() for s in (job['skills'] or '').split(',') if s.strip()]
        rows = cur.execute('SELECT id, original_name, score, LOWER(COALESCE(text, "")) AS text_l, LOWER(original_name) AS name_l FROM resumes WHERE job_id=?', (job_id,)).fetchall()
        conn.close()
        freq = {s: 0 for s in required_skills_lower}
        per_resume = {}
        blob_all = []
        for r in rows:
            present = []
            blob = (r['text_l'] or '') + ' ' + (r['name_l'] or '')
            blob_all.append(blob)
            for s in required_skills_lower:
                if s and s in blob:
                    freq[s] += 1
                    present.append(s)
            tokens = re.findall(r'[a-z0-9\.\#/+\-]+', blob)
            other_in_resume = []
            for t in tokens:
                if len(t) < 2:
                    continue
                if t in required_skills_lower:
                    continue
                if t in COMMON_TECH_SKILLS and t not in other_in_resume:
                    other_in_resume.append(t)
            per_resume[r['id']] = {'name': r['original_name'], 'score': r['score'], 'fit_skills': present, 'other_skills': other_in_resume}
        common = [{'skill': s, 'count': freq[s]} for s in required_skills_lower]
        common.sort(key=lambda x: x['count'], reverse=True)
        unique = []
        for s in required_skills_lower:
            if freq[s] == 1:
                for rid, info in per_resume.items():
                    if s in info['fit_skills']:
                        unique.append({'skill': s, 'candidate': info['name'], 'resume_id': rid})
                        break
        token_counts = {}
        for blob in blob_all:
            tokens = re.findall(r'[a-z0-9\.\#/+\-]+', blob)
            for t in tokens:
                if len(t) < 2:
                    continue
                if t in required_skills_lower:
                    continue
                if t in COMMON_TECH_SKILLS:
                    token_counts[t] = token_counts.get(t, 0) + 1
        other = [{'skill': k, 'count': v} for k, v in token_counts.items()]
        other.sort(key=lambda x: x['count'], reverse=True)
        other = other[:12]
        per_resume_list = [{'resume_id': rid, 'name': info['name'], 'score': info['score'], 'fit_skills': info['fit_skills'], 'other_skills': info['other_skills']} for rid, info in per_resume.items()]
        return jsonify({'success': True, 'required_skills': required_skills_display, 'common_skills': common, 'unique_skills': unique, 'other_skills': other, 'per_resume': per_resume_list})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs/<int:job_id>', methods=['DELETE'])
def delete_job(job_id):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        _, err = assert_recruiter_owns_job(cur, job_id)
        if err:
            conn.close()
            return jsonify(err[0]), err[1]
        cur.execute('DELETE FROM resumes WHERE job_id=?', (job_id,))
        cur.execute('DELETE FROM applications WHERE job_id=?', (job_id,))
        cur.execute('DELETE FROM jobs WHERE id=?', (job_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs', methods=['GET'])
def list_jobs():
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        scope = (request.args.get('for') or '').strip().lower()
        if scope == 'recruiter':
            me = recruiter_auth_email()
            if not me:
                conn.close()
                return jsonify({'error': 'Authentication required'}), 401
            rows = cur.execute(
                'SELECT * FROM jobs WHERE LOWER(COALESCE(recruiter_email, "")) = ? AND COALESCE(recruiter_email, "") != "seed@smarthire.local" ORDER BY id DESC',
                (me,)
            ).fetchall()
        else:
            # Candidates: all real jobs (not demo seed)
            rows = cur.execute('SELECT * FROM jobs WHERE COALESCE(recruiter_email, "") != "seed@smarthire.local" ORDER BY id DESC').fetchall()
        conn.close()
        jobs = [dict(r) for r in rows]
        return jsonify({'success': True, 'jobs': jobs})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs/<int:job_id>', methods=['GET'])
def get_job(job_id):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        row = cur.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Job not found'}), 404
        return jsonify({'success': True, 'job': dict(row)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

RESUME_EXTENSIONS = {'pdf', 'docx'}


def allowed_pdf(filename):
    """Name kept for backward compatibility with existing call sites, but now
    also accepts .docx -- a large share of real-world resumes aren't PDFs."""
    return bool(filename) and '.' in filename and filename.rsplit('.', 1)[1].lower() in RESUME_EXTENSIONS

@app.route('/api/jobs/<int:job_id>/preview-match', methods=['POST'])
def preview_match(job_id):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        row = cur.execute('SELECT skills FROM jobs WHERE id=?', (job_id,)).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Job not found'}), 404
        skills_csv = row['skills'] or ''
        text = ''
        name = ''
        if request.content_type and 'multipart/form-data' in (request.content_type or '').lower():
            file = request.files.get('resume_pdf')
            if file and file.filename and allowed_pdf(file.filename):
                safe = secure_filename(file.filename)
                base = f"{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{safe}"
                path = os.path.join(app.config['UPLOAD_FOLDER'], base)
                file.save(path)
                text = extract_resume_text(path, safe)
                name = safe
                try:
                    os.remove(path)
                except Exception:
                    pass
        else:
            data = request.get_json(force=True)
            text = (data.get('resume_text') or '').strip()
            name = (data.get('name') or '').strip()
        score = compute_match_score(text, name, skills_csv)
        matched, missing = matched_skills(text, name, skills_csv)
        return jsonify({'success': True, 'score': score, 'matched': matched, 'missing': missing})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs/<int:job_id>/resumes', methods=['POST'])
def upload_resumes(job_id):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        job, err = assert_recruiter_owns_job(cur, job_id)
        if err:
            conn.close()
            return jsonify(err[0]), err[1]
        if 'files' not in request.files:
            conn.close()
            return jsonify({'error': 'No files provided'}), 400
        files = request.files.getlist('files')
        saved = []
        for f in files:
            if not f or not f.filename or not allowed_pdf(f.filename):
                continue
            name = secure_filename(f.filename)
            base = f"{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{name}"
            path = os.path.join(app.config['UPLOAD_FOLDER'], base)
            f.save(path)
            text = extract_resume_text(path, name)
            score = compute_match_score(text, name, job['skills'])
            cur.execute('INSERT INTO resumes (job_id, filename, original_name, text, score, status, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', (job_id, base, name, text, score, 'new', datetime.now().isoformat()))
            rid = cur.lastrowid
            saved.append({'id': rid, 'original_name': name, 'score': score, 'status': 'new', 'file_url': f'/api/resumes/{rid}/file'})
        conn.commit()
        conn.close()
        saved.sort(key=lambda x: x['score'], reverse=True)
        log_action(request.headers.get('X-User-Email', ''), 'upload_resumes', {'job_id': job_id, 'count': len(saved)}, user_type=request.headers.get('X-User-Type', 'recruiter'))
        return jsonify({'success': True, 'resumes': saved})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs/<int:job_id>/resumes', methods=['GET'])
def list_resumes(job_id):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        job, err = assert_recruiter_owns_job(cur, job_id)
        if err:
            conn.close()
            return jsonify(err[0]), err[1]
        skills_csv = job['skills'] if job else ''
        rows = cur.execute(
            'SELECT * FROM resumes WHERE job_id=? ORDER BY score DESC',
            (job_id,)
        ).fetchall()

        conn.close()

        items = []
        for r in rows:
            # Recompute score against current job skills to ensure accuracy
            live_score = compute_match_score(r['text'], r['original_name'], skills_csv)
            items.append({
                'id': r['id'],
                'original_name': r['original_name'],
                'score': live_score,
                'status': r['status'],
                'file_url': f"/api/resumes/{r['id']}/file"
            })

        return jsonify({'success': True, 'resumes': items})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs/<int:job_id>/applied-resumes', methods=['GET'])
def applied_resumes(job_id):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        job, err = assert_recruiter_owns_job(cur, job_id)
        if err:
            conn.close()
            return jsonify(err[0]), err[1]
        skills_csv = job['skills'] if job else ''
        rows = cur.execute('SELECT applications.id as app_id, applications.email as email, users.name as user_name, resumes.id as resume_id, resumes.original_name as original_name, resumes.text as text FROM applications JOIN resumes ON applications.resume_id = resumes.id LEFT JOIN users ON users.email = applications.email WHERE applications.job_id=? AND applications.resume_id IS NOT NULL ORDER BY applications.id DESC', (job_id,)).fetchall()
        conn.close()
        items = []
        for r in rows:
            ms = compute_match_score(r['text'], r['original_name'], skills_csv)
            items.append({
                'app_id': r['app_id'],
                'email': r['email'],
                'name': r['user_name'],
                'resume_id': r['resume_id'],
                'original_name': r['original_name'],
                'match_score': ms,
                'resume_file_url': f"/api/resumes/{r['resume_id']}/file",
                'unique_id': f"APP-{r['app_id']}"
            })
        return jsonify({'success': True, 'applied_resumes': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
@app.route('/api/jobs/<int:job_id>/apply', methods=['POST'])
def apply_job(job_id):
    try:
        init_db()
        # If multipart, allow direct PDF upload
        if request.content_type and 'multipart/form-data' in request.content_type.lower():
            email = (request.form.get('email') or '').strip()
            name = (request.form.get('name') or '').strip()
            if not email:
                return jsonify({'error': 'email is required'}), 400
            conn = db_conn()
            cur = conn.cursor()
            job = cur.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
            if not job:
                conn.close()
                return jsonify({'error': 'Job not found'}), 404
            existing = cur.execute('SELECT * FROM applications WHERE job_id=? AND email=?', (job_id, email)).fetchone()
            if existing:
                app_row = dict(existing)
                conn.close()
                return jsonify({'success': True, 'application': app_row, 'already_applied': True})
            rid = None
            text = ''
            score = 0.0
            # Prefer file upload under 'resume_pdf'
            file = request.files.get('resume_pdf')
            if file and file.filename and allowed_pdf(file.filename):
                safe = secure_filename(file.filename)
                base = f"{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{safe}"
                path = os.path.join(app.config['UPLOAD_FOLDER'], base)
                file.save(path)
                text = extract_resume_text(path, safe)
                score = compute_match_score(text, safe, job['skills'])
                cur.execute('INSERT INTO resumes (job_id, filename, original_name, text, score, status, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            (job_id, base, safe, text, score, 'new', datetime.now().isoformat()))
                rid = cur.lastrowid
            else:
                # Or allow linking to an existing resume_id in multipart
                try:
                    rid_val = int(request.form.get('resume_id') or '0')
                except ValueError:
                    rid_val = 0
                if rid_val:
                    r = cur.execute('SELECT * FROM resumes WHERE id=? AND job_id=?', (rid_val, job_id)).fetchone()
                    if r:
                        rid = rid_val
                        text = r['text'] or ''
                        score = compute_match_score(text, r['original_name'], job['skills'])
            cur.execute('INSERT INTO applications (job_id, email, name, resume_text, match_score, status, created_at, resume_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        (job_id, email, name, text, score, 'applied', datetime.now().isoformat(), rid))
            app_id = cur.lastrowid
            conn.commit()
            row = cur.execute('SELECT * FROM applications WHERE id=?', (app_id,)).fetchone()
            conn.close()
            out = dict(row)
            if out.get('resume_id'):
                out['resume_file_url'] = f"/api/resumes/{out['resume_id']}/file"
            return jsonify({'success': True, 'application': out})
        # JSON payload fallback
        data = request.get_json(force=True)
        email = data.get('email', '').strip()
        name = (data.get('name') or '').strip()
        resume_text = (data.get('resume_text') or '').strip()
        resume_id_json = data.get('resume_id')
        if not email:
            return jsonify({'error': 'email is required'}), 400
        conn = db_conn()
        cur = conn.cursor()
        job = cur.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
        if not job:
            conn.close()
            return jsonify({'error': 'Job not found'}), 404
        existing = cur.execute('SELECT * FROM applications WHERE job_id=? AND email=?', (job_id, email)).fetchone()
        if existing:
            app_row = dict(existing)
            conn.close()
            return jsonify({'success': True, 'application': app_row, 'already_applied': True})
        rid = None
        score = 0.0
        text = resume_text
        if resume_id_json:
            try:
                rid_val = int(resume_id_json)
            except Exception:
                rid_val = 0
            if rid_val:
                r = cur.execute('SELECT * FROM resumes WHERE id=? AND job_id=?', (rid_val, job_id)).fetchone()
                if r:
                    rid = rid_val
                    text = r['text'] or ''
                    score = compute_match_score(text, r['original_name'], job['skills'])
        if not rid:
            score = compute_match_score(resume_text, email, job['skills'])
        cur.execute('INSERT INTO applications (job_id, email, name, resume_text, match_score, status, created_at, resume_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    (job_id, email, name, text, score, 'applied', datetime.now().isoformat(), rid))
        app_id = cur.lastrowid
        conn.commit()
        row = cur.execute('SELECT * FROM applications WHERE id=?', (app_id,)).fetchone()
        conn.close()
        out = dict(row)
        if out.get('resume_id'):
            out['resume_file_url'] = f"/api/resumes/{out['resume_id']}/file"
        return jsonify({'success': True, 'application': out})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs/<int:job_id>/applications', methods=['GET'])
def list_applications(job_id):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        job, err = assert_recruiter_owns_job(cur, job_id)
        if err:
            conn.close()
            return jsonify(err[0]), err[1]
        skills_csv = job['skills'] if job else ''
        status = (request.args.get('status') or '').strip().lower()
        allowed = ['', 'applied', 'in_progress', 'selected', 'rejected']
        if status not in allowed:
            status = ''
        if status:
            rows = cur.execute('SELECT applications.*, users.name as user_name FROM applications LEFT JOIN users ON users.email = applications.email WHERE applications.job_id=? AND applications.status=? ORDER BY applications.id DESC', (job_id, status)).fetchall()
        else:
            rows = cur.execute('SELECT applications.*, users.name as user_name FROM applications LEFT JOIN users ON users.email = applications.email WHERE applications.job_id=? ORDER BY applications.id DESC', (job_id,)).fetchall()
        # pull resumes once
        resumes = cur.execute('SELECT id, original_name, text, filename FROM resumes WHERE job_id=?', (job_id,)).fetchall()
        resume_map = {r['id']: r for r in resumes}
        conn.close()
        # helper to find likely resume for applicant
        def find_resume_for_app(email, name):
            local = (email or '').split('@')[0].lower()
            tokens = [t for t in (name or '').lower().split() if len(t) >= 3]
            best = None
            for r in resumes:
                blob = (r['original_name'] or '').lower() + ' ' + (r['text'] or '').lower()
                match_score = 0
                if local and local in blob:
                    match_score += 2
                for t in tokens:
                    if t in blob:
                        match_score += 1
                if match_score > 0 and (best is None or match_score > best[0]):
                    best = (match_score, r)
            return best[1] if best else None
        items = []
        for rr in rows:
            d = dict(rr)
            d['display_name'] = d.get('user_name') or d.get('name') or d.get('email')
            # If explicit resume linked, use that
            if d.get('resume_id') and d['resume_id'] in resume_map:
                linked = resume_map[d['resume_id']]
                d['resume_file_url'] = f"/api/resumes/{linked['id']}/file"
                d['match_score'] = compute_match_score(linked.get('text'), linked.get('original_name'), skills_csv)
            else:
                # Try heuristic linking
                linked = find_resume_for_app(d.get('email'), d.get('name'))
                if linked:
                    d['resume_id'] = linked['id']
                    d['resume_file_url'] = f"/api/resumes/{linked['id']}/file"
                    d['match_score'] = compute_match_score(linked.get('text'), linked.get('original_name'), skills_csv)
                else:
                    # Fallback to application resume_text
                    d['match_score'] = compute_match_score(d.get('resume_text'), d.get('email'), skills_csv)
            items.append(d)
        return jsonify({'success': True, 'applications': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/applications/<int:app_id>/status', methods=['POST'])
def update_application_status(app_id):
    try:
        data = request.get_json(force=True)
        status = (data.get('status') or '').strip().lower()
        if status not in ['selected', 'rejected', 'in_progress', 'applied']:
            return jsonify({'error': 'Invalid status'}), 400
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        _, err = assert_recruiter_owns_application(cur, app_id)
        if err:
            conn.close()
            return jsonify(err[0]), err[1]
        cur.execute('UPDATE applications SET status=? WHERE id=?', (status, app_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def _simple_pdf_from_text(text):
    # very small PDF generator for plain text content
    # coordinates start at bottom-left; we place lines top-down
    lines = (text or 'No resume text provided').splitlines() or ['No resume text provided']
    buf = BytesIO()
    # PDF header
    content_lines = []
    y = 800
    for raw in lines:
        s = raw.strip().replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
        content_lines.append(f'BT /F1 12 Tf 50 {y} Td ({s[:1000]}) Tj ET')
        y -= 16
        if y < 50:
            break
    content_stream = '\\n'.join(content_lines).encode('latin-1', errors='ignore')
    xref = []
    def w(b):
        pos = buf.tell()
        buf.write(b)
        return pos
    w(b'%PDF-1.4\\n')
    # font object
    obj1 = w(b'1 0 obj\\n<< /Type /Font /Subtype /Type1 /Name /F1 /BaseFont /Helvetica >>\\nendobj\\n')
    # contents
    obj2_pos = w(f'2 0 obj\\n<< /Length {len(content_stream)} >>\\nstream\\n'.encode())
    buf.write(content_stream)
    w(b'\\nendstream\\nendobj\\n')
    # page
    obj3 = w(b'3 0 obj\\n<< /Type /Page /Parent 5 0 R /MediaBox [0 0 595 842] /Contents 2 0 R /Resources << /Font << /F1 1 0 R >> >> >>\\nendobj\\n')
    # pages
    obj4 = w(b'4 0 obj\\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\\nendobj\\n')
    # catalog
    obj5 = w(b'5 0 obj\\n<< /Type /Catalog /Pages 4 0 R >>\\nendobj\\n')
    xref_pos = buf.tell()
    buf.write(b'xref\\n0 6\\n0000000000 65535 f \\n')
    buf.write(f'{obj1:010} 00000 n \\n'.encode())
    buf.write(f'{obj2_pos:010} 00000 n \\n'.encode())
    buf.write(f'{obj3:010} 00000 n \\n'.encode())
    buf.write(f'{obj4:010} 00000 n \\n'.encode())
    buf.write(f'{obj5:010} 00000 n \\n'.encode())
    buf.write(b'trailer\\n<< /Size 6 /Root 5 0 R >>\\nstartxref\\n')
    buf.write(str(xref_pos).encode())
    buf.write(b'\\n%%EOF')
    buf.seek(0)
    return buf

@app.route('/api/applications/<int:app_id>/resume-pdf', methods=['GET'])
def application_resume_pdf(app_id):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        row = cur.execute('SELECT applications.resume_text as resume_text, applications.name as name, applications.email as email, applications.job_id as job_id, applications.resume_id as resume_id, jobs.skills as skills, jobs.position as position FROM applications LEFT JOIN jobs ON jobs.id = applications.job_id WHERE applications.id=?', (app_id,)).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Application not found'}), 404
        title = f"Resume: {row['name'] or row['email']}"
        skills_csv = row['skills'] or ''
        text_src = row['resume_text'] or ''
        email_or_file = row['email']
        if row['resume_id']:
            try:
                conn2 = db_conn()
                cur2 = conn2.cursor()
                rrow = cur2.execute('SELECT original_name, text FROM resumes WHERE id=?', (row['resume_id'],)).fetchone()
                conn2.close()
                if rrow:
                    text_src = rrow['text'] or text_src
                    email_or_file = rrow['original_name']
            except Exception:
                pass
        score = compute_match_score(text_src, email_or_file, skills_csv)
        matched, missing = matched_skills(text_src, email_or_file, skills_csv)
        header = f"{title}\\nPosition: {row['position'] or 'N/A'}\\nMatch Score: {score}%\\n"
        if matched:
            header += f"Matched skills: {', '.join(matched)}\\n"
        if missing:
            header += f"Missing skills: {', '.join(missing)}\\n"
        text = f"""{header}

{text_src or 'No resume text provided.'}"""
        buf = _simple_pdf_from_text(text)
        return send_file(buf, mimetype='application/pdf', as_attachment=False, download_name='resume.pdf')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def _html_escape(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

@app.route('/applications/<int:app_id>/resume-view', methods=['GET'])
def application_resume_view(app_id):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        row = cur.execute('SELECT applications.resume_text as resume_text, applications.name as name, applications.email as email, applications.job_id as job_id, applications.resume_id as resume_id, jobs.skills as skills, jobs.position as position FROM applications LEFT JOIN jobs ON jobs.id = applications.job_id WHERE applications.id=?', (app_id,)).fetchone()
        conn.close()
        if not row:
            return 'Not found', 404
        name = row['name'] or ''
        email = row['email'] or ''
        position = row['position'] or 'N/A'
        skills_csv = row['skills'] or ''
        resume_text = row['resume_text'] or ''
        email_or_file = email
        if row['resume_id']:
            try:
                conn2 = db_conn()
                cur2 = conn2.cursor()
                rrow = cur2.execute('SELECT original_name, text FROM resumes WHERE id=?', (row['resume_id'],)).fetchone()
                conn2.close()
                if rrow:
                    resume_text = rrow['text'] or resume_text
                    email_or_file = rrow['original_name']
            except Exception:
                pass
        score = compute_match_score(resume_text, email_or_file, skills_csv)
        matched, missing = matched_skills(resume_text, email_or_file, skills_csv)
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Resume Preview</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <style>
    body {{ background: #fff7f9; color: #334155; }}
  </style>
  <script>
    function downloadPDF() {{
      const element = document.getElementById('resume');
      const opt = {{
        margin:       0.3,
        filename:     'resume.pdf',
        image:        {{ type: 'jpeg', quality: 0.98 }},
        html2canvas:  {{ scale: 2 }},
        jsPDF:        {{ unit: 'in', format: 'a4', orientation: 'portrait' }}
      }};
      html2pdf().set(opt).from(element).save();
    }}
  </script>
  </head>
<body class="min-h-screen">
  <div class="max-w-4xl mx-auto p-6">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold text-slate-800">Resume Preview</h1>
      <button onclick="downloadPDF()" class="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700">
        <i class="fas fa-download mr-2"></i>Download PDF
      </button>
    </div>
    <div class="mb-4 p-4 bg-white border border-slate-200 rounded">
      <div class="flex flex-wrap gap-4 items-center">
        <div><span class="font-semibold">Position:</span> { _html_escape(position) }</div>
        <div><span class="font-semibold">Match Score:</span> {score}%</div>
        <div><span class="font-semibold">Matched:</span> { _html_escape(', '.join(matched)) or '-' }</div>
        <div><span class="font-semibold">Missing:</span> { _html_escape(', '.join(missing)) or '-' }</div>
      </div>
    </div>
    <div id="resume" class="bg-white border border-slate-200 rounded p-8">
      <div class="text-center border-b border-indigo-200 pb-4 mb-4">
        <h2 class="text-3xl font-bold text-slate-800">{ _html_escape(name or email) }</h2>
        <p class="text-slate-600">{ _html_escape(email) }</p>
      </div>
      <div class="prose max-w-none">
        <pre style="white-space: pre-wrap; font-family: ui-sans-serif, system-ui; color: #334155">{ _html_escape(resume_text) }</pre>
      </div>
    </div>
  </div>
</body>
</html>"""
        return html
    except Exception as e:
        return f'Error: {str(e)}', 500

@app.route('/api/candidate/applications', methods=['GET'])
def candidate_applications():
    try:
        email = request.args.get('email', '').strip()
        if not email:
            return jsonify({'error': 'email is required'}), 400
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        rows = cur.execute(
            '''SELECT applications.id as id, applications.job_id as job_id, applications.status as status,
               applications.resume_id as resume_id, applications.created_at as created_at,
               jobs.position as position, jobs.location as location, jobs.mode as mode,
               resumes.status as resume_status
               FROM applications
               JOIN jobs ON applications.job_id = jobs.id
               LEFT JOIN resumes ON resumes.id = applications.resume_id
               WHERE applications.email=? ORDER BY applications.id DESC''',
            (email,)
        ).fetchall()
        conn.close()
        items = []
        for r in rows:
            d = dict(r)
            app_st = (d.get('status') or 'applied').strip().lower()
            res_st = (d.get('resume_status') or '').strip().lower()
            if res_st and res_st != 'new':
                d['recruiter_status'] = res_st
            else:
                d['recruiter_status'] = app_st
            items.append(d)
        return jsonify({'success': True, 'applications': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/resumes/<int:resume_id>/file', methods=['GET'])
def get_resume_file(resume_id):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        row = cur.execute('SELECT * FROM resumes WHERE id=?', (resume_id,)).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Resume not found'}), 404
        path = os.path.join(app.config['UPLOAD_FOLDER'], row['filename'])
        if not os.path.exists(path):
            return jsonify({'error': 'File missing'}), 404
        return send_file(path, mimetype='application/pdf', as_attachment=False, download_name=row['original_name'])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/resumes/<int:resume_id>/status', methods=['POST'])
def set_resume_status(resume_id):
    try:
        data = request.get_json(force=True)
        status = data.get('status', '').strip().lower()
        if status not in ['selected', 'rejected', 'in_progress', 'new']:
            return jsonify({'error': 'Invalid status'}), 400
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        _, err = assert_recruiter_owns_resume(cur, resume_id)
        if err:
            conn.close()
            return jsonify(err[0]), err[1]
        cur.execute('UPDATE resumes SET status=? WHERE id=?', (status, resume_id))
        conn.commit()
        conn.close()
        log_action(request.headers.get('X-User-Email', ''), 'set_resume_status', {'resume_id': resume_id, 'status': status}, user_type=request.headers.get('X-User-Type', 'recruiter'))
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/recruiter/dashboard', methods=['GET'])
def recruiter_dashboard():
    try:
        me = recruiter_auth_email()
        if not me:
            return jsonify({'error': 'Authentication required'}), 401
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        jobs = [dict(r) for r in cur.execute(
            'SELECT * FROM jobs WHERE LOWER(COALESCE(recruiter_email, "")) = ? AND COALESCE(recruiter_email, "") != "seed@smarthire.local" ORDER BY id DESC',
            (me,)
        ).fetchall()]
        selected_rows = cur.execute(
            'SELECT resumes.id as resume_id, resumes.original_name, resumes.text, resumes.status, resumes.job_id, jobs.position, jobs.skills as skills FROM resumes JOIN jobs ON resumes.job_id = jobs.id WHERE resumes.status = "selected" AND LOWER(COALESCE(jobs.recruiter_email, "")) = ? ORDER BY resumes.uploaded_at DESC',
            (me,)
        ).fetchall()
        selected = []
        for r in selected_rows:
            d = {
                'resume_id': r['resume_id'],
                'original_name': r['original_name'],
                'status': r['status'],
                'job_id': r['job_id'],
                'position': r['position'],
                'score': compute_match_score(r['text'], r['original_name'], r['skills'] or '')
            }
            selected.append(d)
        counts = [dict(r) for r in cur.execute(
            'SELECT resumes.job_id, SUM(CASE WHEN resumes.status="selected" THEN 1 ELSE 0 END) as selected_count, COUNT(*) as total FROM resumes JOIN jobs ON resumes.job_id = jobs.id WHERE LOWER(COALESCE(jobs.recruiter_email, "")) = ? GROUP BY resumes.job_id',
            (me,)
        ).fetchall()]
        # Compute live average match score per job using current skills and resume text
        avg_by_job = {}
        for j in jobs:
            rows = cur.execute('SELECT original_name, text FROM resumes WHERE job_id=?', (j['id'],)).fetchall()
            skills_csv = j.get('skills') or ''
            scores = [compute_match_score(r['text'], r['original_name'], skills_csv) for r in rows] if rows else []
            j['avg_match'] = round(sum(scores) / len(scores), 2) if scores else None
            avg_by_job[j['id']] = j['avg_match']
        conn.close()
        return jsonify({'success': True, 'jobs': jobs, 'selected_candidates': selected, 'counts': counts})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/upsert', methods=['POST'])
def users_upsert():
    try:
        data = request.get_json(force=True)
        email = data.get('email', '').strip()
        if not email:
            return jsonify({'error': 'email is required'}), 400
        user_type = (data.get('user_type') or '').strip()
        name = (data.get('name') or '').strip()
        uid = upsert_user(email, user_type=user_type, name=name)
        return jsonify({'success': True, 'user': {'id': uid, 'email': email, 'user_type': user_type, 'name': name}})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<email>', methods=['GET'])
def get_user(email):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        row = cur.execute('SELECT id, email, user_type, name FROM users WHERE email=?', (email,)).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'not found'}), 404
        return jsonify({'success': True, 'user': dict(row)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def hash_password(pw):
    """Salted, slow hash (PBKDF2 via Werkzeug) -- replaces the old unsalted
    SHA-256, which was crackable in bulk with a rainbow table."""
    return generate_password_hash(pw or '')


def verify_password(pw, stored_hash):
    """Verifies against the new salted hash, with a one-time transparent
    upgrade path for any account still holding an old raw-SHA-256 hash."""
    if not stored_hash:
        return False
    try:
        if stored_hash.startswith('pbkdf2:') or stored_hash.startswith('scrypt:'):
            return check_password_hash(stored_hash, pw or '')
    except Exception:
        pass
    # Legacy unsalted sha256 hash from the old scheme
    legacy = hashlib.sha256((pw or '').encode('utf-8')).hexdigest()
    return legacy == stored_hash


PASSWORD_MIN_LENGTH = 8


@app.route('/api/auth/signup', methods=['POST'])
def auth_signup():
    try:
        data = request.get_json(force=True)
        email = (data.get('email') or '').strip().lower()
        name = (data.get('name') or '').strip()
        pw = (data.get('password') or '')
        user_type = (data.get('user_type') or '').strip()
        if not email or not pw or not name:
            return jsonify({'error': 'missing fields'}), 400
        if '@' not in email or '.' not in email.split('@')[-1]:
            return jsonify({'error': 'Enter a valid email address'}), 400
        if len(pw) < PASSWORD_MIN_LENGTH:
            return jsonify({'error': f'Password must be at least {PASSWORD_MIN_LENGTH} characters'}), 400
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        existing = cur.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone()
        if existing:
            conn.close()
            return jsonify({'error': 'An account with this email already exists'}), 409
        ph = hash_password(pw)
        cur.execute('INSERT INTO users (email, user_type, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', (email, user_type or 'candidate', name, ph, datetime.now().isoformat()))
        uid = cur.lastrowid
        conn.commit()
        conn.close()
        token = create_session(email, user_type or 'candidate')
        return jsonify({'success': True, 'token': token, 'user': {'id': uid, 'email': email, 'user_type': user_type or 'candidate', 'name': name}})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    try:
        data = request.get_json(force=True)
        email = (data.get('email') or '').strip().lower()
        pw = (data.get('password') or '')
        if not email or not pw:
            return jsonify({'error': 'missing fields'}), 400
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        row = cur.execute('SELECT id, email, user_type, name, password_hash FROM users WHERE email=?', (email,)).fetchone()
        if not row or not verify_password(pw, row['password_hash']):
            conn.close()
            return jsonify({'error': 'Incorrect email or password'}), 401
        # Transparently upgrade legacy sha256 hashes to salted PBKDF2 on next login
        if row['password_hash'] and not (row['password_hash'].startswith('pbkdf2:') or row['password_hash'].startswith('scrypt:')):
            cur.execute('UPDATE users SET password_hash=? WHERE id=?', (hash_password(pw), row['id']))
            conn.commit()
        conn.close()
        token = create_session(email, row['user_type'])
        return jsonify({'success': True, 'token': token, 'user': {'id': row['id'], 'email': row['email'], 'user_type': row['user_type'], 'name': row['name']}})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    token = _session_token_from_request()
    if token:
        try:
            conn = db_conn()
            conn.execute('DELETE FROM sessions WHERE token=?', (token,))
            conn.commit()
            conn.close()
        except Exception:
            pass
    return jsonify({'success': True})

@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    session = get_session()
    if not session:
        return jsonify({'error': 'Authentication required'}), 401
    try:
        conn = db_conn()
        row = conn.execute(
            'SELECT id, email, user_type, name FROM users WHERE email=?',
            (session['email'],)
        ).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'User not found'}), 404
        return jsonify({'success': True, 'user': dict(row)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<email>/actions', methods=['GET'])
def users_actions(email):
    try:
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        row = cur.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
        if not row:
            conn.close()
            return jsonify({'success': True, 'actions': []})
        uid = row['id']
        acts = [dict(r) for r in cur.execute('SELECT id, action_type, metadata, created_at FROM user_actions WHERE user_id=? ORDER BY id DESC', (uid,)).fetchall()]
        conn.close()
        return jsonify({'success': True, 'actions': acts})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/applications/<int:app_id>/attach-resume', methods=['POST'])
def attach_resume_to_application(app_id):
    try:
        data = request.get_json(force=True)
        rid = int(data.get('resume_id') or 0)
        if not rid:
            return jsonify({'error': 'resume_id is required'}), 400
        init_db()
        conn = db_conn()
        cur = conn.cursor()
        app_row = cur.execute('SELECT id, job_id FROM applications WHERE id=?', (app_id,)).fetchone()
        if not app_row:
            conn.close()
            return jsonify({'error': 'Application not found'}), 404
        _, err = assert_recruiter_owns_job(cur, app_row['job_id'])
        if err:
            conn.close()
            return jsonify(err[0]), err[1]
        r = cur.execute('SELECT id, job_id, original_name, text FROM resumes WHERE id=?', (rid,)).fetchone()
        if not r:
            conn.close()
            return jsonify({'error': 'Resume not found'}), 404
        if r['job_id'] != app_row['job_id']:
            conn.close()
            return jsonify({'error': 'Resume belongs to a different job'}), 400
        job = cur.execute('SELECT skills FROM jobs WHERE id=?', (app_row['job_id'],)).fetchone()
        skills_csv = job['skills'] if job else ''
        score = compute_match_score(r['text'], r['original_name'], skills_csv)
        cur.execute('UPDATE applications SET resume_id=?, resume_text=?, match_score=? WHERE id=?', (rid, r['text'] or '', score, app_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/integrity', methods=['GET'])
def admin_integrity():
    ok = integrity_ok()
    return jsonify({'success': True, 'integrity_ok': ok})

@app.route('/api/admin/rebuild-db', methods=['POST'])
def admin_rebuild_db():
    try:
        # (was previously a broken operator-precedence expression that could crash
        # on non-JSON requests: `(a or b if c else d) or e` binds as `a or (b if c else d)`)
        body_json = request.get_json(silent=True) if request.is_json else None
        body_mode = (body_json or {}).get('mode')
        mode = request.args.get('mode') or body_mode or 'fresh'
        if mode not in ['fresh', 'salvage']:
            mode = 'fresh'
        backup_path = None
        if mode == 'salvage':
            try:
                src = db_path()
                conn = sqlite3.connect(f'file:{src}?mode=ro', uri=True)
                dump = '\n'.join(conn.iterdump())
                conn.close()
                backup_path = backup_db()
                with sqlite3.connect(src) as new_conn:
                    new_conn.executescript(dump)
                ok = integrity_ok()
                if not ok:
                    backup_path = rebuild_db_fresh() or backup_path
                    return jsonify({'success': True, 'mode': 'fresh', 'backup': backup_path})
                init_db()
                return jsonify({'success': True, 'mode': 'salvage', 'backup': backup_path})
            except Exception:
                backup_path = rebuild_db_fresh()
                return jsonify({'success': True, 'mode': 'fresh', 'backup': backup_path})
        else:
            backup_path = rebuild_db_fresh()
            return jsonify({'success': True, 'mode': 'fresh', 'backup': backup_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Resource not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    print(f"500 Error: {error}")
    return jsonify({'error': f'Internal server error: {str(error)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    print(f"\n{'='*50}")
    print(f"SmartHire Backend Server")
    print(f"{'='*50}")
    print(f"Running on: http://localhost:{port}")
    print(f"Debug mode: {debug}")
    print(f"{'='*50}\n")
    try:
        ok = integrity_ok()
    except Exception:
        ok = False
    if not ok:
        rebuild_db_fresh()
    try:
        init_db()
    except sqlite3.DatabaseError:
        rebuild_db_fresh()
        init_db()
    app.run(host='0.0.0.0', port=port, debug=debug)

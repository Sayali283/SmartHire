const { useState, useEffect, useMemo } = React;

const authFetch = (url, options = {}) => {
  const token = window.localStorage.getItem('smarthire_session_token');
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
};

const notify = (message, tone = 'info') => {
  window.dispatchEvent(new CustomEvent('smarthire:toast', { detail: { message, tone } }));
};

const ToastHost = () => {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const handleToast = (event) => {
      setToast(event.detail);
      window.setTimeout(() => setToast(null), 3600);
    };
    window.addEventListener('smarthire:toast', handleToast);
    return () => window.removeEventListener('smarthire:toast', handleToast);
  }, []);

  if (!toast) return null;
  const isError = toast.tone === 'error';
  return (
    <div className={`toast-notification ${isError ? 'toast-error' : 'toast-success'}`} role="status" aria-live="polite">
      <i className={`fas ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}`}></i>
      <span>{toast.message}</span>
      <button onClick={() => setToast(null)} aria-label="Dismiss notification" className="toast-close">
        <i className="fas fa-xmark"></i>
      </button>
    </div>
  );
};

// --- Components ---

const Navbar = ({ activeTab, setActiveTab, candidateAuth, recruiterAuth, setCandidateAuth, setRecruiterAuth, candidateName, recruiterName, setSelectedRole }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const isAuthenticated = Boolean(candidateAuth || recruiterAuth);
  const dashboardTab = candidateAuth ? 'candidate' : 'recruiter';
  const displayName = candidateName || recruiterName || (candidateAuth || recruiterAuth || '').split('@')[0];
  const goTo = (tab) => {
    setActiveTab(tab);
    setMenuOpen(false);
  };

  const logout = async () => {
    try { await authFetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    setCandidateAuth(null);
    setRecruiterAuth(null);
    window.localStorage.removeItem('smarthire_session_token');
    goTo('home');
  };

  return (
  <nav className="fixed top-0 left-0 right-0 glass-nav border-b border-white/40 z-50 shadow-sm shadow-indigo-100/50">
    <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <button className="flex items-center space-x-2 cursor-pointer" onClick={() => goTo('home')} aria-label="SmartHire home">
        <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-1.5 rounded-lg shadow-md shadow-indigo-300/50">
          <i className="fas fa-bolt text-white text-2xl"></i>
        </div>
        <span className="text-xl font-bold text-slate-800 tracking-tight">SmartHire</span>
      </button>
      <div className="hidden md:flex items-center space-x-8 text-sm font-medium">
        {['home', 'about', 'contact'].map((tab) => (
          <button
            key={tab}
            onClick={() => goTo(tab)}
            className={`capitalize relative py-1 transition-colors ${
              activeTab === tab ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab}
            <span className={`absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-transform duration-300 origin-left ${activeTab === tab ? 'scale-x-100' : 'scale-x-0'}`}></span>
          </button>
        ))}
        {isAuthenticated && (
          <button onClick={() => goTo(dashboardTab)} className={activeTab === dashboardTab ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}>
            Dashboard
          </button>
        )}
      </div>
      <div className="hidden md:flex items-center gap-3">
        {!candidateAuth && !recruiterAuth ? (
          <button 
            onClick={() => {
              setSelectedRole(null);
              setActiveTab('auth');
            }}
            className="btn-primary px-4 py-2 rounded-xl text-sm font-medium"
          >
            Login / Sign Up
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="user-chip" title={candidateAuth || recruiterAuth}>{displayName}</span>
            <button onClick={logout} className="text-slate-500 hover:text-slate-800 px-3 py-2 text-sm font-medium transition-colors">
              Logout
            </button>
          </div>
        )}
      </div>
      <button className="md:hidden p-2 text-slate-700" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen}>
        <i className={`fas ${menuOpen ? 'fa-xmark' : 'fa-bars'} text-lg`}></i>
      </button>
    </div>
    {menuOpen && (
      <div className="md:hidden mobile-menu border-t border-white/50 px-4 py-4 space-y-2">
        {['home', 'about', 'contact'].map(tab => (
          <button key={tab} onClick={() => goTo(tab)} className="mobile-nav-link capitalize">{tab}</button>
        ))}
        {isAuthenticated ? (
          <>
            <button onClick={() => goTo(dashboardTab)} className="mobile-nav-link">Dashboard</button>
            <button onClick={logout} className="mobile-nav-link text-rose-600">Logout</button>
          </>
        ) : (
          <button onClick={() => { setSelectedRole(null); goTo('auth'); }} className="btn-primary w-full py-3 rounded-xl font-medium">Login / Sign Up</button>
        )}
      </div>
    )}
  </nav>
  );
};

const Hero = ({ setActiveTab, setSelectedRole, scrollToFeatures }) => {
  const taglines = [
    'AI-powered resume analysis and intelligent candidate matching.',
    'Optimize your CV for every job in seconds.',
    'Let data guide your hiring decisions.',
    'Find talent faster with smart analytics.'
  ];
  const [tagIdx, setTagIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      setTagIdx(i => (i + 1) % taglines.length);
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  return (
    <section className="pt-32 pb-24 px-4 text-center relative overflow-hidden" style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1521737711867-e3b97375f902?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80")', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/80 via-violet-950/70 to-slate-950/80 z-0"></div>
      <div className="absolute -top-20 -left-20 w-96 h-96 bg-indigo-500/30 rounded-full blur-3xl animate-blob z-0"></div>
      <div className="absolute top-10 -right-20 w-96 h-96 bg-pink-500/25 rounded-full blur-3xl animate-blob animation-delay-2000 z-0"></div>
      <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-emerald-400/15 rounded-full blur-3xl animate-blob animation-delay-4000 z-0"></div>
      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="fade-up inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/90 text-sm">
          <i className="fas fa-wand-magic-sparkles text-pink-300"></i> AI-powered hiring, reimagined
        </div>
        <h1 className="fade-up fade-up-1 text-6xl font-bold text-white mb-6 tracking-tight">
          The Future of <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-pink-300 bg-clip-text text-transparent">Recruitment</span>
        </h1>
        <p key={tagIdx} className="fade-up fade-up-2 text-xl text-white/90 mb-8 leading-relaxed transition-opacity duration-500">
          {taglines[tagIdx]}
        </p>
        <div className="fade-up fade-up-3 flex gap-4 justify-center flex-wrap">
          <button
            onClick={() => {
              setSelectedRole('candidate');
              setActiveTab('auth');
            }}
            className="btn-primary px-8 py-3 rounded-xl font-semibold"
          >
            For Candidates
          </button>
          <button
            onClick={() => {
              setSelectedRole('recruiter');
              setActiveTab('auth');
            }}
            className="px-8 py-3 rounded-xl font-semibold bg-white/10 backdrop-blur-md text-white border border-white/30 hover:bg-white/20 hover:-translate-y-0.5 transition-all duration-300"
          >
            For Recruiters
          </button>
        </div>
      </div>
      {/* scroll arrow */}
      <div
        onClick={scrollToFeatures}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-floaty cursor-pointer w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors z-10"
      >
        <i className="fas fa-chevron-down text-white"></i>
      </div>
    </section>
  );
};

const AuthPage = ({ setCandidateAuth, setRecruiterAuth, setActiveTab, selectedRole, setSelectedRole }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [userType, setUserType] = useState(selectedRole || 'candidate');
  const [loading, setLoading] = useState(false);
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Sign up form state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [signupUserType, setSignupUserType] = useState(selectedRole || 'candidate');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      notify('Please fill in all fields', 'error');
      return;
    }
    
    const effectiveUserType = selectedRole || userType;
    
    setLoading(true);
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: loginEmail, password: loginPassword }) });
      const data = await r.json();
      if (!data.success) throw new Error(data.error || 'Login failed');
      window.localStorage.setItem('smarthire_session_token', data.token);
      if (effectiveUserType === 'candidate') {
        setCandidateAuth(data.user.email);
        setActiveTab('candidate');
      } else {
        setRecruiterAuth(data.user.email);
        setActiveTab('recruiter');
      }
      notify(`Welcome, ${data.user.name || data.user.email}!`, 'success');
      setLoginEmail('');
      setLoginPassword('');
      setSelectedRole(null);
      setLoading(false);
    } catch (error) {
      console.error('Error:', error);
      notify(error.message || 'Login failed', 'error');
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!signupName || !signupEmail || !signupPassword || !signupConfirmPassword) {
      notify('Please fill in all fields', 'error');
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      notify('Passwords do not match', 'error');
      return;
    }
    
    const effectiveUserType = selectedRole || signupUserType;
    
    setLoading(true);
    try {
      const r = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: signupEmail, password: signupPassword, name: signupName, user_type: effectiveUserType }) });
      const data = await r.json();
      if (!data.success) throw new Error(data.error || 'Sign up failed');
      window.localStorage.setItem('smarthire_session_token', data.token);
      if (effectiveUserType === 'candidate') {
        setCandidateAuth(signupEmail);
        setActiveTab('candidate');
      } else {
        setRecruiterAuth(signupEmail);
        setActiveTab('recruiter');
      }
      notify('Account created successfully!', 'success');
      setSignupName('');
      setSignupEmail('');
      setSignupPassword('');
      setSignupConfirmPassword('');
      setSelectedRole(null);
      setLoading(false);
    } catch (error) {
      console.error('Error:', error);
      notify(error.message || 'Sign up failed', 'error');
      setLoading(false);
    }
  };

  // Show role selection if no specific role is selected
  if (!selectedRole) {
    return (
      <section className="min-h-screen pt-32 pb-20 px-4 flex items-center justify-center relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-indigo-300/30 rounded-full blur-3xl animate-blob"></div>
        <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-pink-300/30 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
        <div className="max-w-md w-full relative z-10">
          <div className="glass-card rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-800">Select Your Role</h2>
              <p className="text-slate-600 mt-2">Choose how you want to proceed</p>
            </div>
            
            <div className="space-y-4">
              <button
                onClick={() => setSelectedRole('candidate')}
                className="w-full btn-primary py-4 rounded-xl font-semibold flex items-center justify-center gap-3"
              >
                <i className="fas fa-user text-xl"></i>
                <span>I'm a Candidate</span>
              </button>
              
              <button
                onClick={() => setSelectedRole('recruiter')}
                className="w-full btn-emerald py-4 rounded-xl font-semibold flex items-center justify-center gap-3"
              >
                <i className="fas fa-briefcase text-xl"></i>
                <span>I'm a Recruiter</span>
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200">
              <button
                onClick={() => setActiveTab('home')}
                className="w-full text-slate-600 hover:text-slate-800 py-2 transition-colors"
              >
                ← Back to Home
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen pt-32 pb-20 px-4 flex items-center justify-center relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-indigo-300/30 rounded-full blur-3xl animate-blob"></div>
        <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-pink-300/30 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
      <div className="max-w-md w-full relative z-10">
        <div className="glass-card rounded-2xl p-8 shadow-2xl">
          {/* Toggle Buttons */}
          <div className="flex rounded-xl bg-white/50 backdrop-blur-sm p-1 mb-8 border border-white/60">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 rounded font-medium transition-colors ${
                isLogin 
                  ? 'pill-active' 
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 rounded font-medium transition-colors ${
                !isLogin 
                  ? 'pill-active' 
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Login Form */}
          {isLogin ? (
            <>
              <div className="text-center mb-6">
                <h2 className="text-3xl font-bold text-slate-800">Welcome Back</h2>
                <p className="text-slate-600 mt-2">
                  Login as {selectedRole === 'candidate' ? 'Candidate' : selectedRole === 'recruiter' ? 'Recruiter' : 'User'}
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {!selectedRole && (
                  <div>
                    <label className="block text-slate-800 text-sm font-semibold mb-2">User Type</label>
                    <select
                      value={userType}
                      onChange={(e) => setUserType(e.target.value)}
                      className="w-full px-4 py-3 glass-input text-slate-800 rounded-xl cursor-pointer"
                    >
                      <option value="candidate">Candidate</option>
                      <option value="recruiter">Recruiter</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-slate-800 text-sm font-semibold mb-2">Email Address</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 glass-input text-slate-800 rounded-xl"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-800 text-sm font-semibold mb-2">Password</label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 glass-input text-slate-800 rounded-xl"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary py-3 rounded-xl font-semibold disabled:opacity-50 mt-6"
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-slate-200 space-y-3">
                {selectedRole && (
                  <button
                    onClick={() => setSelectedRole(null)}
                    className="w-full text-slate-600 hover:text-slate-800 py-2 transition-colors"
                  >
                    ← Change Role
                  </button>
                )}
                <button
                  onClick={() => {
                    setActiveTab('home');
                    setSelectedRole(null);
                  }}
                  className="w-full text-slate-600 hover:text-slate-800 py-2 transition-colors"
                >
                  ← Back to Home
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Sign Up Form */}
              <div className="text-center mb-6">
                <h2 className="text-3xl font-bold text-slate-800">Create Account</h2>
                <p className="text-slate-600 mt-2">
                  Sign up as {selectedRole === 'candidate' ? 'Candidate' : selectedRole === 'recruiter' ? 'Recruiter' : 'User'}
                </p>
              </div>

              <form onSubmit={handleSignup} className="space-y-4">
                {!selectedRole && (
                  <div>
                    <label className="block text-slate-800 text-sm font-semibold mb-2">I am a</label>
                    <select
                      value={signupUserType}
                      onChange={(e) => setSignupUserType(e.target.value)}
                      className="w-full px-4 py-3 glass-input text-slate-800 rounded-xl cursor-pointer"
                    >
                      <option value="candidate">Candidate</option>
                      <option value="recruiter">Recruiter</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-slate-800 text-sm font-semibold mb-2">Full Name</label>
                  <input
                    type="text"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-3 glass-input text-slate-800 rounded-xl"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-800 text-sm font-semibold mb-2">Email Address</label>
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 glass-input text-slate-800 rounded-xl"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-800 text-sm font-semibold mb-2">Password</label>
                  <input
                    type="password"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 glass-input text-slate-800 rounded-xl"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-800 text-sm font-semibold mb-2">Confirm Password</label>
                  <input
                    type="password"
                    value={signupConfirmPassword}
                    onChange={(e) => setSignupConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 glass-input text-slate-800 rounded-xl"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary py-3 rounded-xl font-semibold disabled:opacity-50 mt-6"
                >
                  {loading ? 'Creating Account...' : 'Sign Up'}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-slate-200 space-y-3">
                {selectedRole && (
                  <button
                    onClick={() => setSelectedRole(null)}
                    className="w-full text-slate-600 hover:text-slate-800 py-2 transition-colors"
                  >
                    ← Change Role
                  </button>
                )}
                <button
                  onClick={() => {
                    setActiveTab('home');
                    setSelectedRole(null);
                  }}
                  className="w-full text-slate-600 hover:text-slate-800 py-2 transition-colors"
                >
                  ← Back to Home
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};


const Features = () => {
  const [visible, setVisible] = useState(-1);
  const items = [
    {
      icon: 'fas fa-chart-line',
      title: 'ATS Pulse Check',
      desc: 'Real-time resume optimization with ATS compatibility scoring'
    },
    {
      icon: 'fas fa-brain',
      title: 'Neural Match Score',
      desc: 'AI-powered candidate ranking with intelligent matching'
    },
    {
      icon: 'fas fa-flask',
      title: 'Recruiter Lab',
      desc: 'Advanced tools for bulk candidate analysis & exports'
    },
    {
      icon: 'fas fa-shield-halved',
      title: 'Secure Access',
      desc: 'Only verified accounts can log in; credentials are hashed'
    },
    {
      icon: 'fas fa-user-graduate',
      title: 'Resume Coaching',
      desc: 'Smart suggestions to strengthen impact & clarity'
    },
    {
      icon: 'fas fa-chart-pie',
      title: 'Insights & Analytics',
      desc: 'Skill distribution across applicants at-a-glance'
    }
  ];

  useEffect(() => {
    let idx = 0;
    const iv = setInterval(() => {
      setVisible(prev => {
        if (prev < items.length - 1) return prev + 1;
        clearInterval(iv);
        return prev;
      });
    }, 200);
    return () => clearInterval(iv);
  }, []);

  return (
    <section className="py-20 px-4 border-t border-white/50 relative">
      <div className="max-w-6xl mx-auto">
        <h2 className="fade-up text-4xl font-bold text-center text-slate-800 mb-4">Why SmartHire?</h2>
        <p className="fade-up fade-up-1 text-center text-slate-500 mb-16 max-w-xl mx-auto">Everything you need to hire smarter and get hired faster.</p>
        <div className="grid md:grid-cols-3 gap-8">
          {items.map((feature, i) => (
            <div
              key={i}
              className={`p-8 bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 shadow-lg shadow-indigo-100/50 hover:shadow-2xl hover:shadow-indigo-200/60 hover:-translate-y-2 hover:border-indigo-200 transition-all duration-500 group ${
                visible >= i ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              }`}
            >
              <i className={`${feature.icon} text-3xl text-indigo-600 mb-4`}></i>
              <h3 className="text-xl font-semibold text-slate-800 mb-3">{feature.title}</h3>
              <p className="text-slate-700">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const AnalyticsChart = ({ jobId, recruiterEmail }) => {
  const [data, setData] = useState(null);
  const canvasRef = React.useRef(null);
  useEffect(() => {
    const load = async () => {
      if (!jobId || !recruiterEmail) return;
      try {
        const r = await authFetch(`/api/jobs/${jobId}/analytics`, { headers: { 'X-User-Email': recruiterEmail, 'X-User-Type': 'recruiter' } });
        const d = await r.json();
        if (d.success) setData(d.skills);
        else setData(null);
      } catch (e) {}
    };
    load();
  }, [jobId, recruiterEmail]);
  useEffect(() => {
    if (!data || !canvasRef.current || typeof Chart === 'undefined') return;
    const labels = data.map(x => x.skill);
    const applicants = data.map(x => x.applicants);
    const uploads = data.map(x => x.uploads);
    const ctx = canvasRef.current.getContext('2d');
    if (canvasRef.current._chart) {
      canvasRef.current._chart.destroy();
    }
    canvasRef.current._chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Applicants', data: applicants, backgroundColor: 'rgba(99,102,241,0.6)' },
          { label: 'Uploads', data: uploads, backgroundColor: 'rgba(16,185,129,0.6)' }
        ]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }, [data]);
  return (
    <div>
      <canvas ref={canvasRef} height="120"></canvas>
      {!data && <p className="text-slate-500 mt-2">No analytics yet.</p>}
    </div>
  );
};

const CandidateSuite = ({ candidateAuth, setActiveTab }) => {
  if (!candidateAuth) {
    return (
      <section className="min-h-screen pt-32 pb-20 px-4 flex items-center justify-center relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-indigo-300/30 rounded-full blur-3xl animate-blob"></div>
        <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-pink-300/30 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
        <div className="text-center relative z-10">
          <h2 className="text-3xl font-bold text-slate-800 mb-4">Please login to continue</h2>
          <button 
            onClick={() => setActiveTab('auth')}
            className="btn-primary px-8 py-3 rounded-xl font-semibold"
          >
            Go to Login
          </button>
        </div>
      </section>
    );
  }

  const [candidateTab, setCandidateTab] = useState('create-resume');
  const [loading, setLoading] = useState(false);

  // Create Resume State
  const [resumeForm, setResumeForm] = useState({
    name: '',
    email: candidateAuth,
    phone: '',
    address: '',
    careerObjective: '',
    skills: '',
    experience: '',
    qualification: '',
    interests: ''
  });
  const [createdResume, setCreatedResume] = useState(null);
  const [createdScore, setCreatedScore] = useState(null);
  const [createdSuggestions, setCreatedSuggestions] = useState([]);
  const [candidateDisplayName, setCandidateDisplayName] = useState('');

  // Upload Resume State
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadAnalysis, setUploadAnalysis] = useState(null);

  // Template Selection
  const [selectedTemplate, setSelectedTemplate] = useState('modern');
  // ATS Scan State (text paste)
  const [resumeText, setResumeText] = useState('');
  const [atScore, setAtScore] = useState(null);
  const [feedback, setFeedback] = useState('');

  const buildResumeScanText = (resume) => {
    if (!resume) return '';
    const parts = [];
    if (resume.careerObjective) parts.push(`Objective\n${resume.careerObjective}`);
    if (resume.skills) parts.push(`Skills\n${resume.skills}`);
    if (resume.experience) parts.push(`Experience\n${resume.experience}`);
    if (resume.qualification) parts.push(`Education\n${resume.qualification}`);
    if (resume.interests) parts.push(`Interests\n${resume.interests}`);
    const body = parts.join('\n\n').trim();
    if (body) return body;
    return [resume.name, resume.email, resume.phone, resume.address].filter(Boolean).join('\n');
  };

  // ATS Analysis for Created Resume (fallback if API fails)
  const analyzeResumeATS = (resume) => {
    const skills = (resume.skills || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const exp = (resume.experience || '').toLowerCase();
    const edu = (resume.qualification || '').toLowerCase();
    const obj = (resume.careerObjective || '').toLowerCase();
    const skillsBlob = (resume.skills || '').toLowerCase();
    const interests = (resume.interests || '').toLowerCase();
    const txt = [obj, skillsBlob, exp, edu, interests].filter(Boolean).join(' ');
    const tokens = txt.split(/\s+/).filter(Boolean);
    let score = 0;
    // Skills coverage: up to 40 points
    const skillHits = skills.reduce((acc, s) => acc + (s && txt.includes(s) ? 1 : 0), 0);
    score += Math.min((skillHits / Math.max(skills.length || 1, 1)) * 40, 40);
    // Action verbs: up to 20 points
    const verbs = ['built', 'developed', 'implemented', 'designed', 'led', 'optimized', 'created', 'delivered', 'improved', 'automated'];
    const verbHits = verbs.reduce((acc, v) => acc + (exp.includes(v) ? 1 : 0), 0);
    score += Math.min(verbHits * 4, 20);
    // Quantified results: up to 20 points
    const numbers = (exp.match(/\b\d+(\.\d+)?\b/g) || []).length + (exp.match(/%/g) || []).length;
    score += Math.min(numbers * 2, 20);
    // Sections present: up to 20 points
    let sections = 0;
    if (exp.length > 50) sections++;
    if (edu.length > 30) sections++;
    if ((resume.skills || '').length > 0) sections++;
    if (obj.length > 10) sections++;
    score += Math.min(sections * 5, 20);
    // Penalize only when overall content is very thin (all fields combined)
    if (tokens.length < 40) score -= 20;
    if (tokens.length < 20) score -= 25;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const suggestions = [];
    if (skillHits < Math.max(1, Math.floor((skills.length || 1) * 0.6))) suggestions.push('Align skills with target roles; add missing core skills');
    if (verbHits < 4) suggestions.push('Use strong action verbs in experience (Developed, Implemented, Led)');
    if (numbers < 5) suggestions.push('Add measurable results (numbers, % improvements)');
    if (sections < 3) suggestions.push('Add missing sections: Experience, Skills, Education, Summary');
    if (tokens.length < 150) suggestions.push('Provide more detail on responsibilities and outcomes');
    return { score, suggestions };
  };
  const [availableJobs, setAvailableJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [myApps, setMyApps] = useState([]);
  const [applyFile, setApplyFile] = useState(null);
  const [serverPreview, setServerPreview] = useState(null);
  const computeMatchScoreClient = (text_source, filename, skills_csv) => {
    const skills = (skills_csv || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!skills.length) return 0;
    const text = ((text_source || '') + ' ' + (filename || '')).toLowerCase();
    let hits = 0;
    for (const s of skills) {
      if (s && text.includes(s)) hits += 1;
    }
    return Math.round((hits / skills.length) * 100);
  };
  const matchedSkillsClient = (text_source, filename, skills_csv) => {
    const skills = (skills_csv || '').split(',').map(s => s.trim()).filter(Boolean);
    const lower = ((text_source || '') + ' ' + (filename || '')).toLowerCase();
    const matched = [];
    const missing = [];
    for (const s of skills) {
      if (lower.includes(s.toLowerCase())) matched.push(s);
      else missing.push(s);
    }
    return { matched, missing };
  };
  const previewResumeText = React.useMemo(() => {
    if (createdResume) {
      return [
        createdResume.careerObjective,
        createdResume.skills,
        createdResume.experience,
        createdResume.qualification,
        createdResume.interests
      ].filter(Boolean).join('\n\n');
    }
    if (resumeText) return resumeText;
    return '';
  }, [createdResume, resumeText]);
  const previewFileName = createdResume?.name || candidateAuth || '';
  const previewSkillsCsv = selectedJob?.skills || '';
  const previewMatch = React.useMemo(() => computeMatchScoreClient(previewResumeText, previewFileName, previewSkillsCsv), [previewResumeText, previewFileName, previewSkillsCsv]);
  const previewMM = React.useMemo(() => matchedSkillsClient(previewResumeText, previewFileName, previewSkillsCsv), [previewResumeText, previewFileName, previewSkillsCsv]);
  useEffect(() => {
    const load = async () => {
      try {
        const jr = await fetch('/api/jobs');
        const j = await jr.json();
        if (j.success) setAvailableJobs(j.jobs);
      } catch (e) {}
      try {
        const ar = await fetch(`/api/candidate/applications?email=${encodeURIComponent(candidateAuth)}`);
        const a = await ar.json();
        if (a.success) setMyApps(a.applications);
      } catch (e) {}
      try {
        const ur = await fetch(`/api/users/${encodeURIComponent(candidateAuth)}`);
        const u = await ur.json();
        if (u.success) {
          setCandidateDisplayName(u.user.name || '');
        }
      } catch (e) {}
    };
    load();
  }, [candidateAuth]);

  const handleResumeFormChange = (e) => {
    const { name, value } = e.target;
    setResumeForm(prev => ({ ...prev, [name]: value }));
  };

  const refreshCreatedResumeATS = async (resume) => {
    if (!resume) return;
    const fallback = analyzeResumeATS(resume);
    const resume_text = buildResumeScanText(resume);
    if (!resume_text.trim()) {
      setCreatedScore(fallback.score);
      setCreatedSuggestions(fallback.suggestions);
      return;
    }
    try {
      const response = await fetch('/api/scan-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Email': candidateAuth, 'X-User-Type': 'candidate' },
        body: JSON.stringify({ resume_text })
      });
      const data = await response.json();
      if (data.success) {
        setCreatedScore(Math.round(Number(data.score)));
        setCreatedSuggestions(data.suggestions || []);
        return;
      }
    } catch (err) {
      console.error('ATS scan failed', err);
    }
    setCreatedScore(fallback.score);
    setCreatedSuggestions(fallback.suggestions);
  };

  const handleCreateResume = (e) => {
    e.preventDefault();
    if (!resumeForm.name || !resumeForm.email || !resumeForm.phone || !resumeForm.address) {
      notify('Please fill in all required fields', 'error');
      return;
    }
    const snapshot = { ...resumeForm };
    setCreatedResume(snapshot);
    const res = analyzeResumeATS(snapshot);
    setCreatedScore(res.score);
    setCreatedSuggestions(res.suggestions);
    refreshCreatedResumeATS(snapshot);
  };

  const handleUploadResume = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setLoading(true);
      const run = async () => {
        try {
          const fd = new FormData();
          fd.append('resume_pdf', file);
          const r = await fetch('/api/scan-resume-pdf', { method: 'POST', body: fd });
          const d = await r.json();
          if (d.success) {
            setUploadAnalysis({
              atsScore: Math.round(d.score),
              friendlyness: d.friendlyness,
              suggestions: d.suggestions || []
            });
          } else {
            setUploadAnalysis({
              atsScore: null,
              friendlyness: 'Error',
              suggestions: ['Failed to analyze resume']
            });
          }
        } catch (err) {
          setUploadAnalysis({
            atsScore: null,
            friendlyness: 'Error',
            suggestions: ['Failed to analyze resume']
          });
        }
        setLoading(false);
      };
      run();
    }
  };

  const handleApplyJob = async (jobId) => {
    try {
      // If user attached a PDF, submit as multipart and store resume_id on application
      let res;
      if (applyFile) {
        const fd = new FormData();
        fd.append('email', candidateAuth);
        fd.append('name', createdResume?.name || candidateDisplayName || '');
        fd.append('resume_pdf', applyFile);
        res = await fetch(`/api/jobs/${jobId}/apply`, { method: 'POST', headers: { 'X-User-Email': candidateAuth, 'X-User-Type': 'candidate' }, body: fd });
      } else {
        const rt = createdResume ? [
          createdResume.careerObjective,
          createdResume.skills,
          createdResume.experience,
          createdResume.qualification,
          createdResume.interests
        ].filter(Boolean).join('\n\n') : '';
        res = await fetch(`/api/jobs/${jobId}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Email': candidateAuth, 'X-User-Type': 'candidate' }, body: JSON.stringify({ email: candidateAuth, name: createdResume?.name || candidateDisplayName || '', resume_text: rt }) });
      }
      const data = await res.json();
      if (data.success) {
        const ar = await fetch(`/api/candidate/applications?email=${encodeURIComponent(candidateAuth)}`);
        const a = await ar.json();
        if (a.success) setMyApps(a.applications);
        notify('Application submitted successfully', 'success');
        setSelectedJob(null);
        setApplyFile(null);
        setServerPreview(null);
      } else {
        notify(data.error || 'Failed to apply', 'error');
      }
    } catch (e) {
      notify('Failed to apply', 'error');
    }
  };

  useEffect(() => {
    const runPreview = async () => {
      if (!applyFile || !selectedJob) {
        setServerPreview(null);
        return;
      }
      try {
        const fd = new FormData();
        fd.append('resume_pdf', applyFile);
        const r = await fetch(`/api/jobs/${selectedJob.id}/preview-match`, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.success) setServerPreview({ score: d.score, matched: d.matched || [], missing: d.missing || [] });
      } catch (e) {
        setServerPreview(null);
      }
    };
    runPreview();
  }, [applyFile, selectedJob?.id]);

  const escapeHtmlForPdf = (s) => {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const buildResumePdfHtml = (r) => {
    const block = (title, text) => {
      const t = (text != null && String(text).trim()) ? String(text) : '';
      if (!t) return '';
      return `<div style="margin-bottom:20px;">
        <h2 style="font-size:13px;font-weight:bold;color:#111827;border-bottom:1px solid #d1d5db;padding-bottom:6px;margin:0 0 10px 0;letter-spacing:0.02em;break-after:avoid;">${escapeHtmlForPdf(title)}</h2>
        <p style="margin:0;font-size:11.5px;line-height:1.6;color:#374151;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;">${escapeHtmlForPdf(t)}</p>
      </div>`;
    };
    return `<div class="resume-pdf-root" style="font-family:Arial,Helvetica,sans-serif;padding:36px 44px;background:#ffffff;color:#111827;box-sizing:border-box;width:794px;min-height:200px;">
      <div style="text-align:center;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid #4f46e5;">
        <h1 style="margin:0 0 10px 0;font-size:26px;font-weight:bold;color:#111827;">${escapeHtmlForPdf(r.name || '')}</h1>
        <p style="margin:6px 0;font-size:11px;color:#4b5563;">${escapeHtmlForPdf(r.email || '')} | ${escapeHtmlForPdf(r.phone || '')}</p>
        <p style="margin:6px 0;font-size:11px;color:#4b5563;">${escapeHtmlForPdf(r.address || '')}</p>
      </div>
      ${block('CAREER OBJECTIVE', r.careerObjective)}
      ${block('SKILLS', r.skills)}
      ${block('EXPERIENCE', r.experience)}
      ${block('QUALIFICATIONS', r.qualification)}
      ${block('INTERESTS', r.interests)}
    </div>`;
  };

  const downloadPDF = () => {
    if (!createdResume) return;
    if (typeof window.html2pdf === 'undefined') {
      notify('PDF export is not available. Refresh the page and try again.', 'error');
      return;
    }
    const safeName = (createdResume.name || 'Resume').replace(/\s+/g, '_').replace(/[^\w.-]+/g, '');

    // html2canvas often produces a blank image for off-screen or negative z-index nodes.
    // Mount content in a short-lived visible layer so it is actually painted.
    const backdrop = document.createElement('div');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.style.cssText =
      'position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:999998;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';

    const frame = document.createElement('div');
    // No CSS transform on ancestors of the capture node — html2canvas often yields blank output otherwise.
    frame.style.cssText =
      'position:relative;z-index:999999;max-width:794px;width:100%;max-height:92vh;overflow:auto;background:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);border-radius:8px;padding:8px;box-sizing:border-box;';
    frame.innerHTML = buildResumePdfHtml(createdResume);
    const root = frame.firstElementChild;
    if (root) {
      root.style.width = '100%';
      root.style.maxWidth = '794px';
      root.style.margin = '0 auto';
      root.style.boxSizing = 'border-box';
    }

    document.body.appendChild(backdrop);
    document.body.appendChild(frame);

    const opt = {
      margin: [12, 12, 12, 12],
      filename: `${safeName}_Resume.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollY: 0,
        scrollX: 0
      },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4', compress: true },
      pagebreak: { mode: ['css', 'legacy'] }
    };

    const cleanup = () => {
      try {
        document.body.removeChild(frame);
      } catch (e) {}
      try {
        document.body.removeChild(backdrop);
      } catch (e) {}
    };

    const run = () => {
      if (!root) {
        cleanup();
        notify('Could not build resume for PDF.', 'error');
        return;
      }
      const worker = window.html2pdf().set(opt).from(root).save();
      const finish = () => cleanup();
      if (worker && typeof worker.then === 'function') {
        worker.then(finish).catch((err) => {
          console.error('PDF export failed', err);
          finish();
          notify('Could not generate PDF. Try again or use Print to PDF from your browser.', 'error');
        });
      } else {
        window.setTimeout(finish, 2500);
      }
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
  };

  const handleScan = async () => {
    if (!resumeText.trim()) {
      notify('Please paste your resume text', 'error');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/scan-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Email': candidateAuth, 'X-User-Type': 'candidate' },
        body: JSON.stringify({ resume_text: resumeText })
      });
      const data = await response.json();
      setAtScore(data.score);
      setFeedback(data.feedback);
    } catch (error) {
      console.error('Error:', error);
      notify('Failed to scan resume', 'error');
    }
    setLoading(false);
  };

  return (
    <section className="min-h-screen pt-32 pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-slate-800 mb-8">Candidate Dashboard</h2>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8 border-b border-slate-700 flex-wrap">
          <button
            onClick={() => setCandidateTab('create-resume')}
            className={`px-6 py-3 font-semibold transition-colors ${
              candidateTab === 'create-resume'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <i className="fas fa-file-alt mr-2"></i>Create Resume
          </button>
          <button
            onClick={() => setCandidateTab('upload-resume')}
            className={`px-6 py-3 font-semibold transition-colors ${
              candidateTab === 'upload-resume'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <i className="fas fa-upload mr-2"></i>Upload Resume
          </button>
          <button
            onClick={() => setCandidateTab('search-jobs')}
            className={`px-6 py-3 font-semibold transition-colors ${
              candidateTab === 'search-jobs'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <i className="fas fa-briefcase mr-2"></i>Search Jobs
          </button>
          <button
            onClick={() => setCandidateTab('profile')}
            className={`px-6 py-3 font-semibold transition-colors ${
              candidateTab === 'profile'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <i className="fas fa-user mr-2"></i>Profile
          </button>
        </div>

        {/* Create Resume Tab */}
        {candidateTab === 'create-resume' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form Section */}
            <div className="glass-card rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-slate-800 mb-6">Build Your Resume</h3>
              <form onSubmit={handleCreateResume} className="space-y-4">
                <input type="text" name="name" placeholder="Full Name *" value={resumeForm.name} onChange={handleResumeFormChange} className="w-full px-4 py-2 glass-input text-slate-800 rounded-lg" required />
                <input type="email" name="email" placeholder="Email *" value={resumeForm.email} onChange={handleResumeFormChange} className="w-full px-4 py-2 bg-slate-100 text-slate-800 rounded border border-slate-300 focus:border-indigo-500" disabled />
                <input type="tel" name="phone" placeholder="Phone Number *" value={resumeForm.phone} onChange={handleResumeFormChange} className="w-full px-4 py-2 glass-input text-slate-800 rounded-lg" required />
                <input type="text" name="address" placeholder="Address *" value={resumeForm.address} onChange={handleResumeFormChange} className="w-full px-4 py-2 glass-input text-slate-800 rounded-lg" required />
                <textarea name="careerObjective" placeholder="Career Objective" value={resumeForm.careerObjective} onChange={handleResumeFormChange} className="w-full px-4 py-2 glass-input text-slate-800 rounded-lg h-24"></textarea>
                <textarea name="skills" placeholder="Skills (comma separated)" value={resumeForm.skills} onChange={handleResumeFormChange} className="w-full px-4 py-2 glass-input text-slate-800 rounded-lg h-20"></textarea>
                <textarea name="experience" placeholder="Experience" value={resumeForm.experience} onChange={handleResumeFormChange} className="w-full px-4 py-2 glass-input text-slate-800 rounded-lg h-24"></textarea>
                <textarea name="qualification" placeholder="Qualifications/Education" value={resumeForm.qualification} onChange={handleResumeFormChange} className="w-full px-4 py-2 glass-input text-slate-800 rounded-lg h-20"></textarea>
                <textarea name="interests" placeholder="Interests" value={resumeForm.interests} onChange={handleResumeFormChange} className="w-full px-4 py-2 glass-input text-slate-800 rounded-lg h-20"></textarea>
                <button type="submit" className="w-full btn-primary py-3 rounded-xl font-semibold">Create Resume</button>
              </form>
              <div className="mt-4">
                <h4 className="text-slate-800 font-semibold mb-2">Suggested phrases</h4>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Implemented X using Y resulting in Z%',
                    'Led cross-functional team to deliver project on time',
                    'Optimized performance reducing load time by 30%',
                    'Integrated CI/CD pipeline to automate deployments',
                    'Collaborated with stakeholders to refine requirements'
                  ].map((p, i) => (
                    <button key={i} type="button" onClick={() => setResumeForm(prev => ({ ...prev, experience: (prev.experience ? prev.experience + '\n' : '') + p }))} className="px-3 py-1 bg-slate-100 text-slate-800 rounded border border-slate-300 hover:bg-slate-200">
                      + {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview Section */}
            {createdResume && (
              <div className="glass-card rounded-2xl p-8">
                <h3 className="text-2xl font-bold text-slate-800 mb-6">Resume Preview</h3>
                <div className="glass-card text-slate-800 p-8 rounded-2xl max-h-[600px] overflow-y-auto">
                  <div
                    id="resume-builder-export"
                    className="bg-white text-black"
                    style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
                  >
                    <div className="text-center mb-4">
                      <h1 className="text-2xl font-bold">{createdResume.name}</h1>
                      <p className="text-sm">{createdResume.email} | {createdResume.phone}</p>
                      <p className="text-sm">{createdResume.address}</p>
                    </div>
                    {createdResume.careerObjective && (
                      <div className="mb-4">
                        <h2 className="text-lg font-bold border-b">CAREER OBJECTIVE</h2>
                        <p className="text-sm mt-2 whitespace-pre-wrap">{createdResume.careerObjective}</p>
                      </div>
                    )}
                    {createdResume.skills && (
                      <div className="mb-4">
                        <h2 className="text-lg font-bold border-b">SKILLS</h2>
                        <p className="text-sm mt-2 whitespace-pre-wrap">{createdResume.skills}</p>
                      </div>
                    )}
                    {createdResume.experience && (
                      <div className="mb-4">
                        <h2 className="text-lg font-bold border-b">EXPERIENCE</h2>
                        <p className="text-sm mt-2 whitespace-pre-wrap">{createdResume.experience}</p>
                      </div>
                    )}
                    {createdResume.qualification && (
                      <div className="mb-4">
                        <h2 className="text-lg font-bold border-b">QUALIFICATIONS</h2>
                        <p className="text-sm mt-2 whitespace-pre-wrap">{createdResume.qualification}</p>
                      </div>
                    )}
                    {createdResume.interests && (
                      <div className="mb-4">
                        <h2 className="text-lg font-bold border-b">INTERESTS</h2>
                        <p className="text-sm mt-2 whitespace-pre-wrap">{createdResume.interests}</p>
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={downloadPDF} className="w-full mt-4 btn-emerald py-2 rounded-xl font-semibold">
                  <i className="fas fa-download mr-2"></i>Download Resume
                </button>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
                    <h4 className="text-slate-800 font-semibold mb-2">ATS Score</h4>
                    <p className="text-3xl font-bold text-indigo-700">{createdScore != null ? `${createdScore}%` : '—'}</p>
                    <button type="button" onClick={() => refreshCreatedResumeATS(createdResume)} className="mt-3 px-3 py-2 btn-primary rounded-lg text-sm">Recalculate</button>
                  </div>
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
                    <h4 className="text-slate-800 font-semibold mb-2">Suggestions</h4>
                    <ul className="text-slate-700 text-sm space-y-1">
                      {(createdSuggestions || []).map((s, i) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Resume Tab */}
        {candidateTab === 'upload-resume' && (
          <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl shadow-slate-900/30">
            <h3 className="text-2xl font-bold text-white mb-6">Upload & Analyze Resume</h3>
            <div className="mb-6">
              <label className="block text-white font-semibold mb-3">Upload PDF Resume</label>
              <input
                type="file"
                accept=".pdf"
                onChange={handleUploadResume}
                className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm text-white rounded-xl border-2 border-white/20 border-dashed hover:border-indigo-400/60 hover:bg-white/15 transition-all duration-300"
              />
            </div>
            {uploadAnalysis && (
              <div className="space-y-6">
                <div className="p-6 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <h4 className="text-xl font-bold text-slate-800 mb-2">ATS Score</h4>
                  <p className="text-3xl font-bold text-indigo-700">{uploadAnalysis.atsScore}%</p>
                  <p className="text-slate-600 mt-2">Status: {uploadAnalysis.friendlyness}</p>
                </div>
                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <h4 className="text-xl font-bold text-slate-800 mb-4">Improvement Suggestions</h4>
                  <ul className="space-y-2">
                    {uploadAnalysis.suggestions.map((suggestion, idx) => (
                      <li key={idx} className="text-slate-700 flex items-start">
                        <i className="fas fa-check-circle text-emerald-400 mr-3 mt-1"></i>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {loading && <p className="text-slate-600">Analyzing resume...</p>}
          </div>
        )}

        {/* Search Jobs Tab */}
        {candidateTab === 'search-jobs' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Jobs List */}
            <div className="lg:col-span-1 space-y-4">
              <h3 className="text-2xl font-bold text-slate-800 mb-4">Available Jobs</h3>
              {availableJobs.map(job => (
                <div
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedJob?.id === job.id
                      ? 'bg-indigo-50 border-indigo-200'
                      : 'bg-white border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <h4 className="font-bold text-slate-800">{job.position}</h4>
                  <p className="text-slate-600 text-sm">{job.location} • {job.mode}{job.experience ? ` • ${job.experience}` : ''}{job.salary_range ? ` • ${job.salary_range}` : ''}</p>
                  {myApps.find(a => a.job_id === job.id) && (
                    <p className="text-emerald-700 text-sm mt-2"><i className="fas fa-check-circle mr-1"></i>Applied</p>
                  )}
                </div>
              ))}
            </div>

            {/* Job Details */}
            <div className="lg:col-span-2">
              {selectedJob ? (
                <div className="glass-card rounded-2xl p-8">
                  <h3 className="text-3xl font-bold text-slate-800 mb-2">{selectedJob.position}</h3>
                  <p className="text-indigo-700 text-lg mb-4">{selectedJob.location} • {selectedJob.mode}</p>
                  <div className="mb-6 p-4 rounded-lg border border-indigo-200 bg-indigo-50">
                    <div className="flex flex-wrap gap-4 items-center">
                      <div className="text-slate-800 font-semibold">Your Match:</div>
                      <div className="text-2xl font-bold text-indigo-700">
                        {serverPreview ? `${Number(serverPreview.score).toFixed(0)}%` : (isNaN(previewMatch) ? '—' : `${previewMatch}%`)}
                      </div>
                      {serverPreview
                        ? <div className="text-slate-600 text-sm">Matched: {serverPreview.matched.join(', ') || '-' } • Missing: {serverPreview.missing.join(', ') || '-'}</div>
                        : (previewResumeText
                          ? <div className="text-slate-600 text-sm">Matched: {previewMM.matched.join(', ') || '-' } • Missing: {previewMM.missing.join(', ') || '-'}</div>
                          : <div className="text-slate-600 text-sm">Add or paste your resume to preview match</div>)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <p className="text-slate-600">Location</p>
                      <p className="text-slate-800 font-semibold">{selectedJob.location}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Openings</p>
                      <p className="text-slate-800 font-semibold">{selectedJob.openings}</p>
                    </div>
                    {selectedJob.experience && (
                      <div>
                        <p className="text-slate-600">Experience</p>
                        <p className="text-slate-800 font-semibold">{selectedJob.experience}</p>
                      </div>
                    )}
                    {selectedJob.salary_range && (
                      <div>
                        <p className="text-slate-600">Salary range</p>
                        <p className="text-slate-800 font-semibold">{selectedJob.salary_range}</p>
                      </div>
                    )}
                  </div>
                  <div className="mb-6">
                    <h4 className="text-lg font-bold text-slate-800 mb-3">Required Skills</h4>
                    <div className="flex flex-wrap gap-2">
                      {(selectedJob.skills || '').split(',').filter(s=>s.trim()).map((skill, idx) => (
                        <span key={idx} className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm border border-indigo-200">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mb-6">
                    <h4 className="text-lg font-bold text-slate-800 mb-3">Job Details</h4>
                    <p className="text-slate-700">{selectedJob.details}</p>
                  </div>
                  <div className="mb-6">
                    <label className="block text-slate-700 font-semibold mb-2">Attach PDF resume (optional)</label>
                    <input type="file" accept=".pdf" onChange={(e)=>setApplyFile(e.target.files?.[0] || null)} className="w-full px-4 py-3 bg-white/50 backdrop-blur-sm text-slate-800 rounded-xl border-2 border-indigo-200 border-dashed hover:border-indigo-400 hover:bg-indigo-50/50 transition-all duration-300" />
                    <p className="text-slate-600 text-xs mt-1">If provided, the application links this file and uses it for match score.</p>
                  </div>
                  <button
                    onClick={() => handleApplyJob(selectedJob.id)}
                    disabled={Boolean(myApps.find(a => a.job_id === selectedJob.id))}
                    className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                      myApps.find(a => a.job_id === selectedJob.id)
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'btn-emerald'
                    }`}
                  >
                    {myApps.find(a => a.job_id === selectedJob.id) ? '✓ Applied' : 'Apply Now'}
                  </button>
                </div>
              ) : (
                <div className="glass-card rounded-2xl p-8 flex items-center justify-center h-96">
                  <p className="text-slate-600">Select a job to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
        {candidateTab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-4">
              <div className="p-6 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl shadow-slate-900/20">
                <h3 className="text-xl font-bold text-white mb-2">Profile</h3>
                <p className="text-slate-300 text-sm">Name</p>
                <p className="text-white">{candidateDisplayName || 'Unknown'}</p>
                <p className="text-slate-300 text-sm mt-3">Email</p>
                <p className="text-white">{candidateAuth}</p>
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="p-6 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl shadow-slate-900/20">
                <h3 className="text-xl font-bold text-white mb-4">My Applications</h3>
                {myApps.length === 0 ? (
                  <p className="text-slate-400">No applications yet.</p>
                ) : (
                  <div className="space-y-3">
                    {myApps.map((a) => {
                      const st = (a.recruiter_status || a.status || 'applied').toLowerCase();
                      const label =
                        st === 'selected' ? 'Selected' :
                        st === 'rejected' ? 'Rejected' :
                        st === 'in_progress' ? 'In progress' :
                        st === 'applied' ? 'Applied' :
                        st.replace(/_/g, ' ');
                      const badge =
                        st === 'selected' ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40' :
                        st === 'rejected' ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40' :
                        st === 'in_progress' ? 'bg-amber-600/30 text-amber-200 border border-amber-500/40' :
                        st === 'applied' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' :
                        'bg-slate-600/30 text-slate-300 border border-slate-500/40';
                      return (
                        <div key={a.id} className="p-4 rounded-xl border bg-white/10 backdrop-blur-sm border-white/15 hover:bg-white/15 transition-colors duration-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <p className="text-white font-semibold">{a.position}</p>
                            <p className="text-slate-400 text-sm">{a.location} • {a.mode}</p>
                            <p className="text-slate-500 text-xs mt-1">Applied {a.created_at ? new Date(a.created_at).toLocaleString() : ''}</p>
                          </div>
                          <div className="flex flex-col items-start sm:items-end gap-1">
                            <span className="text-slate-500 text-xs uppercase tracking-wide">Recruiter status</span>
                            <span className={`px-3 py-1 rounded-md text-sm font-medium ${badge}`}>{label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const RecruiterSuite = ({ recruiterAuth, setActiveTab }) => {
  if (!recruiterAuth) {
    return (
      <section className="min-h-screen pt-32 pb-20 px-4 flex items-center justify-center relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-indigo-300/30 rounded-full blur-3xl animate-blob"></div>
        <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-pink-300/30 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-slate-800 mb-4">Please login to continue</h2>
          <button 
            onClick={() => setActiveTab('auth')}
            className="btn-emerald px-8 py-3 rounded-xl font-semibold"
          >
            Go to Login
          </button>
        </div>
      </section>
    );
  }

  const [recruiterTab, setRecruiterTab] = useState('post-job');
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [postForm, setPostForm] = useState({ company: '', position: '', location: '', mode: 'online', details: '', skills: '', openings: 1, close_date: '', experience: '', salary_range: '' });
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [appliedResumes, setAppliedResumes] = useState([]);
  const [uploadAnalytics, setUploadAnalytics] = useState({ required_skills: [], common_skills: [], unique_skills: [], other_skills: [], per_resume: [] });
  const [dashboardData, setDashboardData] = useState(null);
  // applicants functionality intentionally removed; no separate tab
  const [attachForAppId, setAttachForAppId] = useState(null);
  const [attachResumeId, setAttachResumeId] = useState(null);
  const loadJobs = async () => {
    if (!recruiterAuth) return;
    try {
      const res = await authFetch('/api/jobs?for=recruiter', { headers: { 'X-User-Email': recruiterAuth, 'X-User-Type': 'recruiter' } });
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs);
        setSelectedJobId((prev) => {
          if (!data.jobs.length) return null;
          if (prev && data.jobs.some((j) => j.id === prev)) return prev;
          return data.jobs[0].id;
        });
      }
    } catch (e) {}
  };
  useEffect(() => { loadJobs(); }, [recruiterAuth]);
  const handlePostJob = async (e) => {
    e.preventDefault();
    if (!postForm.position || !postForm.location || !postForm.mode) return;
    setLoading(true);
    try {
      const res = await authFetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Email': recruiterAuth, 'X-User-Type': 'recruiter' }, body: JSON.stringify(postForm) });
      const data = await res.json();
      if (data.success) {
        await loadJobs();
        notify('Job posted', 'success');
        setRecruiterTab('upload-resumes');
        setSelectedJobId(data.job.id);
        setPostForm({ company: '', position: '', location: '', mode: 'online', details: '', skills: '', openings: 1, close_date: '', experience: '', salary_range: '' });
      } else {
        notify(data.error || 'Failed to post job', 'error');
      }
    } catch (e) {
      notify('Failed to post job', 'error');
    }
    setLoading(false);
  };
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selectedJobId) return;
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    setLoading(true);
    try {
      const res = await authFetch(`/api/jobs/${selectedJobId}/resumes`, { method: 'POST', headers: { 'X-User-Email': recruiterAuth, 'X-User-Type': 'recruiter' }, body: fd });
      const data = await res.json();
      if (data.success) setResumes(data.resumes);
      else notify(data.error || 'Upload failed', 'error');
    } catch (e) {
      notify('Upload failed', 'error');
    }
    setLoading(false);
  };
  const refreshResumes = async () => {
    if (!selectedJobId || !recruiterAuth) return;
    try {
      const res = await authFetch(`/api/jobs/${selectedJobId}/resumes`, { headers: { 'X-User-Email': recruiterAuth, 'X-User-Type': 'recruiter' } });
      const data = await res.json();
      if (data.success) setResumes(data.resumes);
    } catch (e) {}
  };
  const loadAppliedResumes = async () => {
    if (!selectedJobId || !recruiterAuth) return;
    try {
      const res = await authFetch(`/api/jobs/${selectedJobId}/applied-resumes`, { headers: { 'X-User-Email': recruiterAuth, 'X-User-Type': 'recruiter' } });
      const data = await res.json();
      if (data.success) setAppliedResumes(data.applied_resumes || []);
    } catch (e) {}
  };
  useEffect(() => { if (recruiterTab === 'upload-resumes') refreshResumes(); }, [recruiterTab, selectedJobId]);
  useEffect(() => { if (recruiterTab === 'upload-resumes') loadAppliedResumes(); }, [recruiterTab, selectedJobId, resumes.length]);
  const loadUploadAnalytics = async () => {
    if (!selectedJobId || !recruiterAuth) return;
    try {
      const r = await authFetch(`/api/jobs/${selectedJobId}/upload-analytics`, { headers: { 'X-User-Email': recruiterAuth, 'X-User-Type': 'recruiter' } });
      const d = await r.json();
      if (d.success) setUploadAnalytics({ required_skills: d.required_skills || [], common_skills: d.common_skills, unique_skills: d.unique_skills, other_skills: d.other_skills || [], per_resume: d.per_resume || [] });
    } catch (e) {}
  };
  useEffect(() => { if (recruiterTab === 'upload-resumes') loadUploadAnalytics(); }, [recruiterTab, selectedJobId, resumes.length]);
  const updateStatus = async (id, status) => {
    try {
      const res = await authFetch(`/api/resumes/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Email': recruiterAuth, 'X-User-Type': 'recruiter' }, body: JSON.stringify({ status }) });
      const data = await res.json();
      if (data.success) refreshResumes();
    } catch (e) {}
  };
  const loadDashboard = async () => {
    if (!recruiterAuth) {
      setDashboardData(null);
      return;
    }
    try {
      const res = await authFetch('/api/recruiter/dashboard', { headers: { 'X-User-Email': recruiterAuth, 'X-User-Type': 'recruiter' } });
      const data = await res.json();
      if (data.success) setDashboardData(data);
      else setDashboardData({ jobs: [], selected_candidates: [], counts: [] });
    } catch (e) {
      setDashboardData({ jobs: [], selected_candidates: [], counts: [] });
    }
  };
  useEffect(() => { if (recruiterTab === 'dashboard') loadDashboard(); }, [recruiterTab, recruiterAuth]);
  // applicant-loading effect removed since applicants tab no longer exists
  
  const updateAppStatus = async (id, status) => {
    try {
      const res = await authFetch(`/api/applications/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Email': recruiterAuth, 'X-User-Type': 'recruiter' }, body: JSON.stringify({ status }) });
      const data = await res.json();
      if (data.success) {
        // just refresh applied resumes; applicants list is no longer used
        loadAppliedResumes();
      }
    } catch (e) {}
  };
  const attachResume = async (appId) => {
    if (!attachResumeId) return;
    try {
      const res = await authFetch(`/api/applications/${appId}/attach-resume`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Email': recruiterAuth, 'X-User-Type': 'recruiter' }, body: JSON.stringify({ resume_id: attachResumeId }) });
      const data = await res.json();
      if (data.success) {
        setAttachForAppId(null);
        setAttachResumeId(null);
        // no need to reload applicants
      } else {
        notify(data.error || 'Failed to attach resume', 'error');
      }
    } catch (e) {
      notify('Failed to attach resume', 'error');
    }
  };
  return (
    <section className="min-h-screen pt-32 pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-slate-800 mb-8">Recruiter Dashboard</h2>
        <div className="flex gap-2 mb-8 border-b border-slate-200 flex-wrap">
          <button onClick={() => setRecruiterTab('post-job')} className={`px-6 py-3 font-semibold transition-colors ${recruiterTab === 'post-job' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-600 hover:text-slate-800'}`}>Post Job</button>
          <button onClick={() => setRecruiterTab('upload-resumes')} className={`px-6 py-3 font-semibold transition-colors ${recruiterTab === 'upload-resumes' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-600 hover:text-slate-800'}`}>Upload Resumes</button>
          <button onClick={() => setRecruiterTab('dashboard')} className={`px-6 py-3 font-semibold transition-colors ${recruiterTab === 'dashboard' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-600 hover:text-slate-800'}`}>Past Jobs</button>
        </div>
        {recruiterTab === 'post-job' && (
          <div className="glass-card rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-slate-800 mb-6">Create New Job</h3>
            <form onSubmit={handlePostJob} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className="px-4 py-3 glass-input text-slate-800 rounded-xl" placeholder="Company name" value={postForm.company} onChange={e => setPostForm({...postForm, company: e.target.value})} />
              <input className="px-4 py-3 glass-input text-slate-800 rounded-xl" placeholder="Position name" value={postForm.position} onChange={e => setPostForm({...postForm, position: e.target.value})} required />
              <input className="px-4 py-3 glass-input text-slate-800 rounded-xl" placeholder="Location" value={postForm.location} onChange={e => setPostForm({...postForm, location: e.target.value})} required />
              <select className="px-4 py-3 glass-input text-slate-800 rounded-xl" value={postForm.mode} onChange={e => setPostForm({...postForm, mode: e.target.value})}>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="hybrid">Hybrid</option>
              </select>
              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-1">Experience required</label>
                <select className="w-full px-4 py-3 glass-input text-slate-800 rounded-xl" value={postForm.experience} onChange={e => setPostForm({...postForm, experience: e.target.value})}>
                  <option value="">Not specified</option>
                  <option value="Fresher / Intern">Fresher / Intern</option>
                  <option value="1–2 years">1–2 years</option>
                  <option value="3–5 years">3–5 years</option>
                  <option value="5–10 years">5–10 years</option>
                  <option value="10+ years">10+ years</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-1">Salary range</label>
                <input className="w-full px-4 py-3 glass-input text-slate-800 rounded-xl" placeholder="e.g. $80k – $120k / year, or Negotiable" value={postForm.salary_range} onChange={e => setPostForm({...postForm, salary_range: e.target.value})} />
              </div>
              <input type="number" min="1" className="px-4 py-3 glass-input text-slate-800 rounded-xl" placeholder="Open positions" value={postForm.openings} onChange={e => setPostForm({...postForm, openings: Number(e.target.value)})} />
              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-1">Till date</label>
                <input type="date" className="w-full px-4 py-3 glass-input text-slate-800 rounded-xl" value={postForm.close_date} onChange={e => setPostForm({...postForm, close_date: e.target.value})} />
              </div>
              <textarea className="md:col-span-2 px-4 py-3 glass-input text-slate-800 rounded-xl h-28" placeholder="Job details" value={postForm.details} onChange={e => setPostForm({...postForm, details: e.target.value})} />
              <input className="md:col-span-2 px-4 py-3 glass-input text-slate-800 rounded-xl" placeholder="Skills required (comma separated)" value={postForm.skills} onChange={e => setPostForm({...postForm, skills: e.target.value})} />
              <button type="submit" disabled={loading} className="md:col-span-2 btn-primary py-3 rounded-xl font-semibold disabled:opacity-50">{loading ? 'Posting...' : 'Post Job'}</button>
            </form>
            {jobs.length > 0 && (
              <div className="mt-8">
                <h4 className="text-lg font-semibold text-slate-800 mb-3">Recent Jobs</h4>
                <div className="space-y-2">
                  {jobs.map(job => (
                    <div key={job.id} className="p-4 glass-card rounded-xl">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-slate-800 font-semibold">{job.company ? `${job.company} — ` : ''}{job.position}</p>
                          <p className="text-slate-600 text-sm">{job.location} • {job.mode} • Openings: {job.openings}{job.experience ? ` • Exp: ${job.experience}` : ''}{job.salary_range ? ` • ${job.salary_range}` : ''}{job.close_date ? ` • Closes: ${job.close_date}` : ''}</p>
                        </div>
                        <button onClick={() => { setSelectedJobId(job.id); setRecruiterTab('upload-resumes'); }} className="px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-200">Upload Resumes</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {recruiterTab === 'upload-resumes' && (
          <div className="space-y-6">
            <div className="glass-card rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-slate-800 mb-6">Upload PDF Resumes</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="md:col-span-2">
                  <label className="block text-slate-700 font-semibold mb-2">Select Job</label>
                  <select className="w-full px-4 py-3 glass-input text-slate-800 rounded-xl" value={selectedJobId || ''} onChange={e => setSelectedJobId(Number(e.target.value))}>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.position} • {j.location}</option>)}
                  </select>
                </div>
                <div>
                  <input type="file" accept=".pdf" multiple onChange={handleUpload} className="w-full px-4 py-3 bg-white/50 backdrop-blur-sm text-slate-800 rounded-xl border-2 border-indigo-200 border-dashed hover:border-indigo-400 hover:bg-indigo-50/50 transition-all duration-300" />
                </div>
              </div>
              {loading && <p className="text-slate-600 mt-4">Uploading...</p>}
            </div>
            <div className="glass-card rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Candidates</h3>
              <p className="text-slate-500 text-sm mb-6">Match % = how well each resume matches the job&apos;s required skills.</p>
              {resumes.length === 0 ? (
                <p className="text-slate-600">No resumes uploaded for this job.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead>
                      <tr className="text-slate-700">
                        <th className="p-2">Candidate</th>
                        <th className="p-2">Score %</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumes.map(r => (
                        <tr key={r.id} className="border-t border-slate-200">
                          <td className="p-2 text-slate-800">{r.original_name}</td>
                          <td className="p-2 text-indigo-700 font-medium">{r.score != null && r.score !== '' ? `${Number(r.score)}%` : '—'}</td>
                          <td className="p-2">
                            <span className={`px-2 py-1 rounded text-sm ${r.status === 'selected' ? 'bg-emerald-100 text-emerald-700' : r.status === 'rejected' ? 'bg-rose-100 text-rose-700' : r.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                              {r.status.replace('_',' ')}
                            </span>
                          </td>
                          <td className="p-2 space-x-2">
                            <a className="px-3 py-1 bg-slate-100 text-slate-800 rounded border border-slate-300" href={r.file_url} target="_blank">View PDF</a>
                            <button onClick={() => updateStatus(r.id, 'selected')} className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded border border-emerald-200">Select</button>
                            <button onClick={() => updateStatus(r.id, 'in_progress')} className="px-3 py-1 bg-amber-100 text-amber-800 rounded border border-amber-200">In Progress</button>
                            <button onClick={() => updateStatus(r.id, 'rejected')} className="px-3 py-1 bg-rose-100 text-rose-800 rounded border border-rose-200">Reject</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="glass-card rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Applied Resumes</h3>
              <p className="text-slate-500 text-sm mb-6">Resumes submitted by applicants for this job. ID shows application number.</p>
              {appliedResumes.length === 0 ? (
                <p className="text-slate-600">No applied resumes yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead>
                      <tr className="text-slate-700">
                        <th className="p-2">Applicant</th>
                        <th className="p-2">Email</th>
                        <th className="p-2">App ID</th>
                        <th className="p-2">Resume</th>
                        <th className="p-2">Match %</th>
                        <th className="p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appliedResumes.map(a => (
                        <tr key={a.app_id} className="border-t border-slate-200">
                          <td className="p-2 text-slate-800">{a.name || '—'}</td>
                          <td className="p-2 text-slate-700">{a.email}</td>
                          <td className="p-2 text-slate-700">{a.unique_id}</td>
                          <td className="p-2 text-slate-800">{a.original_name}</td>
                          <td className="p-2 text-indigo-700">{Math.round(a.match_score)}%</td>
                          <td className="p-2 space-x-2">
                            <a className="px-3 py-1 bg-slate-100 text-slate-800 rounded border border-slate-300" href={a.resume_file_url} target="_blank">View PDF</a>
                            <button onClick={() => updateAppStatus(a.app_id, 'selected')} className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded border border-emerald-200">Select</button>
                            <button onClick={() => updateAppStatus(a.app_id, 'in_progress')} className="px-3 py-1 bg-amber-100 text-amber-800 rounded border border-amber-200">In Progress</button>
                            <button onClick={() => updateAppStatus(a.app_id, 'rejected')} className="px-3 py-1 bg-rose-100 text-rose-800 rounded border border-rose-200">Reject</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="glass-card rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-slate-800 mb-6">Analytics (Uploads)</h3>
              {(uploadAnalytics.required_skills?.length === 0 && uploadAnalytics.common_skills?.length === 0 && uploadAnalytics.per_resume?.length === 0) ? (
                <p className="text-slate-600">No data yet.</p>
              ) : (
                <>
                  {uploadAnalytics.required_skills?.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-slate-700 font-semibold mb-2">Job Required Skills</h4>
                      <p className="text-slate-600 flex flex-wrap gap-2">
                        {uploadAnalytics.required_skills.map((skill, i) => (
                          <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-800 rounded-full text-sm">{skill}</span>
                        ))}
                      </p>
                    </div>
                  )}
                  {uploadAnalytics.per_resume?.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-slate-700 font-semibold mb-2">Skills by Candidate</h4>
                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="min-w-full text-left">
                          <thead className="bg-slate-50 text-slate-700">
                            <tr>
                              <th className="p-2">Candidate</th>
                              <th className="p-2">Match %</th>
                              <th className="p-2">Fit Skills (from job)</th>
                              <th className="p-2">Other Skills (from resume)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {uploadAnalytics.per_resume.map((pr, i) => (
                              <tr key={i} className="border-t border-slate-200">
                                <td className="p-2 font-medium text-slate-800">{pr.name}</td>
                                <td className="p-2 text-indigo-700">{pr.score}%</td>
                                <td className="p-2 text-slate-600">{pr.fit_skills?.length ? pr.fit_skills.join(', ') : '—'}</td>
                                <td className="p-2 text-slate-600">{pr.other_skills?.length ? pr.other_skills.join(', ') : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-slate-700 font-semibold mb-2">Skills Chart</h4>
                      <AnalyticsChart jobId={selectedJobId} recruiterEmail={recruiterAuth} />
                    </div>
                    <div>
                      <h4 className="text-slate-700 font-semibold mb-2">Unique Fit Skills</h4>
                      <p className="text-slate-500 text-sm mb-2">Required skills that appear in only one candidate&apos;s resume</p>
                      <table className="min-w-full text-left border border-slate-200">
                        <thead className="bg-slate-50 text-slate-700">
                          <tr><th className="p-2">Skill</th><th className="p-2">Candidate</th></tr>
                        </thead>
                        <tbody>
                          {(uploadAnalytics.unique_skills || []).map((u,i)=>(
                            <tr key={i} className="border-t border-slate-200">
                              <td className="p-2">{u.skill}</td>
                              <td className="p-2">{u.candidate}</td>
                            </tr>
                          ))}
                          {(uploadAnalytics.unique_skills || []).length === 0 && (
                            <tr><td colSpan={2} className="p-2 text-slate-500">None</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-6 mt-6">
                    <div>
                      <h4 className="text-slate-700 font-semibold mb-2">Most Common Required Skills</h4>
                      <p className="text-slate-500 text-sm mb-2">How many uploaded resumes have each job-required skill</p>
                      <table className="min-w-full text-left border border-slate-200">
                        <thead className="bg-slate-50 text-slate-700">
                          <tr><th className="p-2">Skill</th><th className="p-2">Count</th></tr>
                        </thead>
                        <tbody>
                          {(uploadAnalytics.common_skills || []).map((s,i)=>(
                            <tr key={i} className="border-t border-slate-200">
                              <td className="p-2">{s.skill}</td>
                              <td className="p-2">{s.count}</td>
                            </tr>
                          ))}
                          {(uploadAnalytics.common_skills || []).length === 0 && (
                            <tr><td colSpan={2} className="p-2 text-slate-500">None</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h4 className="text-slate-700 font-semibold mb-2">Other Skills from Resumes</h4>
                      <p className="text-slate-500 text-sm mb-2">Tech skills found in resumes (not in job requirements)</p>
                      <table className="min-w-full text-left border border-slate-200">
                        <thead className="bg-slate-50 text-slate-700">
                          <tr><th className="p-2">Skill</th><th className="p-2">Count</th></tr>
                        </thead>
                        <tbody>
                          {(uploadAnalytics.other_skills || []).map((s,i)=>(
                            <tr key={i} className="border-t border-slate-200">
                              <td className="p-2">{s.skill}</td>
                              <td className="p-2">{s.count}</td>
                            </tr>
                          ))}
                          {(uploadAnalytics.other_skills || []).length === 0 && (
                            <tr><td colSpan={2} className="p-2 text-slate-500">None</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {recruiterTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="glass-card rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-slate-800 mb-6">Past Jobs</h3>
              <div className="space-y-3">
                {(dashboardData?.jobs || []).map(j => (
                  <div key={j.id} className="p-4 rounded-xl glass-card">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-slate-800 font-semibold">{j.company ? `${j.company} — ` : ''}{j.position}</p>
                        <p className="text-slate-600 text-sm">{j.location} • {j.mode} • Openings: {j.openings}{j.experience ? ` • Exp: ${j.experience}` : ''}{j.salary_range ? ` • ${j.salary_range}` : ''}{j.close_date ? ` • Closes: ${j.close_date}` : ''}{j.avg_match != null ? ` • Match: ${Number(j.avg_match).toFixed(2)}%` : ''}</p>
                        <p className="text-slate-600 text-sm">Skills: {j.skills || '—'}</p>
                      </div>
                      <div className="space-x-2">
                        <button onClick={() => { setSelectedJobId(j.id); setRecruiterTab('upload-resumes'); }} className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded border border-indigo-200">Manage</button>
                        <button onClick={async () => { if (confirm('Delete this job? This will remove its resumes and applications.')) { await authFetch(`/api/jobs/${j.id}`, { method: 'DELETE', headers: { 'X-User-Email': recruiterAuth, 'X-User-Type': 'recruiter' } }); loadDashboard(); loadJobs(); } }} className="px-3 py-1 bg-rose-100 text-rose-800 rounded border border-rose-200">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-card rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-slate-800 mb-6">Selected Candidates</h3>
              <div className="space-y-3">
                {(dashboardData?.selected_candidates || []).map(s => (
                  <div key={s.resume_id} className="p-4 rounded-xl glass-card">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-slate-800 font-semibold">{s.original_name}</p>
                        <p className="text-slate-600 text-sm">{s.position} • Match: {Number(s.score).toFixed(2)}%</p>
                      </div>
                      <a className="px-3 py-1 bg-slate-100 text-slate-800 rounded border border-slate-300" href={`/api/resumes/${s.resume_id}/file`} target="_blank">View PDF</a>
                    </div>
                  </div>
                ))}
                {dashboardData && (dashboardData.selected_candidates || []).length === 0 && <p className="text-slate-600">No selected candidates yet.</p>}
              </div>
            </div>
          </div>
        )}
 
      </div>
    </section>
  );
};

const Contact = () => {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [contactLoading, setContactLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setContactLoading(true);
    try {
      await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      notify('Message sent!', 'success');
      setFormData({ name: '', email: '', message: '' });
    } catch (error) {
      console.error('Error:', error);
    }
    setContactLoading(false);
  };

  return (
    <section className="min-h-screen pt-32 pb-20 px-4">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-4xl font-bold text-slate-800 mb-8 text-center">Get in Touch</h2>
        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-8 space-y-6">
          <input
            type="text"
            placeholder="Your Name"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            className="w-full p-3 glass-input text-slate-800 rounded-xl"
            required
          />
          <input
            type="email"
            placeholder="Your Email"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            className="w-full p-3 glass-input text-slate-800 rounded-xl"
            required
          />
          <textarea
            placeholder="Your Message"
            value={formData.message}
            onChange={(e) => setFormData({...formData, message: e.target.value})}
            className="w-full h-32 p-3 glass-input text-slate-800 rounded-xl"
            required
          />
          <button
            type="submit"
            disabled={contactLoading}
            className="w-full btn-primary py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            {contactLoading ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      </div>
    </section>
  );
};

const FAQ = () => (
  <section className="py-20 px-4 border-t border-white/50">
    <div className="max-w-5xl mx-auto">
      <h2 className="text-4xl font-bold text-slate-800 mb-8 text-center">Help & FAQs</h2>
      <div className="grid md:grid-cols-2 gap-6">
        {[
          { q: 'How do I improve my resume score?', a: 'Use strong action verbs, add measurable results, and include role-specific keywords. The resume builder provides suggestions you can add with one click.' },
          { q: 'Who can log in?', a: 'Only users who sign up can log in. Credentials are verified securely on the server.' },
          { q: 'How is match score calculated?', a: 'We compare required skills to resume content and filenames, computing a simple percentage score.' },
          { q: 'Can I export my resume?', a: 'Yes. Build your resume and use the Download button to get a PDF.' },
          { q: 'What analytics are available?', a: 'Recruiters can see skill distributions across applicants and uploaded resumes for each job.' },
          { q: 'How do I contact support?', a: 'Use the Contact page to send us a message; entries are saved in our contact queue.' }
        ].map((f, i) => (
          <div key={i} className="p-6 bg-white/50 backdrop-blur-xl border border-white/60 rounded-2xl shadow-lg shadow-rose-100/40">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">{f.q}</h3>
            <p className="text-slate-700">{f.a}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const About = () => {
  const [expanded, setExpanded] = useState(null);
  const cards = [
    {
      key: 'candidates',
      icon: 'fas fa-shield',
      title: 'For Candidates',
      short: 'Build polished resumes, get instant scoring, and apply with confidence.',
      long: 'Candidates can create, upload or scan resumes, receive ATS feedback, and apply directly to jobs. Your profile stays private until you choose to share it.'
    },
    {
      key: 'recruiters',
      icon: 'fas fa-users',
      title: 'For Recruiters',
      short: 'Rank applicants by skills, manage pipelines, and view analytics per job.',
      long: 'Recruiters get a dashboard for posting jobs, uploading resumes, tracking applications, and drilling into skill-match analytics in real time.'
    },
    {
      key: 'human',
      icon: 'fas fa-heart',
      title: 'Human-Centered',
      short: 'We prioritize clarity, fairness, and usability in every interaction.',
      long: 'Behind the AI there are people — candidates and hirers. We design every flow to remove bias, make data transparent, and keep control in users’ hands.'
    }
  ];

  return (
    <section className="min-h-screen pt-32 pb-20 px-4">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-4xl font-bold text-slate-800 mb-8">About SmartHire</h2>
        <div className="space-y-6 text-slate-700">
          <p className="text-lg leading-relaxed">
            SmartHire blends intelligent matching with a delightful, modern experience. We help candidates present their best selves and recruiters make data-driven decisions quickly.
          </p>

          <div className="grid md:grid-cols-3 gap-8 mt-6">
            {cards.map(card => (
              <div
                key={card.key}
                onClick={() => setExpanded(expanded === card.key ? null : card.key)}
                className={`p-6 rounded-2xl border cursor-pointer bg-white/55 backdrop-blur-xl hover:-translate-y-1 transition-all duration-300 ${
                  expanded === card.key ? 'shadow-2xl border-indigo-200 bg-white/75' : 'border-white/60 shadow-lg hover:shadow-xl'
                }`}
              >
                <i className={`${card.icon} text-2xl mb-3 ${
                  card.key === 'candidates' ? 'text-indigo-600' : card.key === 'recruiters' ? 'text-emerald-600' : 'text-rose-600'
                }`}></i>
                <h3 className="text-slate-800 font-semibold mb-2">{card.title}</h3>
                <p className="text-slate-700">{card.short}</p>
                {expanded === card.key && (
                  <p className="mt-3 text-slate-600 text-sm">{card.long}</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-12">
            <h3 className="text-3xl font-bold text-slate-800 mb-4">Why SmartHire?</h3>
            <ul className="list-disc list-inside space-y-2 text-slate-700">
              <li>Interactive walkthroughs guide new users through resume creation or job posting.</li>
              <li>Animations and hover states make it clear what actions are available.</li>
              <li>FAQs expand on click so you can learn more without leaving the page.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

const App = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [candidateAuth, setCandidateAuth] = useState(null);
  const [recruiterAuth, setRecruiterAuth] = useState(null);
  const [candidateName, setCandidateName] = useState('');
  const [recruiterName, setRecruiterName] = useState('');
  const [selectedRole, setSelectedRole] = useState(null);

  const featuresRef = React.useRef(null);
  const scrollToFeatures = () => {
    if (featuresRef.current) {
      featuresRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const restoreSession = async () => {
      if (!window.localStorage.getItem('smarthire_session_token')) return;
      try {
        const response = await authFetch('/api/auth/me');
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error('Session expired');
        if (data.user.user_type === 'candidate') {
          setCandidateAuth(data.user.email);
          setCandidateName(data.user.name || '');
          setActiveTab('candidate');
        } else if (data.user.user_type === 'recruiter') {
          setRecruiterAuth(data.user.email);
          setRecruiterName(data.user.name || '');
          setActiveTab('recruiter');
        }
      } catch (e) {
        window.localStorage.removeItem('smarthire_session_token');
      }
    };
    restoreSession();
  }, []);
  useEffect(() => {
    const handleScroll = () => {
      // Smooth scroll behavior
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  useEffect(() => {
    const load = async () => {
      if (candidateAuth) {
        try {
          const r = await fetch(`/api/users/${encodeURIComponent(candidateAuth)}`);
          const d = await r.json();
          if (d.success) setCandidateName(d.user.name || '');
        } catch (e) {}
      } else {
        setCandidateName('');
      }
      if (recruiterAuth) {
        try {
          const r = await fetch(`/api/users/${encodeURIComponent(recruiterAuth)}`);
          const d = await r.json();
          if (d.success) setRecruiterName(d.user.name || '');
        } catch (e) {}
      } else {
        setRecruiterName('');
      }
    };
    load();
  }, [candidateAuth, recruiterAuth]);

  return (
    <div className="text-slate-800 min-h-screen">
      <ToastHost />
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        candidateAuth={candidateAuth}
        recruiterAuth={recruiterAuth}
        setCandidateAuth={setCandidateAuth}
        setRecruiterAuth={setRecruiterAuth}
        candidateName={candidateName}
        recruiterName={recruiterName}
        setSelectedRole={setSelectedRole}
      />
      
      {activeTab === 'home' && <Hero setActiveTab={setActiveTab} setSelectedRole={setSelectedRole} scrollToFeatures={scrollToFeatures} />}
      {activeTab === 'home' && <div ref={featuresRef}><Features /></div>}
      {activeTab === 'auth' && <AuthPage setCandidateAuth={setCandidateAuth} setRecruiterAuth={setRecruiterAuth} setActiveTab={setActiveTab} selectedRole={selectedRole} setSelectedRole={setSelectedRole} />}
      {activeTab === 'candidate' && <CandidateSuite candidateAuth={candidateAuth} setActiveTab={setActiveTab} />}
      {activeTab === 'recruiter' && <RecruiterSuite recruiterAuth={recruiterAuth} setActiveTab={setActiveTab} />}
      {activeTab === 'contact' && <Contact />}
      {activeTab === 'about' && <><About /><FAQ /></>}
      
      {activeTab === 'home' && (
        <footer className="border-t border-white/50 py-12 px-4">
          <div className="max-w-6xl mx-auto text-center text-slate-600 space-y-4">
            <p>&copy; 2024 SmartHire. Transforming recruitment with AI.</p>
            <div className="flex flex-col md:flex-row justify-center items-center gap-6 text-sm">
              <a href="/privacy" className="hover:underline">Privacy Policy</a>
              <a href="/terms" className="hover:underline">Terms of Service</a>
              <a href="mailto:support@smarthire.ai" className="hover:underline">support@smarthire.ai</a>
            </div>
            <div className="flex justify-center gap-4 text-xl">
              <a href="https://twitter.com/smarthire" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-600 hover:-translate-y-1 transition-all duration-300 inline-block"><i className="fab fa-twitter"></i></a>
              <a href="https://linkedin.com/company/smarthire" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-600 hover:-translate-y-1 transition-all duration-300 inline-block"><i className="fab fa-linkedin"></i></a>
              <a href="https://github.com/smarthire" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-600 hover:-translate-y-1 transition-all duration-300 inline-block"><i className="fab fa-github"></i></a>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};

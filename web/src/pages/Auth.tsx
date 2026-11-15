import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { usePageTitle } from '../components/ui';
import { errorMessage } from '../lib/api';

function useReturnPath(): string {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  // Only same-site paths, never an absolute URL handed in through navigation state.
  return from && from.startsWith('/') && !from.startsWith('//') ? from : '/problems';
}

export function LoginPage() {
  usePageTitle('Sign in');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const returnTo = useReturnPath();
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={returnTo} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier, password);
      toast.success('Welcome back');
      navigate(returnTo, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <h1>Sign in</h1>
      <p className="sub">Pick up where you left off.</p>
      <form className="card card-body" onSubmit={submit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="identifier">Username or email</label>
          <input id="identifier" className="input" autoComplete="username" autoFocus required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !identifier || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="demo-box">
        New here? <Link to="/register" state={{ from: returnTo }}>Create an account</Link>
      </p>
    </div>
  );
}

export function RegisterPage() {
  usePageTitle('Create account');
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const returnTo = useReturnPath();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={returnTo} replace />;

  const usernameOk = /^[A-Za-z0-9_]{3,20}$/.test(username);
  const passwordOk = password.length >= 8;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(username, email, password);
      toast.success('Account created');
      navigate(returnTo, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <h1>Create your account</h1>
      <p className="sub">Solve problems, join contests and track your progress.</p>
      <form className="card card-body" onSubmit={submit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="username">Username</label>
          <input id="username" className="input" autoComplete="username" autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} />
          <span className="hint">3 to 20 letters, digits or underscores. Shown on leaderboards.</span>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="new-password">Password</label>
          <input id="new-password" className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="hint">At least 8 characters.</span>
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !usernameOk || !passwordOk || !email}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="demo-box">
        Already registered? <Link to="/login" state={{ from: returnTo }}>Sign in</Link>
      </p>
    </div>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/apiFetch';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ email, password });
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="pt-safe flex min-h-dvh items-start justify-center px-5 sm:items-center">
      <div className="w-full max-w-[22rem] pt-[14vh] sm:pt-0">
        <p
          className="font-serif text-xl font-medium text-ink"
          style={{ fontVariationSettings: "'opsz' 30" }}
        >
          Notebook
        </p>
        <p className="mt-1 text-sm text-ink-faint">Private. Sign in to continue.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="Email">
            {(id) => (
              <Input
                id={id}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                autoFocus
              />
            )}
          </Field>
          <Field label="Password" error={error}>
            {(id) => (
              <Input
                id={id}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            )}
          </Field>
          <Button type="submit" variant="primary" busy={busy} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}

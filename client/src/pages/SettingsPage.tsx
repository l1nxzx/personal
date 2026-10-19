import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { AuthResponse } from '../../../shared/types';
import { Page, PageHeader } from '../components/shell/PageHeader';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Kbd, Segmented } from '../components/ui/misc';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { usePrefs, useUpdatePrefs } from '../features/me/api';
import { COMMON_CURRENCIES } from '../features/money/money';
import { apiFetch, errorMessage } from '../lib/apiFetch';
import { modKey } from '../lib/hotkeys';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-3 border-t border-line py-7 sm:grid-cols-[13rem_1fr] sm:gap-8">
      <div>
        <h2 className="font-medium text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-faint">{description}</p>}
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const prefs = usePrefs();
  const updatePrefs = useUpdatePrefs();
  const { theme, setTheme } = useTheme();

  return (
    <Page width="default">
      <PageHeader title="Settings" />
      <div className="mt-6">
        <Section title="Profile">
          <ProfileForm />
          <p className="text-sm text-ink-faint">Signed in as {user?.email}</p>
        </Section>

        <Section title="Writing">
          <Setting label="Font for writing">
            <Segmented
              label="Font for writing"
              value={prefs.data?.writingFont ?? 'serif'}
              onChange={(writingFont) => updatePrefs.mutate({ writingFont })}
              options={[
                { value: 'serif', label: 'Serif' },
                { value: 'sans', label: 'Sans' },
              ]}
            />
          </Setting>
          <Setting label="Reflection question on Home">
            <Segmented
              label="Reflection question on Home"
              value={prefs.data?.showPrompts === false ? 'off' : 'on'}
              onChange={(v) => updatePrefs.mutate({ showPrompts: v === 'on' })}
              options={[
                { value: 'on', label: 'Show' },
                { value: 'off', label: 'Hide' },
              ]}
            />
          </Setting>
          <Setting label="On this day, on Home">
            <Segmented
              label="On this day, on Home"
              value={prefs.data?.showOnThisDay === false ? 'off' : 'on'}
              onChange={(v) => updatePrefs.mutate({ showOnThisDay: v === 'on' })}
              options={[
                { value: 'on', label: 'Show' },
                { value: 'off', label: 'Hide' },
              ]}
            />
          </Setting>
        </Section>

        <Section title="Money" description="Totals are shown per currency; nothing is converted.">
          <Setting label="Main currency">
            <select
              value={prefs.data?.baseCurrency ?? 'EUR'}
              onChange={(e) => updatePrefs.mutate({ baseCurrency: e.target.value })}
              aria-label="Main currency"
              className="h-10 rounded border border-line bg-raised px-2 text-sm text-ink sm:h-8"
            >
              {[...new Set([prefs.data?.baseCurrency ?? 'EUR', ...COMMON_CURRENCIES])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Setting>
        </Section>

        <Section title="Appearance" description="Applies to this device.">
          <Setting label="Theme">
            <Segmented
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </Setting>
        </Section>

        <Section title="Password" description="Changing it signs you out everywhere else.">
          <PasswordForm />
        </Section>

        <Section title="Keyboard">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            {[
              ['C', 'Capture'],
              [`${modKey} K  or  /`, 'Search'],
              [`${modKey} ↵`, 'Save a capture'],
              [`${modKey} S`, 'Save now (editor)'],
              [`${modKey} B / ${modKey} I`, 'Bold / italic (editor)'],
              [`${modKey} ⇧ F`, 'Focus mode (editor)'],
              ['Esc', 'Close or leave focus mode'],
            ].map(([k, v]) => (
              <div key={v} className="contents">
                <dt>
                  <Kbd className="!inline-block">{k}</Kbd>
                </dt>
                <dd className="text-ink-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Session">
          <div>
            <Button onClick={() => void logout()}>Sign out</Button>
          </div>
        </Section>
      </div>
    </Page>
  );
}

function ProfileForm() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.displayName ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch<AuthResponse>('/auth/me', {
        method: 'PATCH',
        body: { displayName: name.trim() },
      });
      setUser(res.user);
      toast({ message: 'Saved' });
    } catch (err) {
      toast({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <Field label="Name">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
              autoComplete="name"
            />
          )}
        </Field>
      </div>
      <Button
        type="submit"
        busy={busy}
        disabled={!name.trim() || name.trim() === user?.displayName}
      >
        Save
      </Button>
    </form>
  );
}

function PasswordForm() {
  const { setUser } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    try {
      const res = await apiFetch<AuthResponse>('/auth/password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      setUser(res.user);
      setCurrent('');
      setNext('');
      toast({ message: 'Password changed' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-sm space-y-4">
      <Field label="Current password">
        {(id) => (
          <Input
            id={id}
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        )}
      </Field>
      <Field label="New password" error={error} hint="8 to 72 characters.">
        {(id) => (
          <Input
            id={id}
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
        )}
      </Field>
      <Button type="submit" busy={busy} disabled={!current || !next}>
        Change password
      </Button>
    </form>
  );
}

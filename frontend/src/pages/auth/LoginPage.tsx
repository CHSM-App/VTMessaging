import { type FormEvent, useState } from 'react';
import { useAuth } from '../../app/providers';
import { Button, ErrorBox, Field, Input } from '../../components/ui';
import { errorMessage } from '../../utils/format';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="neu-card w-full max-w-sm p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-xl text-white shadow-[var(--neu-small)]">✉</div>
          <div>
            <h1 className="text-xl">Vengurla Tech</h1>
            <p className="text-sm text-muted">WhatsApp Messaging Platform</p>
          </div>
        </div>
        <ErrorBox error={error} />
        <div className="space-y-5">
          <Field label="Email">
            <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button variant="primary" type="submit" busy={busy} className="w-full">
            Sign in
          </Button>
        </div>
      </form>
    </div>
  );
}

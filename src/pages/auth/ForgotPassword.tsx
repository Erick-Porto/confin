import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { errorMessage } from '@/lib/errors';
import { Button, Field, Input } from '@/components/ui';
import { AuthShell } from './AuthShell';

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const { toast } = useUI();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell subtitle="Vamos recuperar o seu acesso.">
      {sent ? (
        <div className="flex flex-col items-center text-center">
          <span className="text-income">
            <CircleCheck size={36} />
          </span>
          <p className="mt-3 text-sm text-muted">
            Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. Confira também o spam.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="E-mail" hint="Enviaremos um link para você criar uma nova senha.">
            {(id) => (
              <Input
                id={id}
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
              />
            )}
          </Field>
          <Button type="submit" block loading={loading}>
            Enviar link
          </Button>
        </form>
      )}
      <div className="mt-4 flex justify-center">
        <Link to="/entrar" className="flex min-h-11 items-center text-sm font-medium text-brand-700 dark:text-brand-400">
          Voltar para entrar
        </Link>
      </div>
    </AuthShell>
  );
}

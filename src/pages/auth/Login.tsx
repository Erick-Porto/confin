import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { errorMessage } from '@/lib/errors';
import { Button, Field, IconButton, Input } from '@/components/ui';
import { AuthShell } from './AuthShell';

export default function Login() {
  const { signIn } = useAuth();
  const { toast } = useUI();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await signIn(email, password);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
      setLoading(false);
    }
  }

  return (
    <AuthShell subtitle="Suas finanças em família, em um só lugar." showInviteBanner>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="E-mail">
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
            />
          )}
        </Field>
        <Field label="Senha">
          {(id) => (
            <div className="relative">
              <Input
                id={id}
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-12"
              />
              <IconButton
                aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShow((s) => !s)}
                className="absolute right-1 top-1 h-10 w-10"
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </IconButton>
            </div>
          )}
        </Field>
        <Button type="submit" block loading={loading}>
          Entrar
        </Button>
      </form>
      <div className="mt-4 flex flex-col items-center gap-1 text-sm">
        <Link to="/esqueci-senha" className="flex min-h-11 items-center font-medium text-brand-700 dark:text-brand-400">
          Esqueci minha senha
        </Link>
        <Link to="/cadastro" className="flex min-h-11 items-center font-medium text-brand-700 dark:text-brand-400">
          Criar conta
        </Link>
      </div>
    </AuthShell>
  );
}

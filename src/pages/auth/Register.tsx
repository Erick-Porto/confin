import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { errorMessage } from '@/lib/errors';
import { Button, Field, Input } from '@/components/ui';
import { AuthShell } from './AuthShell';

export default function Register() {
  const { signUp } = useAuth();
  const { toast } = useUI();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  const errors = {
    name: name.trim().length < 2 ? 'Informe seu nome.' : '',
    email: !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Informe um e-mail válido.' : '',
    password: password.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : '',
    confirm: confirm !== password ? 'As senhas não conferem.' : '',
  };
  const invalid = Object.values(errors).some(Boolean);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (invalid || loading) return;
    setLoading(true);
    try {
      const { needsConfirmation } = await signUp(email, password, name);
      if (needsConfirmation) {
        setConfirmEmail(email.trim());
      } else {
        navigate('/onboarding');
      }
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setLoading(false);
    }
  }

  if (confirmEmail) {
    return (
      <AuthShell subtitle="Falta pouco!">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-50">
            <Mail size={24} />
          </span>
          <h2 className="mt-3 text-lg font-semibold">Confirme seu e-mail</h2>
          <p className="mt-2 text-sm text-muted">
            Enviamos um link para <strong className="text-fg">{confirmEmail}</strong>. Ao tocar nele, o Confin abre e você já
            pode começar.
          </p>
          <Link to="/entrar" className="mt-4 flex min-h-11 items-center text-sm font-medium text-brand-700 dark:text-brand-400">
            Voltar para entrar
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Crie sua conta para começar." showInviteBanner>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nome" error={submitted ? errors.name : ''}>
          {(id) => (
            <Input id={id} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Erick" />
          )}
        </Field>
        <Field label="E-mail" error={submitted ? errors.email : ''}>
          {(id) => (
            <Input
              id={id}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
            />
          )}
        </Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres." error={submitted ? errors.password : ''}>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Field label="Confirmar senha" error={submitted ? errors.confirm : ''}>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" block loading={loading}>
          Criar conta
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Já tem conta?{' '}
        <Link to="/entrar" className="font-medium text-brand-700 dark:text-brand-400">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}

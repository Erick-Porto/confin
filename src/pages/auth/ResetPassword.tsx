import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { errorMessage } from '@/lib/errors';
import { Button, Field, Input } from '@/components/ui';
import { AuthShell } from './AuthShell';

export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const { toast } = useUI();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordError = password.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : '';
  const confirmError = confirm !== password ? 'As senhas não conferem.' : '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (passwordError || confirmError || loading) return;
    setLoading(true);
    try {
      await updatePassword(password);
      toast('Senha alterada');
      navigate('/', { replace: true });
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
      setLoading(false);
    }
  }

  return (
    <AuthShell subtitle="Escolha uma nova senha.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nova senha" hint="Mínimo de 8 caracteres." error={submitted ? passwordError : ''}>
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
        <Field label="Confirmar nova senha" error={submitted ? confirmError : ''}>
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
          Salvar nova senha
        </Button>
      </form>
    </AuthShell>
  );
}

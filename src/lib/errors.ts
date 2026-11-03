// Traduz erros do Supabase/Postgres para mensagens em português.

const AUTH_MESSAGES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar. Veja sua caixa de entrada.'],
  [/user already registered/i, 'Este e-mail já tem cadastro. Tente entrar.'],
  [/password should be at least/i, 'A senha precisa ter pelo menos 8 caracteres.'],
  [/weak.?password/i, 'Senha fraca. Use letras, números e pelo menos 8 caracteres.'],
  [/rate limit|too many requests|security purposes/i, 'Muitas tentativas. Aguarde um pouco e tente de novo.'],
  [/new password should be different/i, 'A nova senha precisa ser diferente da atual.'],
  [/invalid email/i, 'E-mail inválido.'],
  [/failed to fetch|network/i, 'Sem conexão com o servidor. Verifique a internet.'],
  [/jwt expired|session.*(expired|missing)/i, 'Sua sessão expirou. Entre novamente.'],
];

const DB_MESSAGES: Array<[RegExp, string]> = [
  [/violates foreign key constraint.*transactions/i, 'Existem lançamentos usando este item. Arquive em vez de excluir.'],
  [/violates foreign key constraint/i, 'Este item está em uso e não pode ser excluído.'],
  [/duplicate key/i, 'Já existe um registro igual.'],
  [/row-level security/i, 'Você não tem permissão para fazer isso neste grupo.'],
  [/violates check constraint/i, 'Algum valor informado não é válido.'],
];

/** Mensagem amigável para qualquer erro (Error, PostgrestError, AuthError ou string). */
export function errorMessage(error: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  const raw =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  if (!raw) return fallback;
  for (const [pattern, message] of [...AUTH_MESSAGES, ...DB_MESSAGES]) {
    if (pattern.test(raw)) return message;
  }
  // Mensagens levantadas pelas nossas funções SQL já estão em português.
  if (/[áàâãéêíóôõúç]/i.test(raw) || /^(Convite|Conta|Categoria|Sem permissão|Apenas|O grupo|O titular|Não)/.test(raw)) {
    return raw;
  }
  return fallback;
}

/** Lança o erro do Supabase se houver; útil depois de cada chamada. */
export function throwIfError<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

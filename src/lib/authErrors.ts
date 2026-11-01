// Traduz erros do Supabase Auth no cadastro. Nunca esconder a causa: o que não for conhecido sai com a mensagem original.
export function signUpErrorMessage(error: { code?: string; message: string; status?: number }): string {
  switch (error.code) {
    case 'weak_password':
      return 'A senha precisa ter pelo menos 6 caracteres.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Esse e-mail não parece válido. Confira e tente de novo.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Já existe uma conta com esse e-mail. Use "Entrar".';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Muitas tentativas agora. Espere alguns minutos e tente de novo.';
    case 'email_address_not_authorized':
      return 'Não conseguimos enviar o e-mail de confirmação para esse endereço. Fale com o suporte.';
    case 'signup_disabled':
      return 'Cadastros estão fechados no momento.';
  }
  if (/password/i.test(error.message)) return 'A senha precisa ter pelo menos 6 caracteres.';
  return `Não foi possível criar a conta: ${error.message}`;
}

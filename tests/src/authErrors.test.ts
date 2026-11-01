import { describe, expect, it } from 'vitest';
import { signUpErrorMessage } from '../../src/lib/authErrors';

describe('signUpErrorMessage', () => {
  it('explica e-mail não autorizado pelo SMTP padrão do Supabase', () => {
    expect(signUpErrorMessage({ code: 'email_address_not_authorized', message: 'Email address "x@gmail.com" cannot be used as it is not authorized' }))
      .toMatch(/e-mail de confirmação/);
  });

  it('explica limite de envio de e-mail', () => {
    expect(signUpErrorMessage({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' })).toMatch(/Espere/);
  });

  it('não esconde erro desconhecido', () => {
    expect(signUpErrorMessage({ code: 'unexpected_failure', message: 'Database error saving new user' }))
      .toContain('Database error saving new user');
  });
});

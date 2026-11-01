import type { ApiErrorCode } from '../../shared/types';

export type ClientErrorCode = ApiErrorCode | 'mic_denied';

export class ApiClientError extends Error {
  constructor(public status: number, public code: ApiErrorCode) {
    super(code);
  }
}

const MESSAGES: Record<ClientErrorCode, string> = {
  unauthorized: 'Sua sessão expirou. Entre de novo.',
  forbidden: 'Você não tem acesso a esse arquivo ou entrevista.',
  not_found: 'Não encontramos essa entrevista.',
  bad_request: 'Algo nos dados enviados não está certo. Confira e tente de novo.',
  quota_exhausted: 'Você já usou suas 3 entrevistas grátis.',
  too_many_unfinished: 'Você começou entrevistas demais sem terminar nas últimas 24 horas. Tente de novo mais tarde.',
  interview_not_active: 'Essa entrevista já foi encerrada.',
  time_over: 'O tempo da entrevista acabou.',
  resume_unreadable: 'Não conseguimos ler o texto do seu currículo. Envie um PDF com texto selecionável (não escaneado).',
  job_unreadable: 'Não conseguimos ler o texto desse PDF da vaga. Envie um print ou cole o texto.',
  not_tech_role: 'Por enquanto o HireGringo só funciona para vagas de tecnologia.',
  url_unreadable: 'Não conseguimos abrir esse link. Cole o texto da vaga.',
  evaluation_failed: 'Não conseguimos gerar seu resultado agora. Tente de novo em instantes.',
  upstream_failed: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
  mic_denied: 'Precisamos do seu microfone para a entrevista. Libere o acesso no navegador e tente de novo.',
};

export function errorMessage(code: ClientErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.upstream_failed;
}

export function messageFor(e: unknown): string {
  return errorMessage(e instanceof ApiClientError ? e.code : 'upstream_failed');
}

export function createApi(getToken: () => Promise<string | null>, fetchFn: typeof fetch = (...a) => fetch(...a)) {
  async function request(path: string, body: unknown): Promise<Response> {
    const token = await getToken();
    if (!token) throw new ApiClientError(401, 'unauthorized');
    const res = await fetchFn(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let code: ApiErrorCode = 'upstream_failed';
      try {
        code = ((await res.json()) as { error?: ApiErrorCode }).error ?? code;
      } catch { /* resposta sem JSON */ }
      throw new ApiClientError(res.status, code);
    }
    return res;
  }

  return {
    async post<T>(path: string, body: unknown): Promise<T> {
      const res = await request(path, body);
      return (res.status === 204 ? undefined : await res.json()) as T;
    },
    /** Para respostas em streaming (NDJSON do turno). */
    stream: request,
  };
}

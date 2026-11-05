import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <article className="mx-auto max-w-2xl space-y-4 text-slate-700">
        <Link to="/entrar" className="text-2xl font-bold tracking-tight text-slate-900">Hire<span className="text-emerald-600">Gringo</span></Link>
        <h1 className="text-xl font-semibold text-slate-900">Política de Privacidade</h1>
        <p className="text-sm text-slate-500">Atualizada em 4 de novembro de 2026.</p>

        <h2 className="pt-2 font-semibold text-slate-900">O que coletamos</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Seu e-mail, para criar e acessar a conta (por e-mail e senha ou pelo Google, de onde recebemos só nome e e-mail).</li>
          <li>O currículo e a descrição da vaga que você envia.</li>
          <li>A transcrição em texto da entrevista simulada e a avaliação gerada.</li>
          <li>A nota e o comentário que você deixar sobre o app, se quiser avaliar, para melhorarmos o produto.</li>
        </ul>
        <p>O áudio da sua voz é transcrito em tempo real e <strong>não é gravado</strong>.</p>

        <h2 className="pt-2 font-semibold text-slate-900">Para que usamos</h2>
        <p>Só para conduzir a entrevista simulada, gerar sua avaliação e, se você avaliar o app, melhorar o produto. Não vendemos seus dados nem os usamos para publicidade.</p>

        <h2 className="pt-2 font-semibold text-slate-900">Com quem compartilhamos</h2>
        <p>
          Com os serviços que fazem o app funcionar: hospedagem e banco de dados (Vercel e Supabase), transcrição e voz (Deepgram)
          e o provedor de IA que conduz a entrevista e escreve a avaliação. Eles recebem só o necessário para cada etapa.
        </p>

        <h2 className="pt-2 font-semibold text-slate-900">Seus direitos (LGPD)</h2>
        <p>
          Você pode apagar uma entrevista do histórico ou apagar sua conta com todos os dados, incluindo os arquivos enviados,
          a qualquer momento na página <strong>Conta</strong>, depois de entrar.
        </p>
      </article>
    </div>
  );
}

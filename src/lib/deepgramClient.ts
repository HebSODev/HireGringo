import { DEEPGRAM_STT_MODEL } from '../../shared/constants';
import type { DgWord } from '../../shared/types';

export type DeepgramHandlers = {
  onFinal(words: DgWord[]): void;
  onInterim(transcript: string): void;
  onUtteranceEnd(): void;
  onClose(unexpected: boolean): void;
};

export type DeepgramConnection = {
  ready: Promise<void>;
  send(chunk: Blob): void;
  keepAlive(): void;
  finalize(): void;
  close(): void;
};

/** Transcrição ao vivo direto do navegador, com o token temporário emitido pelo backend. */
export function connectDeepgram(token: string, keyterms: string[], handlers: DeepgramHandlers): DeepgramConnection {
  const params = new URLSearchParams({
    model: DEEPGRAM_STT_MODEL, language: 'en', smart_format: 'true', filler_words: 'true',
    interim_results: 'true', utterance_end_ms: '2000', vad_events: 'true',
  });
  for (const term of keyterms.slice(0, 20)) params.append('keyterm', term);
  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ['bearer', token]);
  let closing = false;

  const ready = new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('deepgram')), { once: true });
  });

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.type === 'Results') {
      const alt = msg.channel?.alternatives?.[0];
      if (!alt) return;
      if (msg.is_final) { if (alt.words?.length) handlers.onFinal(alt.words); }
      else if (alt.transcript) handlers.onInterim(alt.transcript);
    } else if (msg.type === 'UtteranceEnd') {
      handlers.onUtteranceEnd();
    }
  });
  ws.addEventListener('close', () => handlers.onClose(!closing));

  const sendJson = (o: object) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };
  return {
    ready,
    send: (chunk) => { if (ws.readyState === WebSocket.OPEN && chunk.size) ws.send(chunk); },
    keepAlive: () => sendJson({ type: 'KeepAlive' }),
    finalize: () => sendJson({ type: 'Finalize' }),
    close: () => { closing = true; sendJson({ type: 'CloseStream' }); ws.close(); },
  };
}

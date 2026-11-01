import { TTS_SAMPLE_RATE } from '../shared/constants';
import type { Tts } from './deps';

/** Deepgram Aura em PCM 16-bit LE mono, repassando os chunks conforme chegam. */
export function deepgramTts(opts: { apiKey: string; model: string }): Tts {
  return {
    async *synthesize(text: string) {
      const url = `https://api.deepgram.com/v1/speak?model=${opts.model}&encoding=linear16&sample_rate=${TTS_SAMPLE_RATE}&container=none`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Token ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || !res.body) throw new Error(`deepgram speak ${res.status}`);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value.byteLength) yield value;
      }
    },
  };
}

const MIN_SENTENCE = 12;

/** Junta deltas do LLM e devolve frases completas assim que ficam prontas, para o TTS começar cedo. */
export function createSentenceChunker() {
  let buf = '';
  return {
    push(delta: string): string[] {
      buf += delta;
      const out: string[] = [];
      let start = 0;
      for (const m of buf.matchAll(/[.!?]+(?=\s)/g)) {
        const end = m.index + m[0].length;
        const sentence = buf.slice(start, end).trim();
        if (sentence.length >= MIN_SENTENCE) {
          out.push(sentence);
          start = end;
        }
      }
      buf = buf.slice(start);
      return out;
    },
    flush(): string[] {
      const rest = buf.trim();
      buf = '';
      return rest ? [rest] : [];
    },
  };
}

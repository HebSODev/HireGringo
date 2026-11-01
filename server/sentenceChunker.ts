const MIN_SENTENCE = 12;

/** Junta deltas do LLM e devolve frases completas assim que ficam prontas, para o TTS começar cedo. */
export function createSentenceChunker() {
  let buf = '';
  return {
    push(delta: string): string[] {
      buf += delta;
      const out: string[] = [];
      let start = 0;
      // Fim de frase: pontuação seguida de maiúscula/dígito (com ou sem espaço — o modelo às vezes cola as
      // frases). Minúscula depois do ponto (Node.js, e.g. vitest) não corta.
      for (const m of buf.matchAll(/[.!?]+(?=\s+["'“(]?[A-Z0-9]|["'“(]?[A-Z])/g)) {
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

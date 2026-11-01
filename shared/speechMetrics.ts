import type { DgWord, TurnMetrics } from './types.js';

export const FILLERS = new Set(['uh', 'um', 'mhmm', 'mm-mm', 'uh-uh', 'uh-huh', 'nuh-uh', 'hmm', 'er', 'ah']);
const LOW_CONFIDENCE = 0.6;
const LONG_PAUSE_SEC = 1.5;

const round1 = (n: number) => Math.round(n * 10) / 10;
const clean = (w: DgWord) => (w.punctuated_word ?? w.word).replace(/[^\p{L}\p{N}'-]/gu, '');

export function computeTurnMetrics(words: DgWord[], opts: { responseLatencySec: number | null }): TurnMetrics {
  if (words.length === 0) {
    return { wordCount: 0, durationSec: 0, wpm: 0, fillerCount: 0, lowConfidenceWords: [], longPauseCount: 0, responseLatencySec: opts.responseLatencySec, silent: true };
  }
  const isFiller = (w: DgWord) => FILLERS.has(w.word.toLowerCase());
  const spoken = words.filter((w) => !isFiller(w));
  const durationSec = round1(words[words.length - 1].end - words[0].start);
  let longPauseCount = 0;
  for (let i = 1; i < words.length; i++) if (words[i].start - words[i - 1].end > LONG_PAUSE_SEC) longPauseCount++;
  return {
    wordCount: spoken.length,
    durationSec,
    wpm: durationSec > 0 ? round1(spoken.length / (durationSec / 60)) : 0,
    fillerCount: words.length - spoken.length,
    lowConfidenceWords: [...new Set(spoken.filter((w) => w.confidence < LOW_CONFIDENCE).map(clean))],
    longPauseCount,
    responseLatencySec: opts.responseLatencySec,
    silent: false,
  };
}

export type SpeechStats = {
  avgWpm: number;
  fillersPerMinute: number;
  lowConfidenceWords: string[];
  avgResponseLatencySec: number | null;
  silentTurns: number;
  longPauses: number;
};

export function aggregateMetrics(all: TurnMetrics[]): SpeechStats {
  const spoken = all.filter((m) => !m.silent);
  const minutes = spoken.reduce((s, m) => s + m.durationSec, 0) / 60;
  const latencies = all.map((m) => m.responseLatencySec).filter((x): x is number => x !== null);
  const freq = new Map<string, number>();
  for (const m of all) for (const w of m.lowConfidenceWords) freq.set(w, (freq.get(w) ?? 0) + 1);
  return {
    avgWpm: spoken.length ? round1(spoken.reduce((s, m) => s + m.wpm, 0) / spoken.length) : 0,
    fillersPerMinute: minutes > 0 ? round1(all.reduce((s, m) => s + m.fillerCount, 0) / minutes) : 0,
    lowConfidenceWords: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([w]) => w),
    avgResponseLatencySec: latencies.length ? round1(latencies.reduce((s, x) => s + x, 0) / latencies.length) : null,
    silentTurns: all.length - spoken.length,
    longPauses: all.reduce((s, m) => s + m.longPauseCount, 0),
  };
}

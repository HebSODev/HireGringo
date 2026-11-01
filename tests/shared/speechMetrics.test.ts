import { describe, expect, it } from 'vitest';
import { aggregateMetrics, computeTurnMetrics } from '../../shared/speechMetrics';

const w = (word: string, start: number, end: number, confidence: number) => ({ word, start, end, confidence });

describe('computeTurnMetrics', () => {
  it('calcula ritmo, fillers, baixa confiança e pausas', () => {
    const m = computeTurnMetrics(
      [w('i', 0, 0.2, 0.99), w('um', 0.3, 0.5, 0.9), w('worked', 2.5, 2.9, 0.4), w('with', 3.0, 3.2, 0.95), w('react', 3.3, 3.6, 0.97)],
      { responseLatencySec: 1.2 },
    );
    expect(m).toEqual({
      wordCount: 4, durationSec: 3.6, wpm: 66.7, fillerCount: 1, lowConfidenceWords: ['worked'],
      longPauseCount: 1, responseLatencySec: 1.2, silent: false,
    });
  });

  it('turno sem palavras é silencioso', () => {
    expect(computeTurnMetrics([], { responseLatencySec: null })).toMatchObject({ silent: true, wordCount: 0, wpm: 0 });
  });

  it('usa punctuated_word sem pontuação e sem duplicatas', () => {
    const m = computeTurnMetrics(
      [{ ...w('kubernetes', 0, 0.5, 0.3), punctuated_word: 'Kubernetes,' }, { ...w('kubernetes', 0.6, 1, 0.2), punctuated_word: 'Kubernetes.' }],
      { responseLatencySec: null },
    );
    expect(m.lowConfidenceWords).toEqual(['Kubernetes']);
  });
});

describe('aggregateMetrics', () => {
  it('vazio retorna zeros', () => {
    expect(aggregateMetrics([])).toEqual({
      avgWpm: 0, fillersPerMinute: 0, lowConfidenceWords: [], avgResponseLatencySec: null, silentTurns: 0, longPauses: 0,
    });
  });

  it('agrega turnos', () => {
    const base = { lowConfidenceWords: [], longPauseCount: 0, silent: false };
    const out = aggregateMetrics([
      { ...base, wordCount: 100, durationSec: 60, wpm: 100, fillerCount: 3, responseLatencySec: 1, lowConfidenceWords: ['a', 'b'], longPauseCount: 2 },
      { ...base, wordCount: 120, durationSec: 60, wpm: 120, fillerCount: 1, responseLatencySec: 3, lowConfidenceWords: ['a'] },
      { ...base, wordCount: 0, durationSec: 0, wpm: 0, fillerCount: 0, responseLatencySec: null, silent: true },
    ]);
    expect(out).toEqual({
      avgWpm: 110, fillersPerMinute: 2, lowConfidenceWords: ['a', 'b'], avgResponseLatencySec: 2, silentTurns: 1, longPauses: 2,
    });
  });
});

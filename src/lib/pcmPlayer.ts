import { TTS_SAMPLE_RATE } from '../../shared/constants';
import type { PcmPlayer } from './audioQueue';

/** Agenda os trechos de PCM em sequência, sem buracos, num AudioContext. */
export function createPcmPlayer(ctx: AudioContext): PcmPlayer & { stop(): void } {
  let nextTime = 0;
  const sources = new Set<AudioBufferSourceNode>();
  return {
    play(samples) {
      const buffer = ctx.createBuffer(1, samples.length, TTS_SAMPLE_RATE);
      buffer.copyToChannel(new Float32Array(samples), 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const start = Math.max(ctx.currentTime + 0.05, nextTime);
      src.start(start);
      nextTime = start + buffer.duration;
      sources.add(src);
      return new Promise<void>((resolve) => {
        src.onended = () => { sources.delete(src); resolve(); };
      });
    },
    stop() {
      sources.forEach((s) => { try { s.stop(); } catch { /* já parou */ } });
      sources.clear();
      nextTime = 0;
    },
  };
}

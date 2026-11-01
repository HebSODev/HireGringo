export function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** O player agenda o trecho logo depois do anterior e resolve quando ele termina de tocar. */
export type PcmPlayer = { play(samples: Float32Array): Promise<void> };

export function createAudioQueue(player: PcmPlayer) {
  let pending = new Map<number, Float32Array>();
  let nextSeq = 0;
  let inFlight = 0;
  let streamDone = false;
  let idleFired = false;
  let generation = 0;
  let idleCb: () => void = () => {};

  const checkIdle = () => {
    if (streamDone && inFlight === 0 && pending.size === 0 && !idleFired) {
      idleFired = true;
      idleCb();
    }
  };

  const pump = () => {
    while (pending.has(nextSeq)) {
      const samples = pending.get(nextSeq)!;
      pending.delete(nextSeq);
      nextSeq++;
      inFlight++;
      const gen = generation;
      void player.play(samples).catch(() => {}).finally(() => {
        if (gen !== generation) return;
        inFlight--;
        checkIdle();
      });
    }
  };

  return {
    enqueue(seq: number, base64: string) {
      pending.set(seq, pcm16ToFloat32(base64ToBytes(base64)));
      pump();
    },
    markStreamDone() {
      streamDone = true;
      checkIdle();
    },
    onIdle(cb: () => void) {
      idleCb = cb;
    },
    reset() {
      generation++;
      pending = new Map();
      nextSeq = 0;
      inFlight = 0;
      streamDone = false;
      idleFired = false;
    },
  };
}

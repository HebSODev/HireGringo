import { describe, expect, it } from 'vitest';
import { createAudioQueue, pcm16ToFloat32 } from '../../src/lib/audioQueue';

const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');

function fakePlayer() {
  const played: number[][] = [];
  const finish: (() => void)[] = [];
  return {
    played, finish,
    play(samples: Float32Array) {
      played.push([...samples].map((x) => Math.round(x * 32768)));
      return new Promise<void>((r) => finish.push(r));
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('pcm16ToFloat32', () => {
  it('converte PCM 16-bit little-endian para [-1, 1]', () => {
    expect([...pcm16ToFloat32(new Uint8Array([0x00, 0x40, 0x00, 0xc0, 0xff, 0x7f]))]).toEqual([0.5, -0.5, 32767 / 32768]);
  });
});

describe('createAudioQueue', () => {
  it('toca na ordem de seq mesmo se chegar fora de ordem', async () => {
    const p = fakePlayer();
    const q = createAudioQueue(p);
    q.enqueue(1, b64([2, 0]));
    await tick();
    expect(p.played).toEqual([]);
    q.enqueue(0, b64([1, 0]));
    await tick();
    expect(p.played).toEqual([[1], [2]]);
  });

  it('onIdle só dispara depois do fim do stream e do último áudio', async () => {
    const p = fakePlayer();
    const q = createAudioQueue(p);
    let idle = 0;
    q.onIdle(() => idle++);
    q.enqueue(0, b64([1, 0]));
    q.enqueue(1, b64([2, 0]));
    await tick();
    p.finish[0]();
    await tick();
    expect(idle).toBe(0);
    q.markStreamDone();
    await tick();
    expect(idle).toBe(0);
    p.finish[1]();
    await tick();
    expect(idle).toBe(1);
  });

  it('stream sem áudio fica ocioso logo', async () => {
    const q = createAudioQueue(fakePlayer());
    let idle = 0;
    q.onIdle(() => idle++);
    q.markStreamDone();
    await tick();
    expect(idle).toBe(1);
  });

  it('reset prepara para o próximo turno', async () => {
    const p = fakePlayer();
    const q = createAudioQueue(p);
    q.enqueue(0, b64([1, 0]));
    q.reset();
    q.enqueue(0, b64([3, 0]));
    await tick();
    expect(p.played.at(-1)).toEqual([3]);
  });
});

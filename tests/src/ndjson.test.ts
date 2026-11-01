import { expect, it } from 'vitest';
import { readNdjson } from '../../src/lib/ndjson';

function streamOf(chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({ start(c) { chunks.forEach((x) => c.enqueue(enc.encode(x))); c.close(); } });
}

it('lida com linhas partidas entre chunks', async () => {
  const out = [];
  for await (const e of readNdjson(streamOf(['{"type":"te', 'xt","text":"a"}\n{"type":"end"}\n']))) out.push(e);
  expect(out).toEqual([{ type: 'text', text: 'a' }, { type: 'end' }]);
});

it('aceita última linha sem quebra', async () => {
  const out = [];
  for await (const e of readNdjson(streamOf(['{"a":1}\n{"b":2}']))) out.push(e);
  expect(out).toEqual([{ a: 1 }, { b: 2 }]);
});

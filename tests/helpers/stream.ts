export async function readNdjson(res: Response): Promise<any[]> {
  const text = await res.text();
  return text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export async function* fromArray<T>(items: T[]): AsyncIterable<T> {
  for (const i of items) yield i;
}

/** Bytes que o TTS falso devolve: o texto em UTF-8, completado para tamanho par (PCM 16-bit). */
export const pcm = (text: string) => new TextEncoder().encode(text.length % 2 ? `${text} ` : text);
export const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

// As funções da Vercel rodam como ESM puro no Node: import relativo sem extensão quebra em produção
// (ERR_MODULE_NOT_FOUND), mesmo passando no vercel dev e no Vitest.
it('imports relativos do código de servidor têm extensão .js', () => {
  const offenders = ['api', 'server', 'shared'].flatMap(files).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)]
      .map((m) => m[1])
      .filter((spec) => !/\.(js|json)$/.test(spec))
      .map((spec) => `${file}: ${spec}`),
  );
  expect(offenders).toEqual([]);
});

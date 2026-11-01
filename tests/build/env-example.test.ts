import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const SECRET = /KEY|SECRET|TOKEN|PASSWORD/;

// O .env.example é versionado e público: campos secretos têm que ficar vazios.
it('.env.example não tem valor em campo secreto', () => {
  const filled = readFileSync('.env.example', 'utf8')
    .split('\n')
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m && SECRET.test(m[1]) && m[2].trim() !== '')
    .map((m) => m[1]);
  expect(filled).toEqual([]);
});

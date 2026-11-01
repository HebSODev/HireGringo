import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type PromptName = 'interviewer' | 'evaluator' | 'extract-job' | 'extract-resume';

export function renderPrompt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in vars)) throw new Error(`variável de prompt ausente: ${name}`);
    return String(vars[name]);
  });
}

const cache = new Map<PromptName, string>();

export async function loadPrompt(name: PromptName): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  const text = await readFile(path.join(process.cwd(), 'prompts', `${name}.md`), 'utf8');
  cache.set(name, text);
  return text;
}

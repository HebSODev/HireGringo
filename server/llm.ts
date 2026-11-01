import OpenAI from 'openai';
import { ApiError } from './errors';
import type { ChatMessage, Llm } from './deps';

/** Para modelos de raciocínio (gpt-oss), reduz o raciocínio para a 1ª frase sair rápido. */
const reasoning = (model: string) => (model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' as const } : {});

export function openAiCompatibleLlm(opts: { baseURL: string; apiKey: string; model: string; visionModel?: string }): Llm {
  const client = new OpenAI({ baseURL: opts.baseURL, apiKey: opts.apiKey });

  const parse = (content: string | null | undefined): unknown => {
    try {
      return JSON.parse(content ?? '');
    } catch {
      throw new Error('llm devolveu JSON inválido');
    }
  };

  return {
    async *stream(messages: ChatMessage[]) {
      const stream = await client.chat.completions.create({ model: opts.model, stream: true, messages, ...reasoning(opts.model) });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    },
    async json(messages: ChatMessage[]) {
      const res = await client.chat.completions.create({
        model: opts.model, messages, response_format: { type: 'json_object' },
      });
      return parse(res.choices[0]?.message?.content);
    },
    async vision(image, instruction) {
      if (!opts.visionModel) throw new ApiError(422, 'url_unreadable');
      const res = await client.chat.completions.create({
        model: opts.visionModel,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}` } },
          ],
        }],
      });
      return parse(res.choices[0]?.message?.content);
    },
  };
}

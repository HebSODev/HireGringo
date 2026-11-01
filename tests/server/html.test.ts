import { expect, it } from 'vitest';
import { htmlToText } from '../../server/extract/html';

it('remove scripts, estilos e tags e colapsa espaços', () => {
  expect(htmlToText('<style>x</style><p>Senior&nbsp;Go  Dev</p><script>y</script>')).toBe('Senior Go Dev');
});

it('decodifica entidades comuns', () => {
  expect(htmlToText('<li>C&amp;C &lt;3 &#39;APIs&#39; &quot;REST&quot;</li>')).toBe(`C&C <3 'APIs' "REST"`);
});

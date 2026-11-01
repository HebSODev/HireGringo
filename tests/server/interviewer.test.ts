import { describe, expect, it } from 'vitest';
import { buildInterviewerMessages } from '../../server/interviewer';
import { job, makeDeps, resume } from '../helpers/fakes';

const template = 'job={{job}} resume={{resume}} remaining={{remainingSeconds}} phase={{phase}}';

describe('buildInterviewerMessages', () => {
  it('passa tempo restante e fase ao system prompt', () => {
    const interview = makeDeps().repo.seed();
    const [system] = buildInterviewerMessages({ template, interview, turns: [], elapsedSec: 120 });
    expect(system.role).toBe('system');
    expect(system.content).toContain('remaining=180');
    expect(system.content).toContain('phase=technical');
    expect(system.content).toContain(JSON.stringify(job));
    expect(system.content).toContain(JSON.stringify(resume));
  });

  it('abre a chamada quando ainda não há turnos', () => {
    const interview = makeDeps().repo.seed();
    const msgs = buildInterviewerMessages({ template, interview, turns: [], elapsedSec: 0 });
    expect(msgs.slice(1)).toEqual([{ role: 'user', content: '(The call has just connected. Start the interview.)' }]);
  });

  it('mapeia papéis e turno silencioso', () => {
    const interview = makeDeps().repo.seed();
    const msgs = buildInterviewerMessages({
      template, interview, elapsedSec: 400,
      turns: [
        { seq: 0, role: 'interviewer', text: 'Tell me about yourself.', metrics: null },
        { seq: 1, role: 'candidate', text: '', metrics: null },
      ],
    });
    expect(msgs[0].content).toContain('remaining=0');
    expect(msgs.slice(1)).toEqual([
      { role: 'assistant', content: 'Tell me about yourself.' },
      { role: 'user', content: '(candidate stayed silent)' },
    ]);
  });
});

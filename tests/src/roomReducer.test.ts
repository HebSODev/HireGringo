import { describe, expect, it } from 'vitest';
import { roomReducer, type RoomState } from '../../src/lib/roomReducer';

const at = (status: RoomState['status']): RoomState => ({ status });

describe('roomReducer', () => {
  it('fluxo feliz', () => {
    let s = at('idle');
    for (const type of ['MIC_REQUESTED', 'MIC_OK', 'STARTED', 'INTERVIEWER_AUDIO', 'INTERVIEWER_DONE', 'CANDIDATE_TURN_SENT', 'INTERVIEWER_ENDED', 'FINISHED'] as const) {
      s = roomReducer(s, { type });
    }
    expect(s.status).toBe('done');
  });

  it('microfone negado vira erro mic_denied', () => {
    expect(roomReducer(at('requesting_mic'), { type: 'MIC_DENIED' })).toEqual({ status: 'error', error: 'mic_denied' });
  });

  it('sem barge-in: turno do candidato é ignorado enquanto o entrevistador fala', () => {
    expect(roomReducer(at('interviewer_speaking'), { type: 'CANDIDATE_TURN_SENT' }).status).toBe('interviewer_speaking');
  });

  it('TIME_UP leva qualquer estado ativo para finishing', () => {
    for (const s of ['interviewer_thinking', 'interviewer_speaking', 'listening'] as const) {
      expect(roomReducer(at(s), { type: 'TIME_UP' }).status).toBe('finishing');
    }
  });

  it('done é final', () => {
    expect(roomReducer(at('done'), { type: 'FAILED', code: 'upstream_failed' }).status).toBe('done');
    expect(roomReducer(at('done'), { type: 'TIME_UP' }).status).toBe('done');
  });

  it('erro na avaliação permite tentar de novo', () => {
    const s = roomReducer(at('finishing'), { type: 'FAILED', code: 'evaluation_failed' });
    expect(s).toEqual({ status: 'error', error: 'evaluation_failed' });
    expect(roomReducer(s, { type: 'RETRY_FINISH' }).status).toBe('finishing');
  });

  it('não encerra enquanto ainda está conectando (a entrevista ainda não existe)', () => {
    expect(roomReducer(at('starting'), { type: 'TIME_UP' }).status).toBe('starting');
  });
});

import type { ClientErrorCode } from './api';

export type RoomStatus =
  | 'idle' | 'requesting_mic' | 'starting' | 'interviewer_thinking' | 'interviewer_speaking'
  | 'listening' | 'finishing' | 'done' | 'error';

export type RoomState = { status: RoomStatus; error?: ClientErrorCode };

export type RoomEvent =
  | { type: 'MIC_REQUESTED' } | { type: 'MIC_DENIED' } | { type: 'MIC_OK' } | { type: 'STARTED' }
  | { type: 'INTERVIEWER_AUDIO' } | { type: 'INTERVIEWER_DONE' } | { type: 'INTERVIEWER_ENDED' }
  | { type: 'CANDIDATE_TURN_SENT' } | { type: 'TIME_UP' } | { type: 'FINISHED' }
  | { type: 'FAILED'; code: ClientErrorCode } | { type: 'RETRY_FINISH' };

/** Estados em que a entrevista já existe no servidor e pode ser encerrada. */
const ACTIVE: RoomStatus[] = ['interviewer_thinking', 'interviewer_speaking', 'listening'];
const INTERVIEWER: RoomStatus[] = ['interviewer_thinking', 'interviewer_speaking'];

export function roomReducer(state: RoomState, event: RoomEvent): RoomState {
  const s = state.status;
  if (s === 'done') return state;
  switch (event.type) {
    case 'MIC_REQUESTED': return s === 'idle' || s === 'error' ? { status: 'requesting_mic' } : state;
    case 'MIC_DENIED': return s === 'requesting_mic' ? { status: 'error', error: 'mic_denied' } : state;
    case 'MIC_OK': return s === 'requesting_mic' ? { status: 'starting' } : state;
    case 'STARTED': return s === 'starting' ? { status: 'interviewer_thinking' } : state;
    case 'INTERVIEWER_AUDIO': return s === 'interviewer_thinking' ? { status: 'interviewer_speaking' } : state;
    case 'INTERVIEWER_DONE': return INTERVIEWER.includes(s) ? { status: 'listening' } : state;
    case 'INTERVIEWER_ENDED': return INTERVIEWER.includes(s) ? { status: 'finishing' } : state;
    case 'CANDIDATE_TURN_SENT': return s === 'listening' ? { status: 'interviewer_thinking' } : state;
    case 'TIME_UP': return ACTIVE.includes(s) ? { status: 'finishing' } : state;
    case 'FINISHED': return s === 'finishing' ? { status: 'done' } : state;
    case 'FAILED': return { status: 'error', error: event.code };
    // Tenta gerar o resultado de novo, ou encerra após uma falha no meio da conversa.
    case 'RETRY_FINISH': return s === 'error' && state.error !== 'mic_denied' ? { status: 'finishing' } : state;
  }
}

import { expect, it } from 'vitest';
import { phaseFor } from '../../server/interviewPhase';

it('mapeia o tempo decorrido para a fase do roteiro', () => {
  expect([0, 29, 30, 119, 120, 269, 270, 400].map(phaseFor)).toEqual(
    ['opening', 'opening', 'behavioral', 'behavioral', 'technical', 'technical', 'closing', 'closing'],
  );
});

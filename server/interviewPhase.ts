export type Phase = 'opening' | 'behavioral' | 'technical' | 'closing';

export function phaseFor(elapsedSec: number): Phase {
  if (elapsedSec < 30) return 'opening';
  if (elapsedSec < 120) return 'behavioral';
  if (elapsedSec < 270) return 'technical';
  return 'closing';
}

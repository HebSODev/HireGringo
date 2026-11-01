import { lazy } from '../../server/deps';
import { createTurnHandler } from '../../server/handlers/turn';

export const POST = lazy(createTurnHandler);

import { lazy } from '../../server/deps.js';
import { createTurnHandler } from '../../server/handlers/turn.js';

export const POST = lazy(createTurnHandler);

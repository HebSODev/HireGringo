import { lazy } from '../../server/deps.js';
import { createFinishHandler } from '../../server/handlers/finish.js';

export const POST = lazy(createFinishHandler);

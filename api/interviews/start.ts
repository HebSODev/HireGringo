import { lazy } from '../../server/deps.js';
import { createStartHandler } from '../../server/handlers/start.js';

export const POST = lazy(createStartHandler);

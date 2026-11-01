import { lazy } from '../server/deps.js';
import { createDeepgramTokenHandler } from '../server/handlers/deepgramToken.js';

export const POST = lazy(createDeepgramTokenHandler);

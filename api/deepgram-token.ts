import { lazy } from '../server/deps';
import { createDeepgramTokenHandler } from '../server/handlers/deepgramToken';

export const POST = lazy(createDeepgramTokenHandler);

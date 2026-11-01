import { lazy } from '../../server/deps';
import { createStartHandler } from '../../server/handlers/start';

export const POST = lazy(createStartHandler);

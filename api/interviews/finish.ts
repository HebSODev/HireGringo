import { lazy } from '../../server/deps';
import { createFinishHandler } from '../../server/handlers/finish';

export const POST = lazy(createFinishHandler);

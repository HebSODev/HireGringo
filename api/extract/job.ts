import { lazy } from '../../server/deps';
import { createExtractJobHandler } from '../../server/handlers/extractJob';

export const POST = lazy(createExtractJobHandler);

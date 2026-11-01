import { lazy } from '../../server/deps.js';
import { createExtractJobHandler } from '../../server/handlers/extractJob.js';

export const POST = lazy(createExtractJobHandler);

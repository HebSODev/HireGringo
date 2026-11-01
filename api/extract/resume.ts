import { lazy } from '../../server/deps.js';
import { createExtractResumeHandler } from '../../server/handlers/extractResume.js';

export const POST = lazy(createExtractResumeHandler);

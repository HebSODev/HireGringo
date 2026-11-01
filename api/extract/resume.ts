import { lazy } from '../../server/deps';
import { createExtractResumeHandler } from '../../server/handlers/extractResume';

export const POST = lazy(createExtractResumeHandler);

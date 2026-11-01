export type JobSummary = {
  title: string;
  company: string | null;
  seniority: string | null;
  requirements: string[];
  stack: string[];
  responsibilities: string[];
};

export type ResumeSummary = {
  name: string | null;
  headline: string;
  skills: string[];
  experiences: { company: string; role: string; highlights: string[] }[];
};

export type DgWord = { word: string; punctuated_word?: string; start: number; end: number; confidence: number };

export type TurnMetrics = {
  wordCount: number;
  durationSec: number;
  wpm: number;
  fillerCount: number;
  lowConfidenceWords: string[];
  longPauseCount: number;
  responseLatencySec: number | null;
  silent: boolean;
};

export type InterviewStatus = 'in_progress' | 'completed' | 'abandoned';

export type Turn = { seq: number; role: 'interviewer' | 'candidate'; text: string; metrics: TurnMetrics | null };

export type Interview = {
  id: string;
  userId: string;
  status: InterviewStatus;
  job: JobSummary;
  resume: ResumeSummary;
  resumePath: string;
  startedAt: Date;
};

export type Evaluation = {
  technical: { score: number; justification: string };
  english: { score: number; justification: string };
  tips: { technical: string[]; english: { said: string; better: string; why: string }[] };
};

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'quota_exhausted'
  | 'too_many_unfinished'
  | 'interview_not_active'
  | 'time_over'
  | 'resume_unreadable'
  | 'not_tech_role'
  | 'url_unreadable'
  | 'evaluation_failed'
  | 'upstream_failed';

/** `audio.data` é base64 de PCM 16-bit little-endian, mono, TTS_SAMPLE_RATE Hz. */
export type TurnStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'audio'; seq: number; data: string }
  | { type: 'end' }
  | { type: 'error'; code: ApiErrorCode };

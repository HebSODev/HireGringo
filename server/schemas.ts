import { z } from 'zod';

export const JobSummarySchema = z.object({
  title: z.string().min(1),
  company: z.string().nullable(),
  seniority: z.string().nullable(),
  requirements: z.array(z.string()),
  stack: z.array(z.string()),
  responsibilities: z.array(z.string()),
});

export const ResumeSummarySchema = z.object({
  name: z.string().nullable(),
  headline: z.string(),
  skills: z.array(z.string()),
  experiences: z.array(z.object({ company: z.string(), role: z.string(), highlights: z.array(z.string()) })),
});

export const TurnMetricsSchema = z.object({
  wordCount: z.number(),
  durationSec: z.number(),
  wpm: z.number(),
  fillerCount: z.number(),
  lowConfidenceWords: z.array(z.string()),
  longPauseCount: z.number(),
  responseLatencySec: z.number().nullable(),
  silent: z.boolean(),
});

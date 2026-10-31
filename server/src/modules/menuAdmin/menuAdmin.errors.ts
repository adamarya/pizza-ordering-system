import type { z } from 'zod';

/** Field messages keyed by path ("sizes.0.priceCents"), the same shape checkout uses. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[issue.path.join('.')] ??= issue.message;
  return errors;
}

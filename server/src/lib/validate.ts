import { z } from 'zod';
import { badRequest } from './errors.js';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = issues[0];
    const summary = first ? (first.path ? `${first.path}: ${first.message}` : first.message) : 'Invalid input';
    throw badRequest(summary, issues);
  }
  return result.data;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Accepts "1"/"true"/"0"/"false" query flags. */
export const queryFlag = z
  .enum(['1', 'true', '0', 'false'])
  .optional()
  .transform((v) => v === '1' || v === 'true');

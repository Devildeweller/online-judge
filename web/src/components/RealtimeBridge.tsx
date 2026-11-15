import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent } from '../lib/socket';
import type { Paged, RunResult, SubmissionDetail, SubmissionSummary, SubmissionUpdate } from '../types';

const LIVE_FIELDS = ['status', 'verdict', 'passedTests', 'totalTests', 'timeMs', 'memoryKb'] as const;

function merge<T extends SubmissionSummary>(submission: T, update: SubmissionUpdate): T {
  const next = { ...submission };
  for (const field of LIVE_FIELDS) (next as Record<string, unknown>)[field] = update[field];
  return next;
}

/**
 * Applies judge events pushed over the socket straight into the query cache, so every list and
 * detail view showing that submission updates in place without refetching.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient();

  useSocketEvent<SubmissionUpdate>('submission:update', (update) => {
    queryClient.setQueriesData<Paged<SubmissionSummary>>({ queryKey: ['submissions'] }, (page) =>
      page && page.items.some((s) => s.id === update.id)
        ? { ...page, items: page.items.map((s) => (s.id === update.id ? merge(s, update) : s)) }
        : page,
    );
    queryClient.setQueriesData<{ submission: SubmissionDetail }>({ queryKey: ['submission', update.id] }, (data) =>
      data ? { submission: merge(data.submission, update) } : data,
    );

    if (update.status === 'COMPLETED') {
      // The final verdict changes derived data: per-test results, solved marks, counters, standings.
      for (const key of [['submission', update.id], ['submissions'], ['problems'], ['problem'], ['contest'], ['user']]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    }
  });

  useSocketEvent<RunResult>('run:result', (result) => {
    queryClient.setQueryData(['run', result.runId], { pending: false, result });
  });

  useSocketEvent<{ contestId: number }>('leaderboard:update', ({ contestId }) => {
    void queryClient.invalidateQueries({ queryKey: ['contest-board', contestId] });
  });

  return null;
}

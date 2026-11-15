import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { ProblemWorkspace } from '../components/ProblemWorkspace';
import { Empty, ErrorState, Loading, usePageTitle } from '../components/ui';
import { api } from '../lib/api';
import type { ContestDetail, ProblemDetail } from '../types';

function useProblem(slug: string | undefined) {
  return useQuery({
    queryKey: ['problem', slug],
    queryFn: () => api.get<{ problem: ProblemDetail }>(`/problems/${slug}`),
    enabled: !!slug,
  });
}

export function ProblemPage() {
  const { slug } = useParams();
  const problem = useProblem(slug);
  usePageTitle(problem.data?.problem.title);

  if (problem.isLoading) return <Loading />;
  if (problem.isError) return <ErrorState error={problem.error} retry={() => void problem.refetch()} />;
  // Keyed by id so editor state resets when navigating between problems.
  return <ProblemWorkspace key={problem.data!.problem.id} problem={problem.data!.problem} />;
}

export function ContestProblemPage() {
  const { slug, label } = useParams();
  const contest = useQuery({
    queryKey: ['contest', slug],
    queryFn: () => api.get<{ contest: ContestDetail }>(`/contests/${slug}`),
    enabled: !!slug,
  });
  const entry = contest.data?.contest.problems?.find((p) => p.label.toLowerCase() === label?.toLowerCase());
  const problem = useProblem(entry?.slug);
  usePageTitle(entry ? `${entry.label}. ${entry.title}` : undefined);

  if (contest.isLoading || (entry && problem.isLoading)) return <Loading />;
  if (contest.isError) return <ErrorState error={contest.error} retry={() => void contest.refetch()} />;
  if (!entry) {
    return (
      <Empty title={contest.data!.contest.problems === null ? 'The contest has not started yet' : 'No such problem in this contest'}>
        Problems become visible when the contest begins.
      </Empty>
    );
  }
  if (problem.isError) return <ErrorState error={problem.error} retry={() => void problem.refetch()} />;

  const c = contest.data!.contest;
  return (
    <ProblemWorkspace
      key={problem.data!.problem.id}
      problem={problem.data!.problem}
      contest={{ id: c.id, slug: c.slug, title: c.title, label: entry.label, running: c.phase === 'RUNNING' }}
    />
  );
}

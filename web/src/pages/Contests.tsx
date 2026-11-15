import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Countdown, Empty, ErrorState, Loading, PhaseBadge, usePageTitle } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, formatSpan } from '../lib/format';
import type { ContestListItem, ContestPhase, Paged } from '../types';

const SECTIONS: { phase: ContestPhase; title: string; empty: string }[] = [
  { phase: 'RUNNING', title: 'Running now', empty: 'No contest is running at the moment.' },
  { phase: 'UPCOMING', title: 'Upcoming', empty: 'No contests are scheduled yet.' },
  { phase: 'ENDED', title: 'Past contests', empty: 'No contests have finished yet.' },
];

function ContestCard({ contest, onElapsed }: { contest: ContestListItem; onElapsed: () => void }) {
  return (
    <div className="card contest-card">
      <div>
        <h3>
          <Link to={`/contests/${contest.slug}`}>{contest.title}</Link> <PhaseBadge phase={contest.phase} />{' '}
          {contest.registered && <span className="badge accent">Registered</span>}
          {!contest.isPublic && <span className="badge">Hidden</span>}
        </h3>
        <div className="contest-meta">
          <span>{formatDateTime(contest.startTime)}</span>
          <span>{formatSpan(contest.startTime, contest.endTime)}</span>
          <span>{contest.problemCount} problems</span>
          <span>{contest.participants} registered</span>
        </div>
      </div>
      <div className="row">
        {contest.phase !== 'ENDED' && (
          <>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {contest.phase === 'RUNNING' ? 'Ends in' : 'Starts in'}
            </span>
            <Countdown to={contest.phase === 'RUNNING' ? contest.endTime : contest.startTime} onElapsed={onElapsed} />
          </>
        )}
        <Link className={`btn btn-sm ${contest.phase === 'RUNNING' ? 'btn-primary' : ''}`} to={`/contests/${contest.slug}`}>
          {contest.phase === 'RUNNING' ? 'Enter' : contest.phase === 'UPCOMING' ? 'Details' : 'Results'}
        </Link>
      </div>
    </div>
  );
}

export function ContestsPage() {
  usePageTitle('Contests');
  const contests = useQuery({ queryKey: ['contests', 'all'], queryFn: () => api.get<Paged<ContestListItem>>('/contests?pageSize=100') });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Contests</h1>
          <p>Timed rounds with ICPC scoring: most problems solved wins, penalty time breaks ties.</p>
        </div>
      </div>
      {contests.isLoading ? (
        <Loading />
      ) : contests.isError ? (
        <ErrorState error={contests.error} retry={() => void contests.refetch()} />
      ) : (
        <div className="stack" style={{ gap: 26 }}>
          {SECTIONS.map((section) => {
            const items = contests.data!.items.filter((c) => c.phase === section.phase);
            if (section.phase === 'UPCOMING') items.reverse();
            return (
              <section key={section.phase}>
                <h2 style={{ marginBottom: 12 }}>{section.title}</h2>
                {items.length === 0 ? (
                  <div className="card">
                    <Empty title={section.empty} />
                  </div>
                ) : (
                  <div className="stack" style={{ gap: 12 }}>
                    {items.map((contest) => (
                      <ContestCard key={contest.id} contest={contest} onElapsed={() => void contests.refetch()} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { IssueList } from './IssueList';

export const metadata = { title: 'Issues' };

export default function IssuesPage() {
  return <Suspense fallback={<Loading />}><IssueList /></Suspense>;
}

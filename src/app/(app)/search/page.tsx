import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { SearchResults } from './SearchResults';

export const metadata = { title: 'Search' };

export default function SearchPage() {
  return <Suspense fallback={<Loading />}><SearchResults /></Suspense>;
}

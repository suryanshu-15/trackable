import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { StockControl } from './StockControl';

export const metadata = { title: 'Returns, disposals & adjustments' };

export default function StockControlPage() {
  return <Suspense fallback={<Loading />}><StockControl /></Suspense>;
}

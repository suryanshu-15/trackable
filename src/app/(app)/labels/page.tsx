import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { LabelSheet } from './LabelSheet';

export const metadata = { title: 'Print labels' };

export default function LabelsPage() {
  return <Suspense fallback={<Loading />}><LabelSheet /></Suspense>;
}

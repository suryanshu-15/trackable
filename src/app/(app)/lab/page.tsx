import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { LabDashboard } from './LabDashboard';

export const metadata = { title: 'Laboratory' };

export default function LabPage() {
  return <Suspense fallback={<Loading />}><LabDashboard /></Suspense>;
}

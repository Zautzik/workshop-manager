'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SupplyPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/operaciones'); }, [router]);
  return null;
}

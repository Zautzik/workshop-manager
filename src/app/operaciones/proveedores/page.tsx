'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Proveedores is now a sub-section (tab) of Compras. Keep this route as a
// redirect so existing links / bookmarks land on the right tab.
export default function SuppliersPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/operaciones/compras?tab=proveedores');
  }, [router]);
  return null;
}

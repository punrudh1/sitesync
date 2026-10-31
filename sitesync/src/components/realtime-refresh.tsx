'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Sub = { table: string; filter?: string };

/**
 * Subscribes to Supabase Realtime (row-level-security applies) and re-renders the current
 * server components when something changes. This is live synchronisation, not co-editing.
 */
export function RealtimeRefresh({ name, subs }: { name: string; subs: Sub[] }) {
  const router = useRouter();
  const key = JSON.stringify(subs);
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout>;
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 400); };
    let channel = supabase.channel(name);
    (JSON.parse(key) as Sub[]).forEach((s) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: s.table, ...(s.filter ? { filter: s.filter } : {}) }, bump);
    });
    channel.subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, [name, key, router]);
  return null;
}

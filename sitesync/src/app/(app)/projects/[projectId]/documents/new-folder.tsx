'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createFolder } from './actions';

export function NewFolderButton({ projectId, parentId }: { projectId: string; parentId: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button variant="outline" disabled={pending} onClick={() => {
      const n = prompt('Folder name'); if (!n) return;
      start(async () => { const r = await createFolder(projectId, parentId, n); r.ok ? (toast.success('Folder created'), router.refresh()) : toast.error(r.error); });
    }}><FolderPlus size={16} />New folder</Button>
  );
}

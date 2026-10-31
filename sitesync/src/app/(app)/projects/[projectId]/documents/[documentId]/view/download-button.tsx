'use client';

import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getDownloadUrl } from '../../actions';

export function DownloadButton({ projectId, versionId }: { projectId: string; versionId: string }) {
  return <Button variant="outline" onClick={async () => { const r = await getDownloadUrl(projectId, versionId); r.ok ? (window.location.href = r.url) : toast.error(r.error); }}><Download size={16} />Download original</Button>;
}

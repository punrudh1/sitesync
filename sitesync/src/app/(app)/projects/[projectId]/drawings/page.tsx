import Link from 'next/link';
import { Ruler } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Drawings' };

export default async function Drawings({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase } = await requireUser();
  const { data: docs } = await supabase.from('documents').select('id, name, extension, updated_at').eq('project_id', projectId).in('extension', ['pdf', 'jpg', 'jpeg', 'png', 'dxf']).order('updated_at', { ascending: false });
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Drawings</h1>
      <p className="text-sm text-navy-500">PDF, image and DXF files that open in the viewer (PDF and images support markups). DWG is a proprietary format: DWG files are stored and downloadable from Documents but cannot be previewed in the browser.</p>
      <Card className="p-0">
        {docs?.length ? (
          <ul className="divide-y divide-slate-100">{docs.map((d) => (
            <li key={d.id}><Link href={`/projects/${projectId}/documents/${d.id}/view`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50"><Ruler size={16} className="text-brand" /><span className="font-medium">{d.name}</span><span className="ml-auto text-xs text-navy-500">{new Date(d.updated_at).toLocaleDateString()}</span></Link></li>))}
          </ul>) : <p className="p-8 text-center text-sm text-navy-500">No viewable drawings yet. Upload one from Documents.</p>}
      </Card>
    </div>
  );
}

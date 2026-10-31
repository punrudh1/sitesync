export const STATUSES = ['todo', 'in_progress', 'under_review', 'completed', 'blocked'] as const;
export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export const STATUS_LABEL: Record<Status, string> = { todo: 'To Do', in_progress: 'In Progress', under_review: 'Under Review', completed: 'Completed', blocked: 'Blocked' };
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
export const PRIORITY_STYLE: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-700', medium: 'bg-blue-100 text-blue-800', high: 'bg-orange-100 text-orange-800', critical: 'bg-red-100 text-red-800',
};

/** Date-only strings (YYYY-MM-DD) compare correctly as text. */
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const isOverdue = (due: string | null, status: string, today = todayStr()) => !!due && status !== 'completed' && due < today;
export const daysUntil = (due: string, today = todayStr()) => Math.round((Date.parse(due) - Date.parse(today)) / 86400000);

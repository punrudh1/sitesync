import { z } from 'zod';

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(10, 'Use at least 10 characters').max(128),
});
export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
export const projectSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  code: z.string().trim().min(2, 'Code is too short').max(32),
  description: z.string().trim().max(4000).default(''),
  startDate: z.string().optional().transform((v) => v || null),
  targetDate: z.string().optional().transform((v) => v || null),
});
export const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email') });

import { PRIORITIES, STATUSES } from './tasks';
const optDate = z.string().optional().transform((v) => v || null);
export const taskSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200),
  description: z.string().trim().max(8000).default(''),
  assigneeId: z.string().optional().transform((v) => v || null).pipe(z.string().uuid().nullable()),
  priority: z.enum(PRIORITIES),
  status: z.enum(STATUSES),
  startDate: optDate,
  dueDate: optDate,
}).refine((t) => !t.startDate || !t.dueDate || t.dueDate >= t.startDate, { message: 'Due date must be on or after the start date', path: ['dueDate'] });

const unit = z.number().min(0).max(1);
export const annotationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['pin', 'text']), coordinates: z.object({ x: unit, y: unit }) }),
  z.object({ type: z.enum(['rectangle', 'cloud']), coordinates: z.object({ x: unit, y: unit, w: unit, h: unit }) }),
  z.object({ type: z.literal('arrow'), coordinates: z.object({ x1: unit, y1: unit, x2: unit, y2: unit }) }),
]);

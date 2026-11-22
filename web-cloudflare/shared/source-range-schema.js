import { z } from 'zod';
import { validDate } from './format.js';
export const sourceRangeInput=z.object({source:z.string().trim().min(1).max(64),from:z.string().refine(validDate),to:z.string().refine(validDate)}).strict().refine(v=>v.from<=v.to,'开始日期不能晚于结束日期');
export const sourceRangeSchema=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),source:z.string().trim().min(1).max(64),from:z.string().refine(validDate),to:z.string().refine(validDate),created_at:z.iso.datetime()}).strict().refine(v=>v.from<=v.to,'范围日期无效');

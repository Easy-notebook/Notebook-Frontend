import { createCommand } from 'lexical';
export const COLUMN_ACTION = createCommand<
  { key: string; action: 'count'; count: number } | { key: string; action: 'unwrap' }
>('notebook/column-action');

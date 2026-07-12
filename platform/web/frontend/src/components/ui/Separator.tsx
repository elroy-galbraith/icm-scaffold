import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export function Separator({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn('border-t border-border', className)} {...props} />;
}

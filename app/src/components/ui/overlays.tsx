import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...props }: TabsPrimitive.TabsListProps) => (
  <TabsPrimitive.List className={cn('inline-flex rounded-lg border app-control p-1', className)} {...props} />
);
export const TabsTrigger = ({ className, ...props }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger
    className={cn('rounded-md px-3 py-1.5 text-xs text-app-muted transition data-[state=active]:bg-[var(--app-accent-soft)] data-[state=active]:text-[var(--app-accent-text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/25', className)}
    {...props}
  />
);
export const TabsContent = TabsPrimitive.Content;

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export function DialogContent({ title, children }: { title: string; children: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--app-overlay)]" />
      <DialogPrimitive.Content className="app-panel fixed left-1/2 top-1/2 z-50 max-h-[82vh] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border p-5 text-app focus:outline-none">
        <div className="mb-4 flex items-start justify-between gap-4">
          <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Close dialog"
            className="grid size-8 place-items-center rounded-lg text-app-muted hover:bg-[var(--app-control)] hover:text-app focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/25"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export function DropdownMenuContent({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content align="end" className="app-panel z-50 min-w-44 rounded-lg border p-1 text-sm text-app">
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}
export const DropdownMenuItem = ({ className, ...props }: DropdownMenuPrimitive.DropdownMenuItemProps) => (
  <DropdownMenuPrimitive.Item className={cn('cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-[var(--app-control-strong)] focus:bg-[var(--app-control-strong)]', className)} {...props} />
);

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={250}>{children}</TooltipPrimitive.Provider>;
}
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export function TooltipContent({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content className="app-panel z-50 rounded-md border px-2.5 py-1.5 text-xs text-app shadow-xl" sideOffset={8}>
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Slot } from '@radix-ui/react-slot';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'icon';
  asChild?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    asChild,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'icon' && 'size-9 p-0',
        variant === 'primary' && 'border-amber-400/70 bg-amber-300 text-zinc-950 hover:bg-amber-200',
        variant === 'secondary' && 'border-white/10 bg-white/[0.06] text-zinc-100 hover:bg-white/[0.09]',
        variant === 'ghost' && 'border-transparent bg-transparent text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-50',
        variant === 'danger' && 'border-red-400/30 bg-red-500/12 text-red-200 hover:bg-red-500/20',
        className,
      )}
      {...props}
    />
  );
});

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button size="icon" variant="ghost" className={className} {...props} />;
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium',
        tone === 'neutral' && 'border-white/10 bg-white/[0.05] text-zinc-300',
        tone === 'success' && 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
        tone === 'warning' && 'border-amber-400/30 bg-amber-400/10 text-amber-200',
        tone === 'danger' && 'border-red-400/25 bg-red-400/10 text-red-200',
        tone === 'accent' && 'border-amber-300/40 bg-amber-300/15 text-amber-100',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Progress({ value, className }: { value?: number | null; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-white/10', className)}>
      <div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${Math.min(Math.max(value ?? 0, 0), 100)}%` }} />
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-10 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/15',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-36 w-full resize-y rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/15',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-xl border border-white/10 bg-zinc-900/70 shadow-2xl shadow-black/20', className)}>{children}</section>;
}

export function PanelHeader({
  title,
  eyebrow,
  description,
  action,
  className,
}: {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">{eyebrow}</p>}
        <h1 className="truncate text-lg font-semibold text-zinc-50">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <div className="grid min-h-56 place-items-center px-6 py-10 text-center">
      <div className="grid max-w-sm justify-items-center gap-3">
        {icon && <div className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-amber-200">{icon}</div>}
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        {body && <p className="text-sm leading-6 text-zinc-500">{body}</p>}
      </div>
    </div>
  );
}

export function ErrorState({ title = 'Unable to load', error }: { title?: string; error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-red-200/80">{message}</p>
    </div>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select',
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger className="flex h-10 w-full items-center justify-between rounded-lg border border-white/10 bg-zinc-950/60 px-3 text-sm text-zinc-100 outline-none focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/15">
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon><ChevronDown className="size-4 text-zinc-500" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="z-50 overflow-hidden rounded-lg border border-white/10 bg-zinc-950 text-zinc-100 shadow-2xl shadow-black/50">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex h-9 cursor-pointer select-none items-center rounded-md px-8 text-sm outline-none data-[highlighted]:bg-white/10 data-[disabled]:opacity-40"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2"><Check className="size-4" /></SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function Switch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative h-6 w-10 rounded-full border border-white/10 bg-zinc-800 transition data-[state=checked]:bg-amber-300"
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-zinc-200 transition data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-zinc-950" />
    </SwitchPrimitive.Root>
  );
}

export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...props }: TabsPrimitive.TabsListProps) => (
  <TabsPrimitive.List className={cn('inline-flex rounded-lg border border-white/10 bg-zinc-950/60 p-1', className)} {...props} />
);
export const TabsTrigger = ({ className, ...props }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger
    className={cn('rounded-md px-3 py-1.5 text-xs text-zinc-400 transition data-[state=active]:bg-white/10 data-[state=active]:text-zinc-50', className)}
    {...props}
  />
);
export const TabsContent = TabsPrimitive.Content;

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export function DialogContent({ title, children }: { title: string; children: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70" />
      <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[82vh] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-white/10 bg-zinc-950 p-5 text-zinc-100 shadow-2xl shadow-black/60">
        <div className="mb-4 flex items-start justify-between gap-4">
          <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close className="grid size-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-zinc-50">
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
      <DropdownMenuPrimitive.Content align="end" className="z-50 min-w-44 rounded-lg border border-white/10 bg-zinc-950 p-1 text-sm text-zinc-100 shadow-2xl shadow-black/50">
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}
export const DropdownMenuItem = ({ className, ...props }: DropdownMenuPrimitive.DropdownMenuItemProps) => (
  <DropdownMenuPrimitive.Item className={cn('cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-white/10', className)} {...props} />
);

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={250}>{children}</TooltipPrimitive.Provider>;
}
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export function TooltipContent({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content className="z-50 rounded-md border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 shadow-xl" sideOffset={8}>
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

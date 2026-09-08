import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Slot } from '@radix-ui/react-slot';
import { Check, ChevronDown } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'icon';
  asChild?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', asChild, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition active:translate-y-px disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/25',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'icon' && 'size-9 p-0',
        variant === 'primary' && 'border-[color:var(--app-accent)] bg-[var(--app-accent)] text-[var(--app-accent-contrast)] hover:brightness-105',
        variant === 'secondary' && 'app-control text-app-soft',
        variant === 'ghost' && 'border-transparent bg-transparent text-app-muted hover:bg-[var(--app-control)] hover:text-app',
        variant === 'danger' && 'border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] text-[var(--app-danger)] hover:brightness-105',
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
        tone === 'neutral' && 'app-control text-app-soft',
        tone === 'success' && 'border-[color:var(--app-success)] bg-[var(--app-success-soft)] text-[var(--app-success)]',
        tone === 'warning' && 'border-[color:var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]',
        tone === 'danger' && 'border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] text-[var(--app-danger)]',
        tone === 'accent' && 'border-[color:var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Progress({ value, className }: { value?: number | null; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-[var(--app-control-strong)]', className)}>
      <div className="h-full rounded-full bg-[var(--app-accent)] transition-all" style={{ width: `${Math.min(Math.max(value ?? 0, 0), 100)}%` }} />
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-10 w-full rounded-lg border app-control px-3 text-sm outline-none transition placeholder:text-app-faint focus:border-[color:var(--app-accent)] focus:ring-2 focus:ring-[color:var(--app-accent)]/15',
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
      'min-h-36 w-full resize-y rounded-lg border app-control px-3 py-2 text-sm leading-6 outline-none transition placeholder:text-app-faint focus:border-[color:var(--app-accent)] focus:ring-2 focus:ring-[color:var(--app-accent)]/15',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm text-app-soft">
      <span className="text-xs font-medium text-app-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-app-muted">{hint}</span>}
    </label>
  );
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select',
  disabled = false,
  'aria-label': ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger aria-label={ariaLabel} className="flex h-10 w-full min-w-0 items-center justify-between rounded-lg border app-control px-3 text-sm outline-none focus:border-[color:var(--app-accent)] focus:ring-2 focus:ring-[color:var(--app-accent)]/15">
        <span className="min-w-0 truncate"><SelectPrimitive.Value placeholder={placeholder} /></span>
        <SelectPrimitive.Icon><ChevronDown className="size-4 text-app-muted" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="app-panel z-50 overflow-hidden rounded-lg border text-app">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex h-9 cursor-pointer select-none items-center rounded-md px-8 text-sm outline-none data-[highlighted]:bg-[var(--app-control-strong)] data-[disabled]:opacity-40"
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

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative h-6 w-10 rounded-full border app-control transition data-[state=checked]:bg-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-[var(--app-switch-thumb)] transition data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-[var(--app-accent-contrast)]" />
    </SwitchPrimitive.Root>
  );
}

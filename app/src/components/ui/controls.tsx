import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Slot } from '@radix-ui/react-slot';
import { Check, ChevronDown } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
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
        'inline-flex items-center justify-center gap-2 rounded-[10px] border font-semibold transition active:translate-y-px disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/25',
        size === 'sm' && 'h-9 px-3.5 text-sm',
        size === 'md' && 'h-11 px-5 text-sm',
        size === 'icon' && 'size-10 p-0',
        variant === 'primary' && 'border-[color:var(--app-accent)] bg-[var(--app-accent)] text-[var(--app-accent-contrast)] hover:border-[color:var(--app-accent-hover)] hover:bg-[var(--app-accent-hover)]',
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
        tone === 'warning' && 'border-[color:var(--app-warning)] bg-[var(--app-warning-soft)] text-[var(--app-warning)]',
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
      'h-11 w-full rounded-[10px] border app-control px-3.5 text-sm outline-none transition placeholder:text-app-faint focus:border-[color:var(--app-accent)] focus:ring-2 focus:ring-[color:var(--app-accent)]/15',
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
    <label className="grid min-w-0 gap-2 text-sm text-app-soft">
      <span className="text-sm font-semibold text-app">{label}</span>
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
      <SelectPrimitive.Trigger aria-label={ariaLabel} className="flex h-11 w-full min-w-0 items-center justify-between rounded-[10px] border app-control px-3.5 text-sm outline-none focus:border-[color:var(--app-accent)] focus:ring-2 focus:ring-[color:var(--app-accent)]/15">
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

type SwitchProps = Omit<ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, 'checked' | 'onCheckedChange'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  className,
  ...props
}: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        'app-switch relative h-6 w-10 min-w-10 max-w-10 shrink-0 justify-self-end self-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-[var(--app-switch-thumb)] shadow-sm transition data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white" />
    </SwitchPrimitive.Root>
  );
}

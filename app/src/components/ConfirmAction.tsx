import { useState, type ReactNode } from 'react';
import { Button, Dialog, DialogContent, DialogTrigger } from './weiui';
import { useI18n } from '../lib/i18n';

export function ConfirmAction({
  children,
  title,
  description,
  confirmLabel,
  onConfirm,
  tone = 'danger',
}: {
  children: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  tone?: 'danger' | 'secondary';
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={title}>
        <div className="grid gap-5">
          <p className="text-sm leading-6 text-app-muted">{description}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant={tone}
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { cn } from '../lib/cn';
import { useI18n } from '../lib/i18n';
import type { LocalizedTechnicalMessage as Message } from '../lib/userMessages';

export function LocalizedTechnicalMessage({
  message,
  className,
}: {
  message: Message;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div className={cn('min-w-0 text-sm', className)}>
      <p className="break-words font-medium">{message.summary}</p>
      <details className="mt-1.5 text-xs opacity-80">
        <summary className="cursor-pointer select-none">{t('common.details')}</summary>
        <p className="mt-1 break-all font-mono leading-5">{message.detail}</p>
      </details>
    </div>
  );
}

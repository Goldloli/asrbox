import { useNavigate } from '@tanstack/react-router';
import { DownloadCloud, FileDown, FilePlus2, ListTodo, Plus, Settings, TerminalSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { Button, Dialog, DialogContent, EmptyState, Input } from './weiui';

type CommandItem = {
  id: string;
  label: string;
  description: string;
  icon: typeof FilePlus2;
  action: () => void;
};

export function CommandPalette() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: 'new-transcription',
        label: t('command.newTranscription'),
        description: t('command.newTranscriptionDescription'),
        icon: FilePlus2,
        action: () => navigate({ to: '/' }),
      },
      {
        id: 'open-tasks',
        label: t('command.openTasks'),
        description: t('command.openTasksDescription'),
        icon: ListTodo,
        action: () => navigate({ to: '/tasks' }),
      },
      {
        id: 'download-model',
        label: t('command.downloadModel'),
        description: t('command.downloadModelDescription'),
        icon: DownloadCloud,
        action: () => navigate({ to: '/models' }),
      },
      {
        id: 'add-provider',
        label: t('command.addProvider'),
        description: t('command.addProviderDescription'),
        icon: Plus,
        action: () => navigate({ to: '/settings', search: { tab: 'providers' } }),
      },
      {
        id: 'open-settings',
        label: t('command.openSettings'),
        description: t('command.openSettingsDescription'),
        icon: Settings,
        action: () => navigate({ to: '/settings' }),
      },
      {
        id: 'export-current',
        label: t('command.exportCurrent'),
        description: t('command.exportCurrentDescription'),
        icon: FileDown,
        action: () => navigate({ to: '/tasks' }),
      },
    ],
    [navigate, t],
  );

  const filteredCommands = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => `${command.label} ${command.description}`.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const runCommand = (command: CommandItem) => {
    command.action();
    setOpen(false);
    setQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title={t('command.title')}>
        <div className="grid gap-4">
          <div className="relative">
            <TerminalSquare className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && filteredCommands[0]) {
                  event.preventDefault();
                  runCommand(filteredCommands[0]);
                }
              }}
              placeholder={t('command.placeholder')}
              className="pl-9"
            />
          </div>
          <div className="grid max-h-[52vh] gap-2 overflow-auto pr-1">
            {filteredCommands.map((command) => {
              const Icon = command.icon;
              return (
                <Button
                  key={command.id}
                  variant="ghost"
                  className="h-auto justify-start rounded-xl border app-control px-3 py-3 text-left hover:border-[color:var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                  onClick={() => runCommand(command)}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--app-control-strong)] text-app-accent">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-app">{command.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-app-muted">{command.description}</span>
                  </span>
                </Button>
              );
            })}
            {filteredCommands.length === 0 && (
              <EmptyState
                title={t('command.noResults')}
                body={t('command.noResultsBody')}
                icon={<TerminalSquare className="size-5" />}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

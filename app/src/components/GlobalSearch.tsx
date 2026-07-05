import { Link } from '@tanstack/react-router';
import { FileAudio, HardDriveDownload, Search, Server } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { useModelsQuery, useProvidersQuery, useTasksQuery } from '../lib/queries';
import { formatDate } from '../lib/format';
import { Button, Dialog, DialogContent, DialogTrigger, EmptyState, Input } from './weiui';
import { openGlobalSearchEvent } from './GlobalShortcuts';
import { ResultItemContent, resultItemClassName } from './ResultItem';

type SearchResult = {
  id: string;
  kind: 'task' | 'model' | 'provider';
  title: string;
  description: string;
  meta: string;
  href: '/tasks' | '/models' | '/settings';
  search?: { tab: 'providers' };
};

const iconByKind = {
  task: FileAudio,
  model: HardDriveDownload,
  provider: Server,
};

export function GlobalSearch() {
  const { t, statusLabel } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const tasksQuery = useTasksQuery();
  const modelsQuery = useModelsQuery();
  const providersQuery = useProvidersQuery();
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(openGlobalSearchEvent, handleOpen);
    return () => window.removeEventListener(openGlobalSearchEvent, handleOpen);
  }, []);

  const results = useMemo<SearchResult[]>(() => {
    const taskResults = (tasksQuery.data?.items ?? []).map((task) => ({
      id: `task-${task.id}`,
      kind: 'task' as const,
      title: task.filename,
      description: task.text || task.error || task.id,
      meta: `${t('tasks.title')} · ${statusLabel(task.status)} · ${formatDate(task.updated_at)}`,
      href: '/tasks' as const,
      haystack: [
        task.filename,
        task.text,
        task.model_name,
        task.provider_id,
        task.source,
        task.segments?.map((segment) => segment.text).join(' '),
      ].join(' '),
    }));

    const modelResults = (modelsQuery.data?.models ?? []).map((model) => ({
      id: `model-${model.model_name}`,
      kind: 'model' as const,
      title: model.display_name,
      description: `${model.model_name} · ${model.engine} · ${model.runtime}`,
      meta: `${t('models.title')} · ${model.downloaded ? t('common.downloaded') : t('common.notDownloaded')}`,
      href: '/models' as const,
      haystack: [
        model.display_name,
        model.model_name,
        model.engine,
        model.runtime,
        model.source,
        model.languages?.join(' '),
      ].join(' '),
    }));

    const providerResults = (providersQuery.data?.items ?? []).map((provider) => ({
      id: `provider-${provider.id}`,
      kind: 'provider' as const,
      title: provider.name,
      description: `${provider.provider_type} · ${provider.default_model || t('providers.notSet')}`,
      meta: `${t('providers.title')} · ${provider.enabled ? t('common.enabled') : t('common.disabled')}`,
      href: '/settings' as const,
      search: { tab: 'providers' as const },
      haystack: [
        provider.name,
        provider.provider_type,
        provider.base_url,
        provider.default_model,
        provider.id,
      ].join(' '),
    }));

    return [...taskResults, ...modelResults, ...providerResults]
      .filter((result) => !normalizedQuery || result.haystack.toLowerCase().includes(normalizedQuery))
      .slice(0, 12)
      .map(({ haystack: _haystack, ...result }) => result);
  }, [modelsQuery.data, normalizedQuery, providersQuery.data, statusLabel, t, tasksQuery.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('search.open')} className="shrink-0">
          <Search className="size-4" />
          <span className="hidden lg:inline">{t('search.trigger')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent title={t('search.title')}>
        <div className="grid gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search.placeholder')}
              className="pl-9"
            />
          </div>

          <div className="grid max-h-[52vh] gap-2 overflow-auto pr-1">
            {results.map((result) => {
              const Icon = iconByKind[result.kind];
              return (
                <Link
                  key={result.id}
                  to={result.href}
                  search={result.search}
                  onClick={() => setOpen(false)}
                  className={resultItemClassName}
                >
                  <ResultItemContent
                    icon={<Icon className="size-4" />}
                    title={result.title}
                    description={result.description}
                    meta={result.meta}
                    tone={result.kind === 'task' ? 'accent' : 'neutral'}
                  />
                </Link>
              );
            })}
            {results.length === 0 && (
              <EmptyState
                title={normalizedQuery ? t('search.noResults') : t('search.emptyTitle')}
                body={normalizedQuery ? t('search.noResultsBody') : t('search.emptyBody')}
                icon={<Search className="size-5" />}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

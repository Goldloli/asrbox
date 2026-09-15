import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { BrainCircuit, Clock3, FileAudio, Languages, MessagesSquare, Search } from 'lucide-react';
import { TranslationPanel } from '../components/transcript/TranslationPanel';
import { ProofreadingPanel } from '../components/transcript/ProofreadingPanel';
import { ChatPanel } from '../components/transcript/ChatPanel';
import { Badge, Button, EmptyState, ErrorState, Input, PageTitle, Panel, PanelHeader } from '../components/weiui';
import { formatDate, formatDuration } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useTasksQuery } from '../lib/queries';
import { cn } from '../lib/cn';

export function AIPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { task?: string; mode?: string; run?: string };
  const translationMode = search.mode === 'translation';
  const chatMode = search.mode === 'chat';
  const tasksQuery = useTasksQuery();
  const [query, setQuery] = useState('');
  const tasks = tasksQuery.data?.items ?? [];
  const eligibleTasks = useMemo(() => (
    tasks
      .filter((task) => (task.status === 'completed' && task.segments.length > 0) || (translationMode && task.id === search.task))
      .sort((left, right) => Date.parse(right.completed_at ?? right.updated_at) - Date.parse(left.completed_at ?? left.updated_at))
  ), [tasks, translationMode, search.task]);
  const visibleTasks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? eligibleTasks.filter((task) => task.filename.toLocaleLowerCase().includes(normalized)) : eligibleTasks;
  }, [eligibleTasks, query]);
  const selectedTask = search.task ? eligibleTasks.find((task) => task.id === search.task) : eligibleTasks[0];

  useEffect(() => {
    if (chatMode || !tasksQuery.isSuccess || search.task || !selectedTask) return;
    navigate({ to: '/ai', search: { task: selectedTask.id, ...(translationMode ? { mode: 'translation' } : {}) }, replace: true });
  }, [navigate, search.task, selectedTask, tasksQuery.isSuccess, translationMode, chatMode]);

  const selectTask = (taskId: string) => {
    navigate({ to: '/ai', search: { task: taskId, ...(translationMode ? { mode: 'translation' } : {}) }, replace: true });
  };

  return (
    <section className="grid gap-4">
      <PageTitle
        title={chatMode ? t('chat.title') : t('ai.title')}
        description={chatMode ? t('chat.description') : translationMode ? t('translation.description') : t('ai.description')}
      />

      <nav className="flex flex-wrap gap-2" aria-label={t('ai.title')}>
        <Button asChild variant={!translationMode && !chatMode ? 'primary' : 'secondary'}><Link to="/ai" search={{ task: selectedTask?.id }} replace aria-current={!translationMode && !chatMode ? 'page' : undefined}>{t('translation.proofreading')}</Link></Button>
        <Button asChild variant={translationMode ? 'primary' : 'secondary'}><Link to="/ai" search={{ task: selectedTask?.id, mode: 'translation' }} replace aria-current={translationMode ? 'page' : undefined}>{t('translation.title')}</Link></Button>
        <Button asChild variant={chatMode ? 'primary' : 'secondary'}><Link to="/ai" search={{ mode: 'chat' }} replace aria-current={chatMode ? 'page' : undefined}><MessagesSquare className="size-4" />{t('chat.tab')}</Link></Button>
      </nav>

      {chatMode ? (
        <ChatPanel tasks={eligibleTasks} />
      ) : (
      <div className="grid min-w-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="min-w-0 overflow-hidden lg:sticky lg:top-0 lg:max-h-[calc(100dvh-150px)]">
          <PanelHeader title={t('ai.tasksTitle')} description={t('ai.tasksDescription')} />
          <div className="grid gap-3 border-b app-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('ai.searchPlaceholder')}
                className="pl-9"
              />
            </div>
            <p className="text-xs text-app-muted">{t('ai.eligibleCount', { count: eligibleTasks.length })}</p>
          </div>

          {tasksQuery.error && <div className="p-3"><ErrorState error={tasksQuery.error} /></div>}
          {tasksQuery.isSuccess && tasks.length === 0 && (
            <EmptyState
              title={t('ai.noTasks')}
              body={t('ai.noTasksBody')}
              icon={<FileAudio className="size-5" />}
              action={<Button asChild><Link to="/">{t('ai.startTranscription')}</Link></Button>}
            />
          )}
          {tasksQuery.isSuccess && tasks.length > 0 && eligibleTasks.length === 0 && (
            <EmptyState
              title={t('ai.noEligibleTasks')}
              body={t('ai.noEligibleTasksBody')}
              icon={<Clock3 className="size-5" />}
              action={<Button asChild variant="secondary"><Link to="/tasks">{t('ai.viewTasks')}</Link></Button>}
            />
          )}
          {eligibleTasks.length > 0 && visibleTasks.length === 0 && (
            <EmptyState title={t('ai.noSearchResults')} body={t('ai.noSearchResultsBody')} icon={<Search className="size-5" />} />
          )}
          {visibleTasks.length > 0 && (
            <div className="grid max-h-[440px] gap-1 overflow-auto p-2 lg:max-h-[calc(100dvh-310px)]">
              {visibleTasks.map((task) => {
                const active = task.id === selectedTask?.id;
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => selectTask(task.id)}
                    aria-pressed={active}
                    className={cn(
                      'grid min-w-0 gap-2 rounded-lg border px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/25',
                      active
                        ? 'border-[color:var(--app-accent)] bg-[var(--app-accent-soft)]'
                        : 'border-transparent hover:border-[var(--app-border)] hover:bg-[var(--app-control)]',
                    )}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-app">{task.filename}</span>
                      <Badge tone={active ? 'accent' : 'neutral'}>{task.segments.length}</Badge>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-app-muted">
                      <span>{formatDuration(task.duration_ms)}</span>
                      {task.language && <span className="inline-flex items-center gap-1"><Languages className="size-3" />{task.language}</span>}
                      <span>{formatDate(task.completed_at ?? task.updated_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="min-w-0">
          {selectedTask ? (
            translationMode ? <TranslationPanel key={selectedTask.id} task={selectedTask} runId={search.run} /> : <ProofreadingPanel task={selectedTask} />
          ) : (
            <Panel>
              {search.task && tasksQuery.isSuccess ? <ErrorState error={t('translation.missingTask')} /> : <EmptyState title={t('ai.chooseTask')} body={t('ai.chooseTaskBody')} icon={<BrainCircuit className="size-5" />} />}
            </Panel>
          )}
        </div>
      </div>
      )}
    </section>
  );
}

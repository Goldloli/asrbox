import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BrainCircuit, FileAudio, Loader2, MessageSquarePlus, Send, Settings2, Square, Trash2 } from 'lucide-react';
import { apiClient, type ChatMessage, type TranscriptionTask } from '../../lib/api';
import { ChatStreamError } from '../../lib/eventStream';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { cn } from '../../lib/cn';
import { queryKeys, useChatSessionQuery, useChatSessionsQuery, useLLMProvidersQuery } from '../../lib/queries';
import { useUiStore } from '../../stores/uiStore';
import { ConfirmAction } from '../ConfirmAction';
import { toastErrorMessage, useToast } from '../Toast';
import { Badge, Button, EmptyState, ErrorState, Panel, PanelHeader, Select, Textarea } from '../weiui';

type StreamDraft = { sessionId: string; userContent: string; content: string };
type StreamFailure = { code: string; message: string };

export function ChatPanel({ tasks }: { tasks: TranscriptionTask[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const lastProviderId = useUiStore((state) => state.lastLLMProviderId);
  const setLastProviderId = useUiStore((state) => state.setLastLLMProviderId);
  const providers = useLLMProvidersQuery();
  const sessions = useChatSessionsQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useChatSessionQuery(selectedId);
  const [providerId, setProviderId] = useState('');
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<StreamDraft | null>(null);
  const [failure, setFailure] = useState<StreamFailure | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const enabledProviders = useMemo(
    () => (providers.data?.items ?? []).filter((provider) => provider.enabled),
    [providers.data?.items],
  );
  const session = detail.data ?? null;
  const messages = useMemo(() => session?.messages ?? [], [session?.messages]);

  useEffect(() => {
    const preferred = session?.provider_id && enabledProviders.some((provider) => provider.id === session.provider_id)
      ? session.provider_id
      : (enabledProviders.find((provider) => provider.id === lastProviderId) ?? enabledProviders[0])?.id ?? '';
    setProviderId(preferred);
  }, [session?.id, session?.provider_id, enabledProviders, lastProviderId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, draft?.content]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const refreshSessions = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.chatSessions });
    if (selectedId) queryClient.invalidateQueries({ queryKey: queryKeys.chatSession(selectedId) });
  };

  const updateBinding = useMutation({
    mutationFn: (patch: { task_id?: string | null; provider_id?: string | null }) => apiClient.updateChatSession(selectedId!, patch),
    onSuccess: () => refreshSessions(),
    onError: (error) => toast.error(t('chat.bindFailed'), toastErrorMessage(error)),
  });

  const removeSession = useMutation({
    mutationFn: (id: string) => apiClient.deleteChatSession(id),
    onSuccess: (_result, id) => {
      if (selectedId === id) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.chatSessions });
    },
    onError: (error) => toast.error(t('chat.deleteFailed'), toastErrorMessage(error)),
  });

  const send = async () => {
    const content = input.trim();
    if (!content || draft) return;
    setFailure(null);
    let sessionId = selectedId;
    if (!sessionId) {
      try {
        const created = await apiClient.createChatSession({ provider_id: providerId || null });
        sessionId = created.id;
        setSelectedId(created.id);
      } catch (error) {
        toast.error(t('chat.sendFailed'), toastErrorMessage(error));
        return;
      }
    } else if (session?.provider_id !== providerId && providerId) {
      try {
        await apiClient.updateChatSession(sessionId, { provider_id: providerId });
      } catch (error) {
        toast.error(t('chat.bindFailed'), toastErrorMessage(error));
        return;
      }
    }
    setInput('');
    const controller = new AbortController();
    abortRef.current = controller;
    setDraft({ sessionId, userContent: content, content: '' });
    try {
      await apiClient.streamChatMessage(sessionId, content, {
        signal: controller.signal,
        onDelta: (delta) => setDraft((current) => current ? { ...current, content: current.content + delta } : current),
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setFailure(error instanceof ChatStreamError
          ? { code: error.code, message: error.message }
          : { code: 'CHAT_STREAM_FAILED', message: toastErrorMessage(error) });
      }
    } finally {
      abortRef.current = null;
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.chatSessions });
      queryClient.invalidateQueries({ queryKey: queryKeys.chatSession(sessionId) });
    }
  };

  const stop = () => abortRef.current?.abort();

  if (!providers.isLoading && enabledProviders.length === 0) {
    return (
      <Panel className="min-w-0 overflow-hidden">
        <PanelHeader eyebrow={t('chat.eyebrow')} title={t('chat.title')} description={t('chat.description')} />
        {providers.error ? (
          <div className="p-4"><ErrorState error={providers.error} /></div>
        ) : (
          <EmptyState
            title={t('chat.noProviders')}
            body={t('chat.noProvidersBody')}
            icon={<Settings2 className="size-5" />}
            action={<Button asChild><Link to="/settings" search={{ tab: 'llm' }}>{t('chat.configureProvider')}</Link></Button>}
          />
        )}
      </Panel>
    );
  }

  const streaming = draft !== null;
  const boundTask = session?.task_id ? tasks.find((task) => task.id === session.task_id) : undefined;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Panel className="min-w-0 overflow-hidden lg:sticky lg:top-0 lg:max-h-[calc(100dvh-150px)]">
        <PanelHeader title={t('chat.sessionsTitle')} description={t('chat.sessionsDescription')} />
        <div className="border-b app-border p-2">
          <Button variant="secondary" className="w-full" disabled={streaming} onClick={() => setSelectedId(null)}>
            <MessageSquarePlus className="size-4" />{t('chat.newSession')}
          </Button>
        </div>
        {sessions.error && <div className="p-3"><ErrorState error={sessions.error} /></div>}
        {sessions.isSuccess && sessions.data.items.length === 0 && (
          <EmptyState title={t('chat.noSessions')} body={t('chat.noSessionsBody')} icon={<BrainCircuit className="size-5" />} />
        )}
        <div className="grid max-h-[440px] gap-1 overflow-auto p-2 lg:max-h-[calc(100dvh-310px)]">
          {(sessions.data?.items ?? []).map((item) => {
            const active = item.id === selectedId;
            return (
              <div
                key={item.id}
                className={cn(
                  'group flex min-w-0 items-center gap-1 rounded-lg border transition',
                  active ? 'border-[color:var(--app-accent)] bg-[var(--app-accent-soft)]' : 'border-transparent hover:border-[var(--app-border)] hover:bg-[var(--app-control)]',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  aria-pressed={active}
                  className="grid min-w-0 flex-1 gap-1 px-3 py-2 text-left focus:outline-none"
                >
                  <span className="truncate text-sm font-medium text-app">{item.title || t('chat.untitled')}</span>
                  <span className="text-xs text-app-muted">{formatDate(item.updated_at)}</span>
                </button>
                <ConfirmAction
                  title={t('chat.deleteTitle')}
                  description={t('chat.deleteDescription')}
                  confirmLabel={t('chat.deleteConfirm')}
                  onConfirm={() => removeSession.mutate(item.id)}
                >
                  <Button size="sm" variant="ghost" aria-label={t('chat.deleteConfirm')} className="opacity-0 transition group-hover:opacity-100 focus:opacity-100">
                    <Trash2 className="size-4" />
                  </Button>
                </ConfirmAction>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <div className="grid gap-3 border-b app-border p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              value={providerId}
              onValueChange={(value) => {
                setProviderId(value);
                setLastProviderId(value);
                if (selectedId) updateBinding.mutate({ provider_id: value });
              }}
              placeholder={t('chat.chooseProvider')}
              aria-label={t('chat.chooseProvider')}
              options={enabledProviders.map((provider) => ({
                value: provider.id,
                label: `${provider.name} · ${provider.default_model ?? ''}`,
              }))}
            />
            <Select
              value={session?.task_id ?? ''}
              onValueChange={(value) => selectedId && updateBinding.mutate({ task_id: value || null })}
              disabled={!session}
              placeholder={t('chat.bindTask')}
              aria-label={t('chat.bindTask')}
              options={[
                { value: '', label: t('chat.noTask') },
                ...tasks.map((task) => ({ value: task.id, label: task.filename })),
              ]}
            />
          </div>
          <p className="text-xs text-app-muted">
            {session?.task_id
              ? t('chat.boundTaskHint', { name: boundTask?.filename ?? session.task_id })
              : t('chat.qaOnlyHint')}
          </p>
        </div>

        <div ref={scrollRef} className="grid max-h-[calc(100dvh-360px)] min-h-[300px] content-start gap-3 overflow-auto p-4">
          {detail.error && <ErrorState error={detail.error} />}
          {!session && !streaming && (
            <EmptyState title={t('chat.startTitle')} body={t('chat.startBody')} icon={<MessageSquarePlus className="size-5" />} />
          )}
          {session && messages.length === 0 && !streaming && (
            <EmptyState title={t('chat.emptyTitle')} body={t('chat.emptyBody')} icon={<BrainCircuit className="size-5" />} />
          )}
          {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
          {streaming && (
            <div className="grid gap-3">
              <div className="max-w-[85%] justify-self-end rounded-lg border border-[color:var(--app-accent)]/40 bg-[var(--app-accent-soft)] px-3 py-2">
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-app">{draft.userContent}</p>
              </div>
              <div className="max-w-[85%] justify-self-start rounded-lg border app-border bg-[var(--app-control)] px-3 py-2">
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-app">
                  {draft.content || t('chat.thinking')}
                  <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-[var(--app-accent)] align-middle" />
                </p>
              </div>
            </div>
          )}
          {failure && (
            <div className="rounded-lg border border-[color:var(--app-danger)]/40 bg-[var(--app-danger)]/10 px-3 py-2 text-xs leading-5 text-app">
              <p className="font-semibold">{chatErrorTitle(failure.code, t)}</p>
              <p className="mt-1 break-words font-mono opacity-80">{failure.code}: {failure.message}</p>
            </div>
          )}
        </div>

        <div className="grid gap-2 border-t app-border p-4">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={t('chat.inputPlaceholder')}
            rows={2}
            disabled={streaming}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs text-app-muted">
              {session?.task_id && <><FileAudio className="size-3" />{boundTask?.filename ?? ''}</>}
            </span>
            {streaming ? (
              <Button variant="secondary" onClick={stop}><Square className="size-4" />{t('chat.stop')}</Button>
            ) : (
              <Button disabled={!input.trim() || !providerId} onClick={() => void send()}>
                <Send className="size-4" />{t('chat.send')}
              </Button>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useI18n();
  if (!message.content) return null;
  const isUser = message.role === 'user';
  return (
    <div className={cn('grid max-w-[85%] gap-1', isUser ? 'justify-self-end' : 'justify-self-start')}>
      <div className={cn(
        'rounded-lg border px-3 py-2',
        isUser
          ? 'border-[color:var(--app-accent)]/40 bg-[var(--app-accent-soft)]'
          : 'app-border bg-[var(--app-control)]',
      )}>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-app">{message.content}</p>
      </div>
      <div className={cn('flex items-center gap-2 text-xs text-app-muted', isUser && 'justify-end')}>
        {message.status === 'partial' && <Badge tone="neutral">{t('chat.partialBadge')}</Badge>}
        {message.status === 'error' && <Badge tone="danger">{t('chat.errorBadge')}</Badge>}
        {message.created_at && <span>{formatDate(message.created_at)}</span>}
      </div>
    </div>
  );
}

function chatErrorTitle(code: string, t: ReturnType<typeof useI18n>['t']) {
  const normalized = code.toUpperCase();
  if (normalized.includes('AUTH') || normalized.includes('API_KEY')) return t('proofreading.errorAuthTitle');
  if (normalized.includes('RATE_LIMIT')) return t('proofreading.errorRateTitle');
  if (normalized.includes('TIMEOUT')) return t('proofreading.errorTimeoutTitle');
  if (normalized.includes('CONTEXT') || normalized.includes('TOO_LONG')) return t('proofreading.errorContextTitle');
  if (normalized.includes('PARAMETERS_REJECTED') || normalized.includes('FORMAT_UNSUPPORTED')) return t('proofreading.errorCompatibilityTitle');
  if (normalized.includes('UNAVAILABLE') || normalized.includes('NETWORK')) return t('proofreading.errorNetworkTitle');
  if (normalized.includes('PROVIDER_REQUIRED')) return t('chat.noProviders');
  return t('proofreading.errorUnknownTitle');
}

import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BrainCircuit, CheckCircle2, HardDrive, ListPlus, Loader2, Pencil, Plus, TestTube2, Trash2, Wifi, XCircle } from 'lucide-react';
import { apiClient, type LLMProvider, type LLMProviderPreset, type LLMCompatibility, type LLMProviderTestResult } from '../../lib/api';
import { queryKeys, useLLMProviderPresetsQuery, useLLMProvidersQuery } from '../../lib/queries';
import { Badge, Button, Dialog, DialogContent, DialogTrigger, EmptyState, ErrorState, Field, Input, Panel, PanelHeader, Select, Switch } from '../weiui';
import { ConfirmAction } from '../ConfirmAction';
import { BrandIcon } from '../BrandIcon';
import { toastErrorMessage, useToast } from '../Toast';
import { LLMCompatibilityFields, LLMCapabilityPanel, defaultCompatibility } from './LLMCompatibility';
import { useI18n } from '../../lib/i18n';

type FormState = {
  compatibility: LLMCompatibility;
  name: string;
  preset: LLMProviderPreset['id'];
  base_url: string;
  api_key: string;
  default_model: string;
  enabled: boolean;
};

const emptyForm: FormState = {
  compatibility: defaultCompatibility,
  name: '',
  preset: 'deepseek',
  base_url: 'https://api.deepseek.com',
  api_key: '',
  default_model: '',
  enabled: true,
};

export function LLMProvidersPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const providers = useLLMProvidersQuery();
  const presets = useLLMProviderPresetsQuery();
  const [testResults, setTestResults] = useState<Record<string, LLMProviderTestResult>>({});
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const providerItems = providers.data?.items ?? [];
  const selectedProvider = providerItems.find((provider) => provider.id === selectedProviderId) ?? providerItems[0] ?? null;

  useEffect(() => {
    if (!selectedProviderId && providerItems[0]) setSelectedProviderId(providerItems[0].id);
    if (selectedProviderId && !providerItems.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(providerItems[0]?.id ?? null);
    }
  }, [providerItems, selectedProviderId]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.llmProviders });
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.deleteLLMProvider(id),
    onSuccess: () => {
      refresh();
      toast.success(t('llmProviders.deleted'));
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const test = useMutation({
    mutationFn: (id: string) => apiClient.testLLMProvider(id).then((result) => ({ id, result })),
    onSuccess: ({ id, result }) => {
      setTestResults((current) => ({ ...current, [id]: result }));
      if (result.ok) toast.success(t('llmProviders.testPassed'), result.message);
      else toast.error(t('llmProviders.testFailed'), result.message);
    },
    onError: (error, id) => {
      const message = toastErrorMessage(error);
      setTestResults((current) => ({ ...current, [id]: { ok: false, message } }));
      toast.error(t('llmProviders.testFailed'), message);
    },
  });

  const handleSaved = (saved?: LLMProvider, result?: LLMProviderTestResult) => {
    refresh();
    if (saved && result) setTestResults((current) => ({ ...current, [saved.id]: result }));
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_410px]">
      <Panel className="overflow-hidden">
        <PanelHeader
          eyebrow={t('llmProviders.eyebrow')}
          title={t('llmProviders.title')}
          description={t('llmProviders.description')}
          action={
            <LLMProviderDialog presets={presets.data?.items ?? []} onSaved={handleSaved}>
              <Button size="sm"><Plus className="size-4" />{t('llmProviders.add')}</Button>
            </LLMProviderDialog>
          }
        />
        {(providers.error || presets.error) && <div className="p-4"><ErrorState error={providers.error ?? presets.error} /></div>}
        {providerItems.length > 0 ? (
          <div className="product-table-head grid grid-cols-[minmax(220px,1.2fr)_minmax(160px,0.8fr)_120px_110px] gap-3 px-5 py-3 text-xs font-semibold text-app-muted">
            <span>{t('providers.name')}</span><span>{t('providers.defaultModel')}</span><span>{t('llmProviders.runtime')}</span><span>{t('common.status')}</span>
          </div>
        ) : null}
        {providerItems.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => setSelectedProviderId(provider.id)}
            className={`grid w-full grid-cols-[minmax(220px,1.2fr)_minmax(160px,0.8fr)_120px_110px] items-center gap-3 border-t app-border px-5 py-4 text-left transition ${selectedProvider?.id === provider.id ? 'bg-[var(--app-accent-soft)]' : 'hover:bg-[var(--app-bg-soft)]'}`}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border app-control"><BrandIcon name={`${provider.preset} ${provider.name}`} /></span>
              <span className="min-w-0"><strong className="block truncate text-sm font-semibold text-app">{provider.name}</strong><span className="mt-1 block truncate text-xs text-app-muted">{provider.base_url}</span></span>
            </span>
            <span className="truncate text-xs text-app-muted">{provider.default_model || t('llmProviders.modelMissing')}</span>
            <span><Badge tone={provider.is_local ? 'success' : 'warning'}>{provider.is_local ? <HardDrive className="mr-1 size-3" /> : <Wifi className="mr-1 size-3" />}{provider.is_local ? t('llmProviders.local') : t('llmProviders.thirdParty')}</Badge></span>
            <span><Badge tone={provider.enabled ? 'success' : 'neutral'}>{provider.enabled ? t('common.enabled') : t('common.disabled')}</Badge></span>
          </button>
        ))}
        {providerItems.length === 0 && !providers.isLoading && <div className="p-4"><EmptyState title={t('llmProviders.empty')} body={t('llmProviders.emptyBody')} icon={<BrainCircuit className="size-5" />} /></div>}
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader eyebrow={t('llmProviders.eyebrow')} title={selectedProvider?.name ?? t('llmProviders.title')} description={selectedProvider?.base_url ?? t('llmProviders.description')} />
        {selectedProvider ? (
          <article className="grid gap-4 p-5">
            <div className="grid gap-3 rounded-xl border app-border p-4 text-sm">
              <ProviderMeta label={t('providers.defaultModel')} value={selectedProvider.default_model || t('llmProviders.modelMissing')} />
              <ProviderMeta label={t('providers.apiKey')} value={selectedProvider.api_key_masked ?? t('providers.notSet')} />
              <ProviderMeta label={t('llmProviders.runtime')} value={selectedProvider.is_local ? t('llmProviders.local') : t('llmProviders.thirdParty')} />
            </div>
            {testResults[selectedProvider.id] ? (
              <p className={testResults[selectedProvider.id].ok
                ? 'flex items-start gap-2 rounded-xl border border-[color:var(--app-success)] bg-[var(--app-success-soft)] px-3 py-2 text-xs text-[var(--app-success)]'
                : 'flex items-start gap-2 rounded-xl border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-3 py-2 text-xs text-[var(--app-danger)]'}>
                {testResults[selectedProvider.id].ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
                <span className="break-words">{testResults[selectedProvider.id].message}</span>
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => test.mutate(selectedProvider.id)} disabled={test.isPending && test.variables === selectedProvider.id}>
                {test.isPending && test.variables === selectedProvider.id ? <Loader2 className="size-4 animate-spin" /> : <TestTube2 className="size-4" />}{test.isPending && test.variables === selectedProvider.id ? t('llmProviders.testing') : t('llmProviders.testConnection')}
              </Button>
              <LLMProviderDialog provider={selectedProvider} presets={presets.data?.items ?? []} onSaved={handleSaved}>
                <Button variant="secondary"><Pencil className="size-4" />{t('common.edit')}</Button>
              </LLMProviderDialog>
            </div>
            <LLMCapabilityPanel provider={selectedProvider} onSaved={refresh} />
            <ConfirmAction title={t('confirm.deleteTitle')} description={t('llmProviders.deleteDescription')} confirmLabel={t('common.delete')} onConfirm={() => remove.mutate(selectedProvider.id)}>
              <Button variant="danger"><Trash2 className="size-4" />{t('common.delete')}</Button>
            </ConfirmAction>
          </article>
        ) : <div className="p-5 text-sm text-app-muted">{t('llmProviders.emptyBody')}</div>}
      </Panel>
    </section>
  );
}

function ProviderMeta({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 border-b app-border pb-3 last:border-b-0 last:pb-0"><span className="text-xs font-medium text-app-muted">{label}</span><span className="break-all text-app">{value}</span></div>;
}

function LLMProviderDialog({
  children,
  provider,
  presets,
  onSaved,
}: {
  children: ReactNode;
  provider?: LLMProvider;
  presets: LLMProviderPreset[];
  onSaved: (provider?: LLMProvider, result?: LLMProviderTestResult) => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={provider ? t('llmProviders.edit') : t('llmProviders.add')}>
        <LLMProviderForm provider={provider} presets={presets} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}

function LLMProviderForm({ provider, presets, onSaved }: {
  provider?: LLMProvider;
  presets: LLMProviderPreset[];
  onSaved: (provider?: LLMProvider, result?: LLMProviderTestResult) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);

  useEffect(() => {
    if (!provider) return;
    setForm({
      compatibility: provider.compatibility ?? defaultCompatibility,
      name: provider.name,
      preset: provider.preset,
      base_url: provider.base_url,
      api_key: '',
      default_model: provider.default_model ?? '',
      enabled: provider.enabled,
    });
  }, [provider]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        compatibility: form.compatibility,
        name: form.name.trim(),
        preset: form.preset,
        base_url: form.base_url.trim(),
        api_key: form.api_key || undefined,
        default_model: form.default_model.trim() || null,
        enabled: form.enabled,
      };
      return provider ? apiClient.updateLLMProvider(provider.id, payload) : apiClient.createLLMProvider(payload);
    },
    onSuccess: async (saved) => {
      onSaved(saved);
      toast.success(provider ? t('llmProviders.saved') : t('llmProviders.created'), t('llmProviders.savedTesting'));
      try {
        const result = await apiClient.testLLMProvider(saved.id);
        onSaved(saved, result);
        if (result.ok) toast.success(t('llmProviders.testPassed'), result.message);
        else toast.error(t('llmProviders.testFailed'), result.message);
      } catch (error) {
        const result = { ok: false, message: toastErrorMessage(error) };
        onSaved(saved, result);
        toast.error(t('llmProviders.testFailed'), result.message);
      }
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });

  const selectPreset = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    setFetchedModels(null);
    setForm((current) => ({
      ...current,
      preset: preset.id,
      name: provider ? current.name : preset.name,
      base_url: preset.base_url,
    }));
  };

  const fetchModels = useMutation({
    mutationFn: () =>
      apiClient.fetchLLMProviderModels({
        preset: form.preset,
        base_url: form.base_url.trim(),
        api_key: form.api_key || undefined,
        provider_id: provider?.id,
      }),
    onSuccess: (result) => {
      if (result.ok) {
        setFetchedModels(result.items);
      } else {
        setFetchedModels(null);
        toast.error(t('llmProviders.fetchModelsFailed'), result.message);
      }
    },
    onError: (error) => {
      setFetchedModels(null);
      toast.error(t('llmProviders.fetchModelsFailed'), toastErrorMessage(error));
    },
  });
  const localEndpoint = isLoopback(form.base_url);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Field label={t('llmProviders.preset')}>
        <Select value={form.preset} onValueChange={selectPreset} options={presets.map((item) => ({ value: item.id, label: item.name }))} />
      </Field>
      <Field label={t('providers.name')}><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label={t('providers.baseUrl')}>
        <Input
          required
          type="url"
          value={form.base_url}
          onChange={(event) => {
            setFetchedModels(null);
            setForm({ ...form, base_url: event.target.value });
          }}
        />
      </Field>
      <p className="flex items-start gap-2 rounded-lg border app-border px-3 py-2 text-xs leading-5 text-app-muted">
        {localEndpoint ? <HardDrive className="mt-0.5 size-4 shrink-0" /> : <Wifi className="mt-0.5 size-4 shrink-0" />}
        {localEndpoint ? t('llmProviders.localDisclosure') : t('llmProviders.remoteDisclosure')}
      </p>
      <Field label={t('providers.defaultModel')}>
        <div className="flex gap-2">
          <Input required className="flex-1" value={form.default_model} onChange={(event) => setForm({ ...form, default_model: event.target.value })} />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={fetchModels.isPending || !form.base_url.trim()}
            onClick={() => fetchModels.mutate()}
          >
            {fetchModels.isPending ? <Loader2 className="size-4 animate-spin" /> : <ListPlus className="size-4" />}
            {fetchModels.isPending ? t('llmProviders.fetchingModels') : t('llmProviders.fetchModels')}
          </Button>
        </div>
        {fetchedModels && fetchedModels.length > 0 ? (
          <div className="mt-2">
            <Select
              value="__none__"
              onValueChange={(value) => {
                if (value !== '__none__') setForm((current) => ({ ...current, default_model: value }));
              }}
              options={[
                { value: '__none__', label: t('llmProviders.pickModel') },
                ...fetchedModels.map((model) => ({ value: model, label: model })),
              ]}
            />
          </div>
        ) : null}
        {fetchedModels && fetchedModels.length === 0 ? (
          <p className="mt-2 text-xs text-app-muted">{t('llmProviders.noModelsFound')}</p>
        ) : null}
      </Field>
      <Field label={t('providers.apiKey')} hint={provider ? t('providers.keepKey') : undefined}>
        <Input type="password" value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} />
      </Field>
      <div className="flex items-center justify-between rounded-lg border app-control px-3 py-2">
        <span className="text-sm text-app-soft">{t('providers.enabled')}</span>
        <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
      </div>
      <LLMCompatibilityFields value={form.compatibility} onChange={(compatibility) => setForm({ ...form, compatibility })} />
      {mutation.error && <ErrorState error={mutation.error} />}
      <Button disabled={mutation.isPending}>
        {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
        {provider ? t('common.save') : t('common.create')}
      </Button>
    </form>
  );
}

function isLoopback(value: string) {
  try {
    const hostname = new URL(value).hostname.replace(/^\[|\]$/g, '');
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

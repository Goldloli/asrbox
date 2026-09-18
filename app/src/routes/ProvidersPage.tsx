import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { BrandIcon } from '../components/BrandIcon';
import { apiClient, type Provider } from '../lib/api';
import { queryKeys, useProvidersQuery, useSettingsQuery } from '../lib/queries';
import { Badge, Button, Dialog, DialogContent, DialogTrigger, EmptyState, ErrorState, Field, Input, Panel, PanelHeader, Select, Switch } from '../components/weiui';
import { toastErrorMessage, useToast } from '../components/Toast';
import { ConfirmAction } from '../components/ConfirmAction';
import { useI18n } from '../lib/i18n';

type ProviderFormState = {
  name: string;
  provider_type: string;
  base_url: string;
  api_key: string;
  default_model: string;
  enabled: boolean;
};

const emptyForm: ProviderFormState = {
  name: '',
  provider_type: 'custom',
  base_url: '',
  api_key: '',
  default_model: '',
  enabled: true,
};

export function ProvidersPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  const providersQuery = useProvidersQuery();
  const settingsQuery = useSettingsQuery();
  const [testMessage, setTestMessage] = useState('');
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const providerItems = providersQuery.data?.items ?? [];
  const selectedProvider = providerItems.find((provider) => provider.id === selectedProviderId) ?? providerItems[0] ?? null;

  useEffect(() => {
    if (!selectedProviderId && providerItems[0]) setSelectedProviderId(providerItems[0].id);
    if (selectedProviderId && !providerItems.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(providerItems[0]?.id ?? null);
    }
  }, [providerItems, selectedProviderId]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.providers });
    queryClient.invalidateQueries({ queryKey: queryKeys.settings });
  };

  const remove = useMutation({
    mutationFn: apiClient.deleteProvider.bind(apiClient),
    onSuccess: () => {
      refresh();
      toast.success(t('toast.providerDeleted'));
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const test = useMutation({
    mutationFn: (providerId: string) => apiClient.testProvider(providerId),
    onSuccess: (result) => {
      setTestMessage(result.message);
      toast.success(t('toast.providerTestComplete'), result.message);
    },
    onError: (error) => {
      setTestMessage(toastErrorMessage(error));
      toast.error(t('toast.providerTestFailed'), toastErrorMessage(error));
    },
  });
  const setDefault = useMutation({
    mutationFn: (providerId: string) => apiClient.updateSettings({ default_backend: 'provider', default_provider_id: providerId }),
    onSuccess: () => {
      refresh();
      toast.success(t('toast.defaultProviderSaved'));
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <Panel className="overflow-hidden">
        <PanelHeader
          eyebrow={t('providers.eyebrow')}
          title={t('providers.title')}
          description={t('providers.description')}
          action={
            <ProviderDialog onSaved={refresh}>
              <Button size="sm">
                <Plus className="size-4" />
                {t('providers.addProvider')}
              </Button>
            </ProviderDialog>
          }
        />
        <div>
          {providersQuery.error && <ErrorState title={t('common.unableToLoad')} error={providersQuery.error} />}
          {providerItems.length > 0 ? (
            <div className="product-table-head grid grid-cols-[minmax(220px,1.2fr)_minmax(220px,1fr)_110px_110px] gap-3 px-5 py-3 text-xs font-semibold text-app-muted">
              <span>{t('providers.name')}</span>
              <span>{t('providers.baseUrl')}</span>
              <span>{t('common.status')}</span>
              <span>{t('common.actions')}</span>
            </div>
          ) : null}
          {providerItems.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => setSelectedProviderId(provider.id)}
              className={`grid w-full grid-cols-[minmax(220px,1.2fr)_minmax(220px,1fr)_110px_110px] items-center gap-3 border-t app-border px-5 py-4 text-left transition ${selectedProvider?.id === provider.id ? 'bg-[var(--app-accent-soft)]' : 'hover:bg-[var(--app-bg-soft)]'}`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border app-control text-app-accent">
                  <BrandIcon name={`${provider.provider_type} ${provider.name}`} />
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-semibold text-app">{provider.name}</strong>
                  <span className="mt-1 block truncate text-xs text-app-muted">{provider.provider_type}</span>
                </span>
              </span>
              <span className="truncate text-xs text-app-muted">{provider.base_url ?? t('providers.builtIn')}</span>
              <span><Badge tone={provider.enabled ? 'success' : 'neutral'}>{provider.enabled ? t('common.enabled') : t('common.disabled')}</Badge></span>
              <span>{settingsQuery.data?.default_provider_id === provider.id ? <Badge tone="accent">{t('common.default')}</Badge> : <span className="text-xs text-app-muted">—</span>}</span>
            </button>
          ))}
          {providerItems.length === 0 && (
            <EmptyState
              title={t('providers.noProviders')}
              action={
                <ProviderDialog onSaved={refresh}>
                  <Button>
                    <Plus className="size-4" />
                    {t('providers.addProvider')}
                  </Button>
                </ProviderDialog>
              }
            />
          )}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader eyebrow={t('providers.eyebrow')} title={selectedProvider?.name ?? t('providers.testResult')} description={t('providers.testDescription')} />
        {selectedProvider ? (
          <div className="grid gap-5 p-5">
            <div className="grid gap-3 rounded-xl border app-border p-4 text-sm">
              <ProviderDetail label={t('providers.type')} value={selectedProvider.provider_type} />
              <ProviderDetail label={t('providers.baseUrl')} value={selectedProvider.base_url ?? t('providers.builtIn')} />
              <ProviderDetail label={t('providers.defaultModel')} value={selectedProvider.default_model ?? t('providers.notSet')} />
              <ProviderDetail label={t('providers.apiKey')} value={selectedProvider.api_key_masked ?? t('providers.notSet')} />
            </div>
            <div className="grid gap-2">
              <Button onClick={() => test.mutate(selectedProvider.id)}>{t('common.test')}</Button>
              <Button variant="secondary" onClick={() => setDefault.mutate(selectedProvider.id)}>
                <CheckCircle2 className="size-4" />{t('common.default')}
              </Button>
              <ProviderDialog provider={selectedProvider} onSaved={refresh} openProvider={editingProvider} setOpenProvider={setEditingProvider}>
                <Button variant="secondary" onClick={() => setEditingProvider(selectedProvider)}><Pencil className="size-4" />{t('common.edit')}</Button>
              </ProviderDialog>
              <ConfirmAction title={t('confirm.deleteTitle')} description={t('confirm.deleteProviderDescription')} confirmLabel={t('common.delete')} onConfirm={() => remove.mutate(selectedProvider.id)}>
                <Button variant="danger"><Trash2 className="size-4" />{t('common.delete')}</Button>
              </ConfirmAction>
            </div>
            {testMessage ? (
              <p className="rounded-xl border border-[color:var(--app-accent)] bg-[var(--app-accent-soft)] px-4 py-3 text-sm leading-6 text-app-accent">{testMessage}</p>
            ) : <p className="text-sm leading-6 text-app-muted">{t('providers.testEmpty')}</p>}
            {(test.error || setDefault.error || remove.error) && <ErrorState title={t('common.unableToLoad')} error={test.error ?? setDefault.error ?? remove.error} />}
          </div>
        ) : <div className="p-5"><p className="text-sm text-app-muted">{t('providers.testEmpty')}</p></div>}
      </Panel>
    </section>
  );
}

function ProviderDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b app-border pb-3 last:border-b-0 last:pb-0">
      <span className="text-xs font-medium text-app-muted">{label}</span>
      <span className="break-all text-sm text-app">{value}</span>
    </div>
  );
}

function ProviderDialog({
  children,
  provider,
  onSaved,
  openProvider,
  setOpenProvider,
}: {
  children: React.ReactNode;
  provider?: Provider;
  onSaved: () => void;
  openProvider?: Provider | null;
  setOpenProvider?: (provider: Provider | null) => void;
}) {
  const { t } = useI18n();
  const controlledOpen = provider ? openProvider?.id === provider.id : undefined;
  return (
    <Dialog open={controlledOpen} onOpenChange={(open) => provider && setOpenProvider?.(open ? provider : null)}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={provider ? t('providers.editProvider') : t('providers.addProvider')}>
        <ProviderForm provider={provider} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}

function ProviderForm({ provider, onSaved }: { provider?: Provider; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<ProviderFormState>(emptyForm);

  useEffect(() => {
    if (!provider) return;
    setForm({
      name: provider.name,
      provider_type: provider.provider_type,
      base_url: provider.base_url ?? '',
      api_key: '',
      default_model: provider.default_model ?? '',
      enabled: provider.enabled,
    });
  }, [provider]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        provider_type: form.provider_type,
        base_url: form.base_url || null,
        api_key: form.api_key || undefined,
        default_model: form.default_model || null,
        enabled: form.enabled,
      };
      return provider ? apiClient.updateProvider(provider.id, payload) : apiClient.createProvider(payload);
    },
    onSuccess: () => {
      if (!provider) setForm(emptyForm);
      onSaved();
      toast.success(provider ? t('toast.providerSaved') : t('toast.providerCreated'));
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Field label={t('providers.name')}>
        <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      </Field>
      <Field label={t('providers.type')}>
        <Select
          value={form.provider_type}
          onValueChange={(value) => setForm({ ...form, provider_type: value })}
          options={[
            { value: 'custom', label: t('providers.typeGeneric') },
            { value: 'openai-compatible', label: t('providers.typeOpenAI') },
            { value: 'aliyun', label: t('providers.typeAliyun') },
          ]}
        />
      </Field>
      <Field label={t('providers.baseUrl')}>
        <Input value={form.base_url} onChange={(event) => setForm({ ...form, base_url: event.target.value })} />
      </Field>
      <Field label={t('providers.apiKey')} hint={provider ? t('providers.keepKey') : undefined}>
        <Input type="password" value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} />
      </Field>
      <Field label={t('providers.defaultModel')}>
        <Input value={form.default_model} onChange={(event) => setForm({ ...form, default_model: event.target.value })} />
      </Field>
      <div className="flex items-center justify-between rounded-lg border app-control px-3 py-2">
        <span className="text-sm text-app-soft">{t('providers.enabled')}</span>
        <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
      </div>
      {mutation.error && <ErrorState title={t('common.unableToLoad')} error={mutation.error} />}
      <Button disabled={mutation.isPending}>{provider ? t('providers.saveProvider') : t('providers.createProvider')}</Button>
    </form>
  );
}

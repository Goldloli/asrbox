import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiClient, type Provider } from '../lib/api';
import { queryKeys, useProvidersQuery, useSettingsQuery } from '../lib/queries';
import { Badge, Button, Dialog, DialogContent, DialogTrigger, ErrorState, Field, Input, Panel, PanelHeader, Select, Switch } from '../components/weiui';
import { toastErrorMessage, useToast } from '../components/Toast';
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
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
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
        <div className="grid gap-3 p-4">
          {providersQuery.error && <ErrorState title={t('common.unableToLoad')} error={providersQuery.error} />}
          {(providersQuery.data?.items ?? []).map((provider) => (
            <article key={provider.id} className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                <div className="flex min-w-0 gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-amber-200">
                    <Activity className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-zinc-100">{provider.name}</h2>
                    <p className="mt-1 truncate text-xs text-zinc-500">
                      {provider.provider_type} · {provider.base_url ?? t('providers.builtIn')} · {t('providers.apiKey')} {provider.api_key_masked ?? t('providers.notSet')}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Badge tone={provider.enabled ? 'success' : 'neutral'}>{provider.enabled ? t('common.enabled') : t('common.disabled')}</Badge>
                  {settingsQuery.data?.default_provider_id === provider.id && <Badge tone="accent">{t('common.default')}</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => test.mutate(provider.id)}>{t('common.test')}</Button>
                <Button variant="secondary" size="sm" onClick={() => setDefault.mutate(provider.id)}>
                  <CheckCircle2 className="size-4" />
                  {t('common.default')}
                </Button>
                <ProviderDialog provider={provider} onSaved={refresh} openProvider={editingProvider} setOpenProvider={setEditingProvider}>
                  <Button variant="ghost" size="sm" onClick={() => setEditingProvider(provider)}>
                    <Pencil className="size-4" />
                    {t('common.edit')}
                  </Button>
                </ProviderDialog>
                <Button variant="danger" size="sm" onClick={() => remove.mutate(provider.id)}>
                  <Trash2 className="size-4" />
                  {t('common.delete')}
                </Button>
              </div>
            </article>
          ))}
          {(providersQuery.data?.items ?? []).length === 0 && (
            <div className="rounded-xl border border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
              {t('providers.noProviders')}
            </div>
          )}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader eyebrow={t('common.test')} title={t('providers.testResult')} description={t('providers.testDescription')} />
        <div className="grid gap-4 p-5">
          {testMessage ? (
            <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">{testMessage}</p>
          ) : (
            <p className="text-sm leading-6 text-zinc-500">{t('providers.testEmpty')}</p>
          )}
          {(test.error || setDefault.error || remove.error) && (
            <ErrorState title={t('common.unableToLoad')} error={test.error ?? setDefault.error ?? remove.error} />
          )}
        </div>
      </Panel>
    </section>
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
      <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
        <span className="text-sm text-zinc-300">{t('providers.enabled')}</span>
        <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
      </div>
      {mutation.error && <ErrorState title={t('common.unableToLoad')} error={mutation.error} />}
      <Button disabled={mutation.isPending}>{provider ? t('providers.saveProvider') : t('providers.createProvider')}</Button>
    </form>
  );
}

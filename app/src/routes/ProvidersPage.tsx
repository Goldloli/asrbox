import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Plus, Trash2 } from 'lucide-react';
import { apiClient } from '../lib/api';
import { useI18n } from '../lib/i18n';

export function ProvidersPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState('custom');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [testMessage, setTestMessage] = useState('');

  const providersQuery = useQuery({ queryKey: ['providers'], queryFn: () => apiClient.listProviders() });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => apiClient.getSettings() });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['providers'] });
    queryClient.invalidateQueries({ queryKey: ['settings'] });
  };
  const create = useMutation({
    mutationFn: () => apiClient.createProvider({ name, provider_type: providerType, base_url: baseUrl || null, api_key: apiKey || null, default_model: defaultModel || null }),
    onSuccess: () => {
      setName('');
      setBaseUrl('');
      setApiKey('');
      setDefaultModel('');
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: apiClient.deleteProvider.bind(apiClient), onSuccess: refresh });
  const test = useMutation({
    mutationFn: (providerId: string) => apiClient.testProvider(providerId),
    onSuccess: (result) => setTestMessage(result.message),
    onError: (error) => setTestMessage(error.message),
  });
  const setDefault = useMutation({
    mutationFn: (providerId: string) => apiClient.updateSettings({ default_backend: 'provider', default_provider_id: providerId }),
    onSuccess: refresh,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <section className="page split-page">
      <div>
        <header className="page-header">
          <div>
            <p className="eyebrow">{t('providers.eyebrow')}</p>
            <h1>{t('providers.title')}</h1>
          </div>
        </header>

        <div className="list-panel">
          {(providersQuery.data?.items ?? []).map((provider) => (
            <article className="list-row" key={provider.id}>
              <div className="row-leading">
                <Activity size={20} />
                <div>
                  <h2>{provider.name}</h2>
                  <p>{provider.provider_type} · {provider.base_url ?? t('providers.builtIn')} · key {provider.api_key_masked ?? t('providers.notSet')}</p>
                </div>
              </div>
              <div className="chip-line">
                <span className={`chip ${provider.enabled ? 'ok' : ''}`}>{provider.enabled ? t('providers.enabled') : t('providers.disabled')}</span>
                {settingsQuery.data?.default_provider_id === provider.id && <span className="chip ok">{t('common.default')}</span>}
                {provider.default_model && <span className="chip">{provider.default_model}</span>}
              </div>
              <div className="row-actions">
                <button className="secondary-button" onClick={() => test.mutate(provider.id)}>{t('common.test')}</button>
                <button className="secondary-button" onClick={() => setDefault.mutate(provider.id)}>{t('common.default')}</button>
                <button className="icon-button danger" title={t('common.delete')} onClick={() => remove.mutate(provider.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {testMessage && <p className="notice">{testMessage}</p>}
      </div>

      <form className="panel form-panel" onSubmit={submit}>
        <div>
          <p className="eyebrow">{t('providers.add')}</p>
          <h2>{t('providers.customProvider')}</h2>
        </div>
        <label className="field"><span>{t('providers.name')}</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label className="field">
          <span>{t('providers.type')}</span>
          <select value={providerType} onChange={(event) => setProviderType(event.target.value)}>
            <option value="custom">Generic HTTP</option>
            <option value="openai-compatible">OpenAI compatible</option>
            <option value="aliyun">Aliyun ASR</option>
          </select>
        </label>
        <label className="field"><span>{t('providers.baseUrl')}</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
        <label className="field"><span>{t('providers.apiKey')}</span><input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" /></label>
        <label className="field"><span>{t('providers.defaultModel')}</span><input value={defaultModel} onChange={(event) => setDefaultModel(event.target.value)} /></label>
        {create.error && <p className="error">{create.error.message}</p>}
        <button className="primary-button" disabled={create.isPending}><Plus size={17} /> {t('providers.addProvider')}</button>
      </form>
    </section>
  );
}

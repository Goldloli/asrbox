import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadCloud, HardDrive, Loader2, Trash2, XCircle } from 'lucide-react';
import { apiClient, type ModelProgress } from '../lib/api';
import { useI18n } from '../lib/i18n';

export function ModelsPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [trackingModel, setTrackingModel] = useState<string | null>(null);
  const [progressByModel, setProgressByModel] = useState<Record<string, ModelProgress>>({});
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: () => apiClient.listModels(), refetchInterval: 5000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['models'] });
  const download = useMutation({
    mutationFn: (modelName: string) => apiClient.downloadModel(modelName),
    onSuccess: (_result, modelName) => {
      setTrackingModel(modelName);
      refresh();
    },
  });
  const unload = useMutation({ mutationFn: apiClient.unloadModel.bind(apiClient), onSuccess: refresh });
  const remove = useMutation({ mutationFn: apiClient.deleteModel.bind(apiClient), onSuccess: refresh });
  const activeModel = useMemo(
    () => trackingModel ?? (modelsQuery.data?.models ?? []).find((model) => model.downloading)?.model_name ?? null,
    [modelsQuery.data?.models, trackingModel],
  );

  useEffect(() => {
    if (!activeModel) return;

    const eventSource = new EventSource(apiClient.modelProgressUrl(activeModel));
    eventSource.onmessage = (event) => {
      const progress = JSON.parse(event.data) as ModelProgress;
      setProgressByModel((current) => ({ ...current, [activeModel]: progress }));
      if (progress.status === 'complete' || progress.status === 'error') {
        eventSource.close();
        setTrackingModel(null);
        refresh();
      }
    };
    eventSource.onerror = () => {
      eventSource.close();
      setTrackingModel(null);
      refresh();
    };
    return () => eventSource.close();
  }, [activeModel]);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t('models.eyebrow')}</p>
          <h1>{t('models.title')}</h1>
        </div>
      </header>

      <div className="list-panel">
        {(modelsQuery.data?.models ?? []).map((model) => (
          <article className="list-row" key={model.model_name}>
            <div className="row-leading">
              <HardDrive size={20} />
              <div>
                <h2>{model.display_name}</h2>
                <p>{model.engine} · {model.runtime} · {model.model_size} · {model.size_mb} MB</p>
              </div>
            </div>
            <div className="chip-line">
              {model.languages.map((language) => <span className="chip" key={language}>{language}</span>)}
              <span className={`chip ${model.downloaded ? 'ok' : ''}`}>
                {model.downloaded ? t('common.downloaded') : t('common.notDownloaded')}
              </span>
              {model.loaded && <span className="chip ok">{t('common.loaded')}</span>}
            </div>
            <ModelDownloadProgress progress={progressByModel[model.model_name]} error={model.error} />
            <div className="row-actions">
              <button className="secondary-button" onClick={() => download.mutate(model.model_name)} disabled={download.isPending || model.downloading}>
                {model.downloading ? <Loader2 size={16} className="spin" /> : <DownloadCloud size={16} />}
                {model.downloading ? t('models.downloading') : t('common.download')}
              </button>
              <button className="icon-button" title={t('common.unload')} onClick={() => unload.mutate(model.model_name)}>
                <XCircle size={16} />
              </button>
              <button className="icon-button danger" title={t('common.delete')} onClick={() => remove.mutate(model.model_name)}>
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
        {(modelsQuery.data?.models ?? []).length === 0 && <p className="muted table-empty">{t('models.noModels')}</p>}
      </div>
    </section>
  );
}

function ModelDownloadProgress({ progress, error }: { progress?: ModelProgress; error?: string | null }) {
  const { t } = useI18n();
  const visibleError = progress?.status === 'error' ? progress.error : error;
  if (!progress && !visibleError) return null;

  const label =
    progress?.status === 'complete'
      ? t('models.downloadComplete')
      : progress?.status === 'error'
        ? t('models.downloadFailed')
        : progress?.filename || t('models.connecting');

  return (
    <div className="model-progress">
      {visibleError ? (
        <p className="error">{visibleError}</p>
      ) : (
        <>
          <div className="model-progress-meta">
            <span>{label}</span>
            <span>{Math.round(progress?.progress ?? 0)}%</span>
          </div>
          <div className="meter compact"><span style={{ width: `${Math.min(progress?.progress ?? 0, 100)}%` }} /></div>
        </>
      )}
    </div>
  );
}

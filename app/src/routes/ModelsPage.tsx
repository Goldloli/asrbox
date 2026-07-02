import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadCloud, HardDrive, Trash2, XCircle } from 'lucide-react';
import { apiClient } from '../lib/api';

export function ModelsPage() {
  const queryClient = useQueryClient();
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: () => apiClient.listModels(), refetchInterval: 5000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['models'] });
  const download = useMutation({ mutationFn: apiClient.downloadModel.bind(apiClient), onSuccess: refresh });
  const unload = useMutation({ mutationFn: apiClient.unloadModel.bind(apiClient), onSuccess: refresh });
  const remove = useMutation({ mutationFn: apiClient.deleteModel.bind(apiClient), onSuccess: refresh });

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Local runtime</p>
          <h1>Models</h1>
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
              <span className={`chip ${model.downloaded ? 'ok' : ''}`}>{model.downloaded ? 'downloaded' : 'not downloaded'}</span>
              {model.loaded && <span className="chip ok">loaded</span>}
            </div>
            <div className="row-actions">
              <button className="secondary-button" onClick={() => download.mutate(model.model_name)} disabled={download.isPending || model.downloading}>
                <DownloadCloud size={16} /> Download
              </button>
              <button className="icon-button" title="Unload" onClick={() => unload.mutate(model.model_name)}>
                <XCircle size={16} />
              </button>
              <button className="icon-button danger" title="Delete" onClick={() => remove.mutate(model.model_name)}>
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

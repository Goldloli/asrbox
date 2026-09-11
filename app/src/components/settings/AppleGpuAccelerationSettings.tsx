import { useI18n } from '../../lib/i18n';
import { useModelsQuery, useRuntimeQuery } from '../../lib/queries';
import { Badge, Panel, PanelHeader } from '../weiui';

export function AppleGpuAccelerationSettings() {
  const { t } = useI18n();
  const runtimeQuery = useRuntimeQuery();
  const modelsQuery = useModelsQuery();
  const runtime = runtimeQuery.data;
  const gpuModels = (modelsQuery.data?.models ?? []).filter(
    (model) => model.supported_devices.includes('mps') || model.supported_devices.includes('mlx'),
  );

  const availabilityRow = (label: string, available: boolean) => (
    <div className="flex items-center justify-between gap-3 rounded-xl border app-control px-4 py-3">
      <span className="text-sm text-app">{label}</span>
      <Badge tone={available ? 'success' : 'neutral'}>
        {available ? t('settings.appleGpuAvailable') : t('settings.appleGpuUnavailable')}
      </Badge>
    </div>
  );

  return (
    <section className="grid content-start gap-4">
      <Panel className="overflow-hidden">
        <PanelHeader eyebrow={t('settings.system')} title={t('settings.appleGpuTitle')} description={t('settings.appleGpuDescription')} />
        <div className="grid gap-4 p-5">
          {runtime ? (
            <div className="grid gap-2">
              {availabilityRow(t('settings.appleGpuMps'), runtime.torch_mps_available)}
              {availabilityRow(t('settings.appleGpuMlx'), runtime.mlx_whisper_available)}
            </div>
          ) : (
            <p className="text-sm text-app-muted">{t('settings.cudaDetecting')}</p>
          )}

          <div>
            <p className="text-sm font-medium text-app">{t('settings.appleGpuModelsTitle')}</p>
            <p className="mt-1 text-xs text-app-muted">{t('settings.appleGpuAutoNote')}</p>
            <div className="mt-2 grid gap-2">
              {gpuModels.map((model) => (
                <div key={model.model_name} className="flex items-center justify-between gap-3 rounded-xl border app-control px-4 py-2.5">
                  <span className="truncate text-sm text-app">{model.display_name}</span>
                  <span className="flex shrink-0 gap-1">
                    {model.supported_devices.includes('mps') ? <Badge>Metal</Badge> : null}
                    {model.supported_devices.includes('mlx') ? <Badge>MLX</Badge> : null}
                  </span>
                </div>
              ))}
              {gpuModels.length === 0 ? <p className="text-sm text-app-muted">{t('settings.appleGpuModelsEmpty')}</p> : null}
            </div>
          </div>
        </div>
      </Panel>
    </section>
  );
}

export function AccelerationGenericCard() {
  const { t } = useI18n();
  return (
    <section className="grid content-start gap-4">
      <Panel className="overflow-hidden">
        <PanelHeader eyebrow={t('settings.system')} title={t('settings.accelerationGenericTitle')} description={t('settings.accelerationGenericDescription')} />
      </Panel>
    </section>
  );
}

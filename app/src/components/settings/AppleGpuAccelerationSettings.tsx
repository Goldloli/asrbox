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
    <div className="flex min-h-14 items-center justify-between gap-3 border-t app-border px-4 py-3 first:border-t-0">
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
        <div className="grid gap-6 p-5 sm:p-6">
          {runtime ? (
            <div>
              <p className="mb-2 text-base font-bold text-app">{t('settings.appleGpuRuntimeTitle')}</p>
              <div className="overflow-hidden rounded-xl border app-border">
                {availabilityRow(t('settings.appleGpuMps'), runtime.torch_mps_available)}
                {availabilityRow(t('settings.appleGpuMlx'), runtime.mlx_whisper_available)}
              </div>
            </div>
          ) : (
            <p className="text-sm text-app-muted">{t('settings.cudaDetecting')}</p>
          )}

          <div>
            <p className="text-base font-bold text-app">{t('settings.appleGpuModelsTitle')}</p>
            <p className="mt-1 text-xs text-app-muted">{t('settings.appleGpuAutoNote')}</p>
            <div className="mt-3 overflow-hidden rounded-xl border app-border">
              {gpuModels.length > 0 ? <div className="product-table-head grid grid-cols-[minmax(0,1fr)_auto] px-4 py-2.5 text-xs font-semibold text-app-muted"><span>{t('models.modelName')}</span><span>{t('models.capabilities')}</span></div> : null}
              {gpuModels.map((model) => (
                <div key={model.model_name} className="flex min-h-14 items-center justify-between gap-3 border-t app-border px-4 py-2.5">
                  <span className="truncate text-sm font-semibold text-app">{model.display_name}</span>
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
      <Panel className="min-h-[360px] overflow-hidden">
        <PanelHeader eyebrow={t('settings.system')} title={t('settings.accelerationGenericTitle')} description={t('settings.accelerationGenericDescription')} />
        <div className="p-5 sm:p-6">
          <div className="flex min-h-20 items-center justify-between gap-4 rounded-xl border app-border px-5 py-4">
            <div><p className="text-sm font-semibold text-app">{t('settings.accelerationDesktopOnly')}</p><p className="mt-1 text-xs text-app-muted">{t('settings.accelerationDesktopOnlyHint')}</p></div>
            <Badge tone="neutral">Web</Badge>
          </div>
        </div>
      </Panel>
    </section>
  );
}

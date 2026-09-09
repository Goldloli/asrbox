import type { ModelStatus } from './api';
import type { DictionaryKey } from './i18n';

type ModelDevice = ModelStatus['supported_devices'][number];

const deviceLabelKeys: Array<[ModelDevice, DictionaryKey]> = [
  ['cpu', 'models.deviceCpu'],
  ['cuda', 'models.deviceCuda'],
  ['mps', 'models.deviceMps'],
  ['mlx', 'models.deviceMlx'],
];

export function modelDeviceSummaryKey(
  devices: readonly ModelDevice[] | null | undefined,
): DictionaryKey {
  if (!devices?.length) return 'models.deviceSummaryUnknown';
  const hasCpu = devices.includes('cpu');
  const hasGpu = devices.some((device) => device !== 'cpu');
  if (hasCpu && hasGpu) return 'models.deviceSummaryCpuGpu';
  if (hasCpu) return 'models.deviceSummaryCpuOnly';
  if (hasGpu) return 'models.deviceSummaryGpuOnly';
  return 'models.deviceSummaryUnknown';
}

export function modelDeviceLabelKeys(
  devices: readonly ModelDevice[] | null | undefined,
): DictionaryKey[] {
  if (!devices?.length) return ['models.deviceSummaryUnknown'];
  const supported = new Set(devices);
  return deviceLabelKeys
    .filter(([device]) => supported.has(device))
    .map(([, key]) => key);
}

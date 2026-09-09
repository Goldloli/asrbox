import { describe, expect, test } from 'bun:test';
import { modelDeviceLabelKeys, modelDeviceSummaryKey } from './modelDevices';

describe('model device support labels', () => {
  test('summarizes CPU and accelerator support without claiming an active device', () => {
    expect(modelDeviceSummaryKey(['cpu', 'cuda', 'mps'])).toBe('models.deviceSummaryCpuGpu');
    expect(modelDeviceSummaryKey(['cpu'])).toBe('models.deviceSummaryCpuOnly');
    expect(modelDeviceSummaryKey(['mlx'])).toBe('models.deviceSummaryGpuOnly');
  });

  test('returns an unknown summary for absent metadata from an older backend', () => {
    expect(modelDeviceSummaryKey(undefined)).toBe('models.deviceSummaryUnknown');
    expect(modelDeviceSummaryKey([])).toBe('models.deviceSummaryUnknown');
  });

  test('normalizes detailed labels into a stable, deduplicated order', () => {
    expect(modelDeviceLabelKeys(['mps', 'cpu', 'cuda', 'mps', 'mlx'])).toEqual([
      'models.deviceCpu',
      'models.deviceCuda',
      'models.deviceMps',
      'models.deviceMlx',
    ]);
  });
});

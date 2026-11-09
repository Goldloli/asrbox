import { describe, expect, test } from 'bun:test';
import type { ModelStatus } from './api';
import {
  isApproximateTimelineModel,
  isRecommendedModel,
  modelBestFor,
  modelCategory,
  modelDescription,
  modelDetails,
  modelLadder,
} from './modelCatalog';

function graniteSpeech5(overrides: Partial<ModelStatus> = {}): ModelStatus {
  return {
    model_name: 'granite-speech-5.0-2b',
    display_name: 'Granite Speech 5.0 2B',
    engine: 'transformers_speech_lm',
    source: 'modelscope',
    model_size: '2b',
    size_mb: 4817,
    languages: ['en', 'fr', 'de', 'es', 'pt', 'ja'],
    runtime: 'transformers',
    supported_devices: ['cpu', 'cuda'],
    supports_timestamps: false,
    supports_word_timestamps: false,
    supports_diarization: false,
    supports_streaming: false,
    downloaded: false,
    downloading: false,
    loaded: false,
    storage_status: 'available',
    ...overrides,
  };
}

describe('Granite Speech 5.0 catalog entry', () => {
  test('is presented as a speech-LM model without changing the recommended list', () => {
    const model = graniteSpeech5();
    expect(modelCategory(model)).toBe('speechlm');
    expect(isRecommendedModel(model)).toBe(false);
  });

  test('describes six ASR languages, punctuation and the approximate timeline', () => {
    const model = graniteSpeech5();
    expect(modelDescription(model, 'zh')).toContain('日语');
    expect(modelDescription(model, 'zh')).toContain('两分钟');
    expect(modelDescription(model, 'en')).toContain('Japanese');

    const zh = modelDetails(model, 'zh');
    expect(zh.languages).toContain('日');
    expect(zh.languages).toContain('无中文 ASR');
    expect(zh.capabilities).toContain('英法德西葡 + 日语六语种');
    expect(zh.limitations).toContain('无原生时间戳，字幕时间轴为近似值');
    expect(zh.limitations).toContain('不支持中文转写');
    expect(zh.limitations.join(' ')).not.toContain('Apple');
    expect(zh.limitations.join(' ')).not.toContain('MLX');

    const en = modelDetails(model, 'en');
    expect(en.languages).toContain('Japanese');
    expect(en.languages).toContain('no Chinese ASR');
    expect(en.limitations).toContain('No native timestamps; subtitle timeline is approximate');
    expect(en.limitations.join(' ')).not.toContain('Apple');
    expect(en.limitations.join(' ')).not.toContain('MLX');

    expect(modelBestFor(model, 'zh')).toContain('日语');
    expect(modelBestFor(model, 'en')).toContain('Japanese');
  });

  test('uses an estimated ladder entry until a project measurement exists', () => {
    const ladder = modelLadder(graniteSpeech5());
    expect(ladder.estimated).toBe(true);
  });

  test('marks the timeline as approximate and keeps older Granite entries unchanged', () => {
    expect(isApproximateTimelineModel('granite-speech-5.0-2b')).toBe(true);
    expect(isApproximateTimelineModel('granite-speech-4.1-2b')).toBe(true);
    expect(isApproximateTimelineModel('granite-speech-4.1-2b-plus')).toBe(true);
    expect(isApproximateTimelineModel('whisper-base')).toBe(false);
    expect(isApproximateTimelineModel(null)).toBe(false);
  });
});

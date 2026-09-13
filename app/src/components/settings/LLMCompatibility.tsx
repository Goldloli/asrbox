import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient, type LLMProvider, type LLMCompatibility, type LLMCapabilityTestResult } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Button, ErrorState, Field, Select } from '../weiui';

export const defaultCompatibility: LLMCompatibility = { protocol: 'auto', thinking: 'auto', output_format: 'auto', transport: 'json', context_length: null };

const CONTEXT_LENGTH_TIERS = ['8192', '16384', '32768', '65536', '131072'];

export function LLMCompatibilityFields({ value, onChange }: {
  value: LLMCompatibility; onChange: (value: LLMCompatibility) => void;
}) {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const choices = {
    protocol: [['auto', zh ? '按预设或官方地址识别' : 'Use preset or official endpoint'], ['openai', 'OpenAI-compatible'], ['deepseek', 'DeepSeek'], ['ollama', 'Ollama'], ['qwen', 'Qwen / DashScope'], ['glm', 'GLM / Z.ai']],
    thinking: [['auto', zh ? '自动（按协议）' : 'Automatic for protocol'], ['default', zh ? '保留模型默认思考' : 'Keep model default'], ['disabled', zh ? '请求关闭思考' : 'Request thinking off']],
    output_format: [['auto', zh ? '自动（按协议）' : 'Automatic for protocol'], ['json_schema', zh ? '严格结构（JSON Schema）' : 'Strict structure (JSON Schema)'], ['json_object', zh ? 'JSON 对象' : 'JSON object'], ['prompt', zh ? '仅提示词约束' : 'Prompt only']],
    transport: [['json', zh ? '完整响应（JSON）' : 'Complete response (JSON)'], ['sse', zh ? '流式响应（SSE）' : 'Streaming response (SSE)']],
  };
  const labels = zh ? { protocol: '参数协议', thinking: '思考模式', output_format: '输出约束', transport: '响应方式' }
    : { protocol: 'Parameter protocol', thinking: 'Thinking mode', output_format: 'Output constraint', transport: 'Response transport' };
  return <details className="rounded-lg border app-control p-3">
    <summary className="cursor-pointer text-sm">{zh ? '翻译与校对兼容设置' : 'Translation and proofreading compatibility'}</summary>
    <p className="my-3 text-xs text-app-muted">{zh
      ? '自定义地址也可选择对应平台的参数协议。关闭思考需要模型支持；纯思考模型请选择保留默认，必要时使用流式响应。更改后请重新测试字幕能力。'
      : 'Custom endpoints can use a platform protocol. Thinking-only models need the model default and may require streaming. Test subtitle capabilities again after changes.'}</p>
    <div className="grid gap-3">
      {(Object.keys(choices) as Array<keyof typeof choices>).map((key) => <Field key={key} label={labels[key]}>
        <Select value={value[key]} options={choices[key].map(([value, label]) => ({ value, label }))}
          onValueChange={(next) => onChange({ ...value, [key]: next })} />
      </Field>)}
      <Field label={zh ? '上下文长度' : 'Context length'}>
        <Select value={value.context_length == null ? 'auto' : String(value.context_length)}
          options={[['auto', zh ? '默认（32768）' : 'Default (32768)'], ...CONTEXT_LENGTH_TIERS.map((tier) => [tier, tier])].map(([value, label]) => ({ value, label }))}
          onValueChange={(next) => onChange({ ...value, context_length: next === 'auto' ? null : Number(next) })} />
      </Field>
      <p className="-mt-1 text-xs text-app-muted">{zh
        ? '仅 Ollama 协议生效，按请求覆盖本地模型上下文。更大的上下文占用更多显存；低端显卡可调低。'
        : 'Ollama protocol only; overrides the local model context per request. Larger contexts use more VRAM—lower it on low-end GPUs.'}</p>
    </div>
  </details>;
}

function checkMessage(code: string | null | undefined, zh: boolean) {
  if (!code) return zh ? '通过' : 'Passed';
  const messages: Record<string, [string, string]> = {
    LLM_CAPABILITY_NOT_TESTED: ['未测试', 'Not tested'],
    LLM_PROVIDER_TIMEOUT: ['响应超时；可调整思考模式或换模型', 'Timed out; review thinking mode or model'],
    LLM_PROVIDER_AUTH_FAILED: ['鉴权失败；检查 API key', 'Authentication failed; check API key'],
    LLM_PROVIDER_RATE_LIMITED: ['平台限流；稍后再试', 'Rate limited; try later'],
    LLM_PARAMETERS_REJECTED: ['平台拒绝参数；检查协议、思考和响应方式', 'Request rejected; check protocol, thinking and transport'],
    LLM_OUTPUT_FORMAT_UNSUPPORTED: ['不支持该输出约束', 'Output constraint unsupported'],
    LLM_PROVIDER_TRUNCATED: ['模型输出被截断', 'Model output truncated'],
    LLM_PROVIDER_REFUSED: ['模型未提供可用正文', 'Model did not provide usable text'],
    LLM_CAPABILITY_SAMPLE_FAILED: ['返回格式可读，但示例任务未通过', 'Readable output, but sample task failed'],
  };
  return messages[code]?.[zh ? 0 : 1] ?? (zh ? '未通过；检查提供商设置和错误码' : 'Failed; check provider settings and error code');
}

export function LLMCapabilityPanel({ provider, onSaved }: { provider: LLMProvider; onSaved: () => void }) {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const [result, setResult] = useState<LLMCapabilityTestResult>();
  const [applied, setApplied] = useState<string>();
  const test = useMutation({
    mutationFn: () => apiClient.testLLMCapabilities(provider.id),
    onMutate: () => { setResult(undefined); setApplied(undefined); },
    onSuccess: setResult,
  });
  const apply = useMutation({
    mutationFn: () => apiClient.updateLLMProvider(provider.id, {
      compatibility: result!.recommended, expected_updated_at: result!.provider_updated_at,
    }),
    onSuccess: (saved) => { setApplied(saved.updated_at); onSaved(); },
  });
  const current = result?.provider_updated_at === provider.updated_at;
  return <div className="grid gap-2 rounded-lg border app-control p-3">
    <p className="text-xs leading-5 text-app-muted">{zh
      ? '字幕能力测试仅发送内置示例：最多 6 次请求、总计 3 分钟，平台可能计费。会分别验证翻译和校对；通过不保证长字幕速度或译文准确。'
      : 'Subtitle testing sends built-in samples only: up to 6 requests and 3 minutes, potentially billed. Translation and proofreading are checked separately; passing does not guarantee long-task speed or accuracy.'}</p>
    <Button size="sm" variant="secondary" disabled={test.isPending || apply.isPending || !provider.enabled} onClick={() => test.mutate()}>
      {test.isPending ? (zh ? '正在测试字幕能力…' : 'Testing subtitle capabilities…') : (zh ? '测试翻译与校对' : 'Test translation and proofreading')}
    </Button>
    {test.error && <ErrorState error={test.error} />}
    {result && current && <div role="status" className="grid gap-2 text-xs">
      <p>{zh ? '实际请求数' : 'Requests made'}：{result.requests_made}</p>
      {(['translation', 'proofreading'] as const).map((kind) => <p key={kind}>
        {kind === 'translation' ? (zh ? '翻译' : 'Translation') : (zh ? '校对' : 'Proofreading')}：{checkMessage(result[kind].error_code, zh)}
        {result[kind].error_code && <code className="ml-2 break-all">{result[kind].error_code}</code>}
      </p>)}
      {result.ok && result.recommended && <>
        <p>{zh ? '已验证设置' : 'Tested settings'}：{Object.values(result.recommended).filter((v) => v != null).join(' · ')}</p>
        <Button size="sm" disabled={apply.isPending || test.isPending} onClick={() => apply.mutate()}>{zh ? '应用已验证设置' : 'Apply tested settings'}</Button>
      </>}
    </div>}
    {applied === provider.updated_at && <p role="status" className="text-xs">{zh ? '已应用示例验证通过的设置。' : 'Sample-tested settings applied.'}</p>}
    {result && !current && applied !== provider.updated_at && <p className="text-xs">{zh ? '配置已变化，请重新测试。' : 'Configuration changed. Test again.'}</p>}
    {apply.error && <ErrorState error={apply.error} />}
  </div>;
}

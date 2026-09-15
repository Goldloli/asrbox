import { HardDrive } from 'lucide-react';
import { cn } from '../lib/cn';
import ollamaIcon from '../assets/brands/ollama.svg';
import openaiIcon from '../assets/brands/openai.svg';
import qwenIcon from '../assets/brands/qwen.svg';

const brands: Array<{ pattern: RegExp; src: string; label: string }> = [
  { pattern: /ollama/i, src: ollamaIcon, label: 'Ollama' },
  { pattern: /openai|chatgpt|\bgpt\b/i, src: openaiIcon, label: 'OpenAI' },
  { pattern: /qwen|alibaba|aliyun/i, src: qwenIcon, label: 'Qwen' },
];

export function BrandIcon({ name, className }: { name: string; className?: string }) {
  const brand = brands.find((entry) => entry.pattern.test(name));
  if (!brand) {
    return <HardDrive className={cn('size-5 shrink-0 text-app-accent', className)} strokeWidth={1.6} aria-hidden />;
  }
  return (
    <img
      src={brand.src}
      alt={brand.label}
      title={brand.label}
      className={cn('app-brand-icon size-5 shrink-0 object-contain', className)}
    />
  );
}

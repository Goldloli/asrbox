import { HardDrive } from 'lucide-react';
import { cn } from '../lib/cn';
import ollamaIcon from '../assets/brands/ollama.svg';
import openaiIcon from '../assets/brands/openai.svg';
import qwenIcon from '../assets/brands/qwen.svg';

type BrandKey = 'ollama' | 'qwen' | 'openai';

const brands: Record<BrandKey, { src: string; label: string }> = {
  ollama: { src: ollamaIcon, label: 'Ollama' },
  qwen: { src: qwenIcon, label: 'Qwen' },
  openai: { src: openaiIcon, label: 'OpenAI' },
};

export function brandKeyForName(name: string): BrandKey | null {
  // Provider types often include "openai-compatible". Match concrete product
  // names first so the compatibility protocol never overrides the real brand.
  if (/qwen|alibaba|aliyun/i.test(name)) return 'qwen';
  if (/ollama/i.test(name)) return 'ollama';
  if (/openai|chatgpt|\bgpt\b/i.test(name)) return 'openai';
  return null;
}

export function BrandIcon({ name, className }: { name: string; className?: string }) {
  const brandKey = brandKeyForName(name);
  if (!brandKey) {
    return <HardDrive className={cn('size-5 shrink-0 text-app-accent', className)} strokeWidth={1.6} aria-hidden />;
  }
  const brand = brands[brandKey];
  return (
    <img
      src={brand.src}
      alt={brand.label}
      title={brand.label}
      className={cn('app-brand-icon size-5 shrink-0 object-contain', className)}
    />
  );
}

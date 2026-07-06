import type { TranscriptionTask } from '../../lib/api';

export function countTextMatches(text: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;

  let count = 0;
  let index = 0;
  const haystack = text.toLowerCase();
  while (index < haystack.length) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count += 1;
    index = found + needle.length;
  }
  return count;
}

export function renderHighlightedText(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return text;

  const parts: Array<{ text: string; matched: boolean }> = [];
  const haystack = text.toLowerCase();
  const normalizedNeedle = needle.toLowerCase();
  let index = 0;

  while (index < text.length) {
    const found = haystack.indexOf(normalizedNeedle, index);
    if (found === -1) {
      parts.push({ text: text.slice(index), matched: false });
      break;
    }
    if (found > index) parts.push({ text: text.slice(index, found), matched: false });
    parts.push({ text: text.slice(found, found + needle.length), matched: true });
    index = found + needle.length;
  }

  return parts.map((part, partIndex) => (
    part.matched ? (
      <mark key={partIndex} className="rounded bg-[var(--app-accent-soft)] px-0.5 text-[var(--app-accent-text)]">
        {part.text}
      </mark>
    ) : (
      <span key={partIndex}>{part.text}</span>
    )
  ));
}

export function replaceTextMatches(text: string, query: string, replacement: string) {
  const needle = query.trim();
  if (!needle) return text;

  const haystack = text.toLowerCase();
  const normalizedNeedle = needle.toLowerCase();
  const pieces: string[] = [];
  let index = 0;

  while (index < text.length) {
    const found = haystack.indexOf(normalizedNeedle, index);
    if (found === -1) {
      pieces.push(text.slice(index));
      break;
    }
    pieces.push(text.slice(index, found), replacement);
    index = found + needle.length;
  }

  return pieces.join('');
}

export function formatSubtitlePreview(segments: TranscriptionTask['segments'], format: 'srt' | 'vtt') {
  if (segments.length === 0) return '';

  const body = segments.map((segment, index) => {
    const start = formatSubtitleTime(segment.start, format);
    const end = formatSubtitleTime(segment.end, format);
    const timing = `${start} --> ${end}`;
    return format === 'srt'
      ? `${index + 1}\n${timing}\n${segment.text}`
      : `${timing}\n${segment.text}`;
  }).join('\n\n');

  return format === 'vtt' ? `WEBVTT\n\n${body}` : body;
}

export function formatOutputTemplate(
  template: 'minutes' | 'transcript' | 'subtitles' | 'markdown',
  filename: string,
  text: string,
  segments: TranscriptionTask['segments'],
  subtitleFormat: 'srt' | 'vtt',
) {
  if (template === 'minutes') {
    return `# ${filename} 会议纪要\n\n## 结论\n- \n\n## 待办\n- \n\n## 原文记录\n${text || ''}`;
  }
  if (template === 'subtitles') return formatSubtitlePreview(segments, subtitleFormat);
  if (template === 'markdown') {
    return `# ${filename}\n\n## Notes\n\n## Transcript\n\n${text || ''}`;
  }
  return text || '';
}

export function drawAudioWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer) {
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(canvas.clientWidth * pixelRatio));
  const height = Math.floor(96 * pixelRatio);
  const channelData = buffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(channelData.length / width));
  const context = canvas.getContext('2d');
  if (!context) return;

  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.documentElement);
  context.strokeStyle = styles.getPropertyValue('--app-accent').trim() || '#facc15';
  context.lineWidth = Math.max(1, pixelRatio);
  context.beginPath();

  for (let x = 0; x < width; x += 2) {
    const start = x * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, channelData.length);
    let min = 1;
    let max = -1;
    for (let index = start; index < end; index += 1) {
      const sample = channelData[index] ?? 0;
      min = Math.min(min, sample);
      max = Math.max(max, sample);
    }
    const top = ((1 - max) * height) / 2;
    const bottom = ((1 - min) * height) / 2;
    context.moveTo(x + 0.5, top);
    context.lineTo(x + 0.5, bottom);
  }

  context.stroke();
}

function formatSubtitleTime(seconds: number, format: 'srt' | 'vtt') {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const separator = format === 'srt' ? ',' : '.';

  return `${padTime(hours)}:${padTime(minutes)}:${padTime(wholeSeconds)}${separator}${milliseconds.toString().padStart(3, '0')}`;
}

function padTime(value: number) {
  return value.toString().padStart(2, '0');
}

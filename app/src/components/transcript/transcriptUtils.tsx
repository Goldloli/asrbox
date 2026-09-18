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
  context.strokeStyle = styles.getPropertyValue('--app-accent').trim() || '#f59e0b';
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

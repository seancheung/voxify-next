export function editSelection(audio: AudioBuffer, start: number, end: number, silence: boolean) {
  const next = new AudioBuffer({
    length: silence ? audio.length : audio.length - (end - start),
    numberOfChannels: audio.numberOfChannels,
    sampleRate: audio.sampleRate,
  });
  for (let i = 0; i < audio.numberOfChannels; i++) {
    const input = audio.getChannelData(i);
    const output = next.getChannelData(i);
    output.set(input.subarray(0, start));
    output.set(input.subarray(end), silence ? end : start);
  }
  return next;
}

export function encodeWav(audio: AudioBuffer) {
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
    audio.getChannelData(i),
  );
  const stride = channels.length * 2;
  const size = audio.length * stride;
  if (size + 44 > 50 * 1024 * 1024) throw new Error("编辑后的 WAV 超过 50 MB");
  const buffer = new ArrayBuffer(44 + size);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const tag = (at: number, value: string) => bytes.set(new TextEncoder().encode(value), at);
  tag(0, "RIFF");
  view.setUint32(4, 36 + size, true);
  tag(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * stride, true);
  view.setUint16(32, stride, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, size, true);
  let offset = 44;
  for (let frame = 0; frame < audio.length; frame++) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame]));
      view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

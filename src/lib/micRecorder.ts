export async function openMic(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
}

/** Grava o microfone em pedaços de 250 ms; pausa enquanto o entrevistador fala. */
export function createRecorder(stream: MediaStream, onChunk: (chunk: Blob) => void) {
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (e) => onChunk(e.data);
  return {
    start() { recorder.start(250); recorder.pause(); },
    pause() { if (recorder.state === 'recording') recorder.pause(); },
    resume() { if (recorder.state === 'paused') recorder.resume(); },
    /** `releaseMic: false` mantém o microfone aberto para recriar o gravador (novo cabeçalho WebM). */
    stop({ releaseMic = true } = {}) {
      if (recorder.state !== 'inactive') recorder.stop();
      if (releaseMic) stream.getTracks().forEach((t) => t.stop());
    },
  };
}

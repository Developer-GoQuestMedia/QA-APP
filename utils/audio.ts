export type AudioData = {
  audioData: Float32Array[];
  peakLevel: number;
};

export const createWorker = async (audioContext: AudioContext) => {
  const workletCode = `
    class RecorderProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.isRecording = true;
        this.recordedData = [];
      }

      process(inputs) {
        const input = inputs[0];
        if (input && input.length > 0 && this.isRecording) {
          const processedData = input.map(channel => {
            const gainFactor = 1.5;
            return Float32Array.from(channel, sample => 
              Math.max(-1, Math.min(1, sample * gainFactor))
            );
          });
          
          this.port.postMessage({
            audioData: processedData,
            peakLevel: Math.max(...processedData[0].map(Math.abs))
          });
        }
        return true;
      }
    }

    registerProcessor('recorder-processor', RecorderProcessor);
  `;

  const blob = new Blob([workletCode], { type: 'application/javascript' });
  const workletUrl = URL.createObjectURL(blob);

  await audioContext.audioWorklet.addModule(workletUrl);
  const workletNode = new AudioWorkletNode(audioContext, 'recorder-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 2,
    processorOptions: {
      sampleRate: audioContext.sampleRate
    }
  });

  return workletNode;
};

export const createWavBlob = (audioData: Float32Array[], sampleRate: number): Blob => {
  const numChannels = audioData.length;
  const length = audioData[0].length;
  const buffer = new ArrayBuffer(44 + length * numChannels * 2);
  const view = new DataView(buffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length * numChannels * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length * numChannels * 2, true);

  const offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, audioData[channel][i]));
      view.setInt16(offset + (i * numChannels + channel) * 2, sample * 0x7FFF, true);
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}; 
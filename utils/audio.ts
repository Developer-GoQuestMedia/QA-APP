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
        this.bufferSize = 4096;
        this.sampleRate = 48000;
        this.isProcessing = false;
        this.isStopping = false;
        
        // Initialize buffer for each channel
        this.buffers = [new Float32Array(this.bufferSize), new Float32Array(this.bufferSize)];
        this.bufferIndex = 0;
        
        this.port.onmessage = (event) => {
          if (event.data === 'stop' && !this.isStopping) {
            this.isStopping = true;
            this.isRecording = false;
            // Send any remaining buffered data
            if (this.bufferIndex > 0) {
              this.flush();
            }
            // Send end signal
            this.port.postMessage({ type: 'stopped' });
          }
        };
      }

      flush() {
        if (this.bufferIndex > 0 && !this.isProcessing) {
          this.isProcessing = true;
          
          const audioData = this.buffers.map(buffer => {
            const trimmedBuffer = new Float32Array(this.bufferIndex);
            trimmedBuffer.set(buffer.subarray(0, this.bufferIndex));
            return trimmedBuffer;
          });
          
          const peakLevel = Math.max(
            ...audioData.map(channel => 
              Math.max(...channel.map(Math.abs))
            )
          );

          this.port.postMessage({ 
            type: 'chunk',
            audioData, 
            peakLevel 
          });
          
          // Reset buffers
          this.buffers = [new Float32Array(this.bufferSize), new Float32Array(this.bufferSize)];
          this.bufferIndex = 0;
          this.isProcessing = false;
        }
      }

      process(inputs) {
        const input = inputs[0];
        if (!input || input.length === 0 || !this.isRecording || this.isProcessing) return true;

        // Process each channel
        input.forEach((channel, channelIndex) => {
          if (channel && channel.length > 0) {
            // Calculate remaining space in buffer
            const remainingSpace = this.bufferSize - this.bufferIndex;
            
            if (remainingSpace >= channel.length) {
              // If we have enough space, add samples directly
              for (let i = 0; i < channel.length; i++) {
                // Apply gain and normalize
                this.buffers[channelIndex][this.bufferIndex + i] = 
                  Math.max(-1, Math.min(1, channel[i] * 1.5)); // gainFactor = 1.5
              }
              
              // Only increment buffer index after processing last channel
              if (channelIndex === input.length - 1) {
                this.bufferIndex += channel.length;
                
                // If buffer is full or nearly full, flush it
                if (this.bufferIndex >= this.bufferSize - 128) {
                  this.flush();
                }
              }
            } else {
              // If not enough space, fill current buffer and create new one
              for (let i = 0; i < remainingSpace; i++) {
                this.buffers[channelIndex][this.bufferIndex + i] = 
                  Math.max(-1, Math.min(1, channel[i] * 1.5));
              }
              
              if (channelIndex === input.length - 1) {
                // Flush the full buffer
                this.flush();
                
                // Process remaining samples
                const remainingSamples = channel.length - remainingSpace;
                for (let i = 0; i < remainingSamples; i++) {
                  this.buffers[channelIndex][i] = 
                    Math.max(-1, Math.min(1, channel[remainingSpace + i] * 1.5));
                }
                this.bufferIndex = remainingSamples;
              }
            }
          }
        });

        return true;
      }
    }

    registerProcessor('recorder-processor', RecorderProcessor);
  `;

  const blob = new Blob([workletCode], { type: 'application/javascript' });
  const workletUrl = URL.createObjectURL(blob);

  try {
    await audioContext.audioWorklet.addModule(workletUrl);
    const workletNode = new AudioWorkletNode(audioContext, 'recorder-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      processorOptions: {
        sampleRate: 48000,
        bufferSize: 4096
      }
    });

    // Add message type handling
    workletNode.port.onmessage = (event) => {
      if (event.data.type === 'chunk') {
        workletNode.dispatchEvent(new CustomEvent('audiochunk', {
          detail: {
            audioData: event.data.audioData,
            peakLevel: event.data.peakLevel
          }
        }));
      } else if (event.data.type === 'stopped') {
        workletNode.dispatchEvent(new CustomEvent('stopped'));
      }
    };

    // Clean up the URL
    URL.revokeObjectURL(workletUrl);

    return workletNode;
  } catch (error) {
    console.error('Failed to create audio worklet:', error);
    URL.revokeObjectURL(workletUrl);
    throw error;
  }
};

export const createWavBlob = (audioData: Float32Array[], sampleRate: number = 48000): Blob => {
  const numChannels = audioData.length;
  const length = audioData[0].length;
  const buffer = new ArrayBuffer(44 + length * numChannels * 2);
  const view = new DataView(buffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // Write WAV header
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

  // Write audio data
  const offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, audioData[channel][i]));
      view.setInt16(offset + (i * numChannels + channel) * 2, sample * 0x7FFF, true);
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}; 
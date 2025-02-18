import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  audioStream: MediaStream;
  maxDuration: number;
}

// Add type for webkitAudioContext
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ audioStream, maxDuration }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!audioStream || !canvasRef.current) return;

    const audioContext = new (window.webkitAudioContext || window.AudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(audioStream);
    
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      animationFrameId.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);
      
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.beginPath();
      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        const y = canvas.height - barHeight;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height);
      ctx.lineTo(0, canvas.height);
      ctx.closePath();
      ctx.fillStyle = 'rgba(34, 198, 94, 0.5)';
      ctx.fill();

      const currentTime = audioContext.currentTime;
      const progress = (currentTime / maxDuration) * canvas.width;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(0, 0, progress, canvas.height);
    };

    draw();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      audioContext.close();
    };
  }, [audioStream, maxDuration]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-16 rounded-md bg-gray-900 shadow-xl"
      width={300}
      height={64}
    />
  );
};

export default AudioVisualizer; 
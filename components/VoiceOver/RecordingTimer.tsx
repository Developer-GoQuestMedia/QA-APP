import React, { useState, useEffect } from 'react';
import { Alert } from '../ui/alert';

interface RecordingTimerProps {
  isRecording: boolean;
  maxDuration: number;
}

const RecordingTimer: React.FC<RecordingTimerProps> = ({ isRecording, maxDuration }) => {
  const [time, setTime] = useState(0);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setTime(prev => {
          const newTime = prev + 1;
          if (newTime >= maxDuration * 0.8 && !showWarning) {
            setShowWarning(true);
          }
          if (newTime >= maxDuration) {
            return maxDuration;
          }
          return newTime;
        });
      }, 1000);
    } else {
      setTime(0);
      setShowWarning(false);
    }

    return () => clearInterval(interval);
  }, [isRecording, maxDuration, showWarning]);

  useEffect(() => {
    if (time < maxDuration * 0.8 && showWarning) {
      setShowWarning(false);
    }
  }, [time, maxDuration, showWarning]);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{String(Math.floor(time / 60)).padStart(2, '0')}:{String(time % 60).padStart(2, '0')}</span>
        <span className="text-gray-500">Max: {maxDuration}s</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-300 ${
            time / maxDuration > 0.8 ? 'bg-red-500' : 
            time / maxDuration > 0.5 ? 'bg-yellow-500' : 'bg-green-500'
          }`}
          style={{ width: `${(time / maxDuration) * 100}%` }}
        />
      </div>
      {showWarning && (
        <Alert className="py-1 text-sm">
          Recording will stop in {maxDuration - time} seconds
        </Alert>
      )}
    </div>
  );
};

export default RecordingTimer; 
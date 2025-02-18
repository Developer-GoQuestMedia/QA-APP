export const getNumberValue = (mongoNumber: any): number => {
  if (typeof mongoNumber === 'object' && mongoNumber !== null) {
    if ('$numberInt' in mongoNumber) return Number(mongoNumber.$numberInt);
    if ('$numberDouble' in mongoNumber) return Number(mongoNumber.$numberDouble);
  }
  return Number(mongoNumber);
};

export const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`;
};

export const calculateDuration = (timeStart: string | undefined, timeEnd: string | undefined): number => {
  const parseTime = (time: string | undefined): number => {
    if (!time || typeof time !== 'string') {
      console.warn('Invalid time format provided:', time);
      return 0;
    }

    const parts = time.split(':');
    if (parts.length !== 4) {
      console.warn('Invalid time format. Expected HH:MM:SS:mmm, got:', time);
      return 0;
    }

    try {
      const [hours, minutes, seconds, milliseconds] = parts.map(Number);
      if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) {
        console.warn('Invalid time components:', { hours, minutes, seconds, milliseconds });
        return 0;
      }
      return (hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000);
    } catch (error) {
      console.error('Error parsing time:', error);
      return 0;
    }
  };
  
  const startSeconds = parseTime(timeStart);
  const endSeconds = parseTime(timeEnd);
  return Number((endSeconds - startSeconds).toFixed(3));
}; 
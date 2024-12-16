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

export const calculateDuration = (timeStart: string, timeEnd: string): number => {
  const parseTime = (time: string): number => {
    const [hours, minutes, seconds, milliseconds] = time.split(':').map(Number);
    return (hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000);
  };
  
  const startSeconds = parseTime(timeStart);
  const endSeconds = parseTime(timeEnd);
  return Number((endSeconds - startSeconds).toFixed(3));
}; 
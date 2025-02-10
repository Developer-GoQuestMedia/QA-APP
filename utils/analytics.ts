type LogLevel = 'info' | 'warn' | 'error';

export const logEvent = (
  message: string, 
  data?: Record<string, unknown>, 
  level: LogLevel = 'info'
): void => {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    message,
    ...data
  };

  switch (level) {
    case 'warn':
      console.warn(logData);
      break;
    case 'error':
      console.error(logData);
      break;
    default:
      console.log(logData);
  }
}; 
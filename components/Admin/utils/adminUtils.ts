import axios, { AxiosRequestConfig } from 'axios';
import { toast } from 'react-toastify';

/**
 * Formats bytes to human readable format
 */
export const formatBytes = (bytes: number, decimals: number = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Gets current timestamp in ISO format
 */
export const getTimeStamp = () => {
  return new Date().toISOString();
};

/**
 * Custom hook for handling admin notifications
 */
export const useNotifyAdmin = () => {
  return (message: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') {
      toast.error(message);
    } else {
      toast.success(message);
    }
  };
};

/**
 * Handles errors in a consistent way
 */
export const handleError = (error: Error): void => {
  console.error('Operation failed:', error);
  toast.error(error.message || 'An unexpected error occurred');
};

/**
 * Axios request with retry functionality
 */
export const axiosWithRetry = async (config: AxiosRequestConfig, maxRetries = 3) => {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const response = await axios(config);
      return response;
    } catch (error) {
      retries++;
      if (retries === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }
  }
};

/**
 * Ensures dates are properly converted
 */
export const ensureDate = (date: string | Date | undefined): string | Date => {
  if (!date) return new Date().toISOString();
  return typeof date === 'string' ? date : date.toISOString();
}; 
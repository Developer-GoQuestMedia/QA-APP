import { useCallback } from 'react';
import { toast } from 'react-hot-toast';

export type NotificationType = 'success' | 'error';

export const useNotifyAdmin = () => {
    return useCallback((message: string, type: NotificationType = 'success') => {
        toast[type](message);
    }, []);
};



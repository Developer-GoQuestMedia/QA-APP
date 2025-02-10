declare module '@tanstack/react-query' {
  export * from '@tanstack/react-query';
  export { 
    useQuery,
    useQueryClient,
    useMutation,
    QueryClient,
    QueryClientProvider 
  } from '@tanstack/react-query';
}

declare module 'framer-motion' {
  import type { AnimationControls } from 'framer-motion/types';
  import type { MotionValue } from 'framer-motion/types';

  export const motion: any;
  export const useMotionValue: <T>(initial: T) => MotionValue<T>;
  export const useAnimation: () => AnimationControls;
  export interface PanInfo {
    point: {
      x: number;
      y: number;
    };
    delta: {
      x: number;
      y: number;
    };
    offset: {
      x: number;
      y: number;
    };
    velocity: {
      x: number;
      y: number;
    };
  }
}

declare module '@aws-sdk/client-s3' {
  export * from '@aws-sdk/client-s3/dist-types';
} 
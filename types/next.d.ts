import 'next';

declare module 'next' {
  interface _RouteMap {
    '/admin/project/[projectId]': { query: { projectId: string } };
  }
} 
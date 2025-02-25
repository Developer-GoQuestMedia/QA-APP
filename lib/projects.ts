import { Project } from '@/types/project';
import { cookies } from 'next/headers';
import axios from 'axios';

export async function getProject(projectId: string): Promise<Project | null> {
  try {
    const cookieStore = cookies();
    const cookieString = cookieStore.toString();
    
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/projects/${projectId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieString
        },
        withCredentials: true
      }
    );

    return response.data.project || null;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    console.error('Error fetching project:', error);
    return null;
  }
} 
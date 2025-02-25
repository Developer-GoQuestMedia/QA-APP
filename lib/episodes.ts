import { Episode } from '@/types/project';
import { cookies } from 'next/headers';
import axios from 'axios';

export async function getEpisode(projectId: string, episodeName: string): Promise<Episode | null> {
  try {
    const cookieStore = cookies();
    const cookieString = cookieStore.toString();
    const encodedEpisodeName = encodeURIComponent(episodeName);
    
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/projects/${projectId}/episodes/${encodedEpisodeName}`,
      {
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieString
        },
        withCredentials: true
      }
    );

    return response.data.episode || null;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    console.error('Error fetching episode:', error);
    return null;
  }
} 
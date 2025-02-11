import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getQueueMetrics, getActiveJobs } from '@/lib/queueJobs';

export async function GET() {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get queue metrics and active jobs
    const [metrics, activeJobs] = await Promise.all([
      getQueueMetrics(),
      getActiveJobs()
    ]);

    return NextResponse.json({
      metrics,
      activeJobs,
      serverTime: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error fetching queue status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch queue status' },
      { status: 500 }
    );
  }
} 
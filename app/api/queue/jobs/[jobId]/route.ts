import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getJobStatus } from '@/lib/queueJobs';

export async function GET(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = params;
    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const jobStatus = await getJobStatus(jobId);
    return NextResponse.json(jobStatus);
  } catch (error: any) {
    console.error(`Error fetching job status for ${params.jobId}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch job status' },
      { status: 500 }
    );
  }
} 
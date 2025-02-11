import { NextResponse } from 'next/server';
import { cleanupOldJobs } from '@/lib/queueJobs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await cleanupOldJobs();
    return NextResponse.json({ 
      success: true, 
      message: 'Queue cleanup completed',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error during queue cleanup:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup queue' },
      { status: 500 }
    );
  }
} 
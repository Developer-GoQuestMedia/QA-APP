import { NextResponse } from 'next/server';
import { cleanupOldJobs } from '@/lib/queueJobs';
import { isRedisConnected } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check if Redis is available
    const redisAvailable = await isRedisConnected();
    if (!redisAvailable) {
      console.warn('Redis not available, skipping queue cleanup');
      return NextResponse.json({ 
        success: true, 
        message: 'Queue cleanup skipped - Redis not available',
        timestamp: new Date().toISOString()
      });
    }

    await cleanupOldJobs();
    return NextResponse.json({ 
      success: true, 
      message: 'Queue cleanup completed',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error during queue cleanup:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup queue', details: error?.message },
      { status: 500 }
    );
  }
} 
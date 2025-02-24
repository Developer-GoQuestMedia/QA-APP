import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { s3Client } from '@/lib/s3';
import { CreateMultipartUploadCommand } from '@aws-sdk/client-s3';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileName, fileKey, fileType } = await request.json();

    if (!fileName || !fileKey || !fileType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Initialize multipart upload
    const command = new CreateMultipartUploadCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      ContentType: fileType
    });

    const { UploadId } = await s3Client.send(command);

    return NextResponse.json({ uploadId: UploadId });
  } catch (error) {
    console.error('Failed to initialize upload:', error);
    return NextResponse.json(
      { error: 'Failed to initialize upload' },
      { status: 500 }
    );
  }
} 
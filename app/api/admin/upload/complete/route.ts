import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { s3Client } from '@/lib/s3';
import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';

interface CompletionPart {
  PartNumber: number;
  ETag: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uploadId, fileKey, parts } = await request.json();

    if (!uploadId || !fileKey || !parts || !Array.isArray(parts)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate parts
    const validParts = parts.every((part: CompletionPart) => 
      typeof part.PartNumber === 'number' && 
      typeof part.ETag === 'string'
    );

    if (!validParts) {
      return NextResponse.json(
        { error: 'Invalid parts data' },
        { status: 400 }
      );
    }

    // Complete multipart upload
    const command = new CompleteMultipartUploadCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts }
    });

    const result = await s3Client.send(command);

    return NextResponse.json({
      fileName: fileKey.split('/').pop(),
      fileKey: result.Key,
      collectionName: fileKey.split('/').slice(-2, -1)[0]
    });
  } catch (error) {
    console.error('Failed to complete upload:', error);
    return NextResponse.json(
      { error: 'Failed to complete upload' },
      { status: 500 }
    );
  }
} 
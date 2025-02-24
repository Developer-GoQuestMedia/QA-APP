import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { s3Client } from '@/lib/s3';
import { UploadPartCommand } from '@aws-sdk/client-s3';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const chunk = formData.get('chunk') as Blob;
    const chunkIndex = formData.get('chunkIndex');
    const uploadId = formData.get('uploadId');
    const fileKey = formData.get('fileKey');

    if (!chunk || !chunkIndex || !uploadId || !fileKey) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Convert chunk to buffer
    const buffer = Buffer.from(await chunk.arrayBuffer());

    // Upload chunk
    const command = new UploadPartCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey as string,
      UploadId: uploadId as string,
      PartNumber: parseInt(chunkIndex as string),
      Body: buffer
    });

    const { ETag } = await s3Client.send(command);

    return NextResponse.json({ ETag });
  } catch (error) {
    console.error('Failed to upload chunk:', error);
    return NextResponse.json(
      { error: 'Failed to upload chunk' },
      { status: 500 }
    );
  }
} 
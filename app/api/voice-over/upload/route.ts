import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Configure request size limit and parsing
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_BUCKET_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const objectId = new ObjectId();
    const key = `voiceovers/${objectId.toString()}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const putObjectCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    });

    await s3Client.send(putObjectCommand);
    
    const { db } = await connectToDatabase();
    const voiceover = {
      _id: objectId,
      key,
      userId: session.user.id,
      createdAt: new Date(),
    };
    await db.collection('voiceovers').insertOne(voiceover);

    const publicUrl = `https://${process.env.R2_PUBLIC_URL}/${key}`;
    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
} 
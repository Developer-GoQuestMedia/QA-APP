import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
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

export async function POST(request: Request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const formData = await request.formData();
    const audio = formData.get('audio') as File;
    const dialogueId = formData.get('dialogueId') as string;
    const projectId = formData.get('projectId') as string;

    // Get dialogue from database to ensure correct index
    const { db } = await connectToDatabase();
    const dialogue = await db.collection('dialogues').findOne({
      _id: new ObjectId(dialogueId)
    });

    if (!dialogue) {
      return NextResponse.json(
        { error: 'Dialogue not found' },
        { status: 404 }
      );
    }

    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId)
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    console.log('Project from DB:', project);
    console.log('Dialogue from DB:', dialogue);

    if (!project.title) {
      return NextResponse.json(
        { error: 'Project title is missing' },
        { status: 400 }
      );
    }

    const folderPath = 'Kuma Ep 01/recordings/';
    // Use dialogue.index directly from the database
    const paddedIndex = dialogue.index.toString().padStart(2, '0');
    const filename = `Kuma Ep 01_Clip_${paddedIndex}.wav`;
    const fullPath = `${folderPath}${filename}`;

    console.log('Upload path:', fullPath);

    // Convert File to Buffer
    const arrayBuffer = await audio.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to R2
    const uploadParams = {
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: fullPath,
      Body: buffer,
      ContentType: 'audio/wav',
    };

    await s3Client.send(new PutObjectCommand(uploadParams));

    // Generate public URL
    const publicUrl = `https://${process.env.R2_PUBLIC_URL}/${fullPath}`;

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error('Error uploading voice-over:', error);
    return NextResponse.json(
      { error: 'Failed to upload voice-over' },
      { status: 500 }
    );
  }
} 
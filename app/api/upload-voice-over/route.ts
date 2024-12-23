import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/auth.config';
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
  console.log('Upload voice-over API called');
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log('Session found:', session.user);
    const formData = await request.formData();
    const audio = formData.get('audio') as File;
    const dialogueId = formData.get('dialogueId') as string;
    const projectId = formData.get('projectId') as string;

    if (!audio || !dialogueId || !projectId) {
      console.error('Missing required fields:', { audio: !!audio, dialogueId, projectId });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get dialogue from database to ensure correct index
    const { db } = await connectToDatabase();
    
    // First try to find the dialogue in any collection by checking project's dialogue_collection
    let dialogue = null;
    let dialogueCollection = 'dialogues';

    // Try to find the dialogue in any collection by checking all projects
    const projects = await db.collection('projects').find().toArray();
    
    for (const project of projects) {
      if (project.dialogue_collection) {
        const tempDialogue = await db.collection(project.dialogue_collection).findOne({
          _id: new ObjectId(dialogueId)
        });
        if (tempDialogue) {
          dialogue = tempDialogue;
          dialogueCollection = project.dialogue_collection;
          break;
        }
      }
    }

    // If still not found, try the default collection
    if (!dialogue) {
      dialogue = await db.collection('dialogues').findOne({
        _id: new ObjectId(dialogueId)
      });
    }

    if (!dialogue) {
      console.error('Dialogue not found:', dialogueId);
      return NextResponse.json(
        { error: 'Dialogue not found' },
        { status: 404 }
      );
    }

    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId)
    });

    if (!project) {
      console.error('Project not found:', projectId);
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    console.log('Project from DB:', project);
    console.log('Dialogue from DB:', dialogue);

    if (!project.title) {
      console.error('Project title is missing');
      return NextResponse.json(
        { error: 'Project title is missing' },
        { status: 400 }
      );
    }

    const folderPath = `${project.title}/recordings/`;
    // Use dialogue.index directly from the database
    const paddedIndex = dialogue.index.toString().padStart(2, '0');
    const filename = `${project.title}_Clip_${paddedIndex}.wav`;
    const fullPath = `${folderPath}${filename}`;

    // Convert File to Buffer
    const arrayBuffer = await audio.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log('Upload details:', {
      folderPath,
      filename,
      fullPath,
      audioSize: buffer.length,
      contentType: audio.type
    });

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
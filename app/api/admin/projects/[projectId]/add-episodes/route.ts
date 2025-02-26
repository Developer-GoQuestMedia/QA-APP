import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import type { Document, UpdateFilter } from 'mongodb';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Route Segment Config
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_BUCKET_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || '';
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

// Define interfaces for type safety
interface Episode {
  _id: ObjectId;
  name: string;
  status: 'uploaded' | 'processing' | 'error';
  fileKey: string;
  fileSize: number;
  contentType: string;
  uploadedAt: Date;
  collectionName: string;
}

interface Project {
  _id: ObjectId;
  episodes: Episode[];
  updatedAt: Date;
}

// Streaming utility for large file uploads
async function* streamFile(file: Blob, chunkSize = 5 * 1024 * 1024) {
  const buffer = await file.arrayBuffer();
  let offset = 0;
  
  while (offset < buffer.byteLength) {
    const end = Math.min(offset + chunkSize, buffer.byteLength);
    yield Buffer.from(buffer.slice(offset, end));
    offset = end;
  }
}

// Helper function to check if file exists in R2
async function checkFileExistsInR2(key: string): Promise<boolean> {
  try {
    const headObjectCommand = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(headObjectCommand);
    return true;
  } catch (error) {
    if ((error as any).name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

// Helper function to ensure collection exists
async function ensureCollection(db: any, collectionName: string) {
  const collections = await db.listCollections().toArray();
  if (!collections.some((col: any) => col.name === collectionName)) {
    await db.createCollection(collectionName);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    // 1. Authorization
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get project ID from params
    const { projectId } = params;
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // 3. Connect to database
    const { db, client } = await connectToDatabase();

    // 4. Get project details
    const project = await db.collection<Project>('projects').findOne({
      _id: new ObjectId(projectId)
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // 5. Parse FormData and validate files
    const formData = await request.formData();
    const videos = formData.getAll('videos');
    if (!videos.length) {
      return NextResponse.json({ error: 'No video files found' }, { status: 400 });
    }

    // 6. Start MongoDB session for transaction
    const mongoSession = await client.startSession();
    mongoSession.startTransaction();

    try {
      const newEpisodes: Episode[] = [];

      for (const videoFile of videos) {
        if (!(videoFile instanceof Blob)) {
          continue;
        }

        // Check file size
        if (videoFile.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: 'File size exceeds maximum limit of 1GB' },
            { status: 400 }
          );
        }

        const fileName = (videoFile as any).name || `episode_${Date.now()}.mp4`;
        const fileKey = `projects/${project._id}/${fileName}`;
        const contentType = videoFile.type || 'video/mp4';

        // Check if file already exists
        const fileExists = await checkFileExistsInR2(fileKey);
        if (fileExists) {
          return NextResponse.json(
            { error: `File ${fileName} already exists` },
            { status: 400 }
          );
        }

        // Create multipart upload
        const createMultipartUploadCommand = new CreateMultipartUploadCommand({
          Bucket: BUCKET_NAME,
          Key: fileKey,
          ContentType: contentType,
        });

        const multipartUpload = await s3Client.send(createMultipartUploadCommand);
        const uploadId = multipartUpload.UploadId;

        // Upload parts
        const parts = [];
        const buffer = await videoFile.arrayBuffer();
        const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, buffer.byteLength);
          const chunk = buffer.slice(start, end);

          const uploadPartCommand = new UploadPartCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey,
            UploadId: uploadId,
            PartNumber: i + 1,
            Body: Buffer.from(chunk),
          });

          const { ETag } = await s3Client.send(uploadPartCommand);
          parts.push({
            PartNumber: i + 1,
            ETag: ETag,
          });
        }

        // Complete multipart upload
        const completeMultipartUploadCommand = new CompleteMultipartUploadCommand({
          Bucket: BUCKET_NAME,
          Key: fileKey,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        });

        await s3Client.send(completeMultipartUploadCommand);

        // Create episode document
        const episode: Episode = {
          _id: new ObjectId(),
          name: fileName,
          status: 'uploaded',
          fileKey,
          fileSize: videoFile.size,
          contentType,
          uploadedAt: new Date(),
          collectionName: project.episodes[0]?.collectionName || `project_${project._id}_dialogues`,
        };

        newEpisodes.push(episode);
      }

      // Update project with new episodes
      const updateOperation: UpdateFilter<Project> = {
        $push: {
          episodes: {
            $each: newEpisodes
          }
        },
        $set: {
          updatedAt: new Date()
        }
      };

      await db.collection<Project>('projects').updateOne(
        { _id: new ObjectId(projectId) },
        updateOperation,
        { session: mongoSession }
      );

      await mongoSession.commitTransaction();

      // 8. Return success response
      return NextResponse.json({
        success: true,
        data: newEpisodes,
        message: 'Episodes added successfully'
      });
    } catch (error) {
      await mongoSession.abortTransaction();
      throw error;
    } finally {
      await mongoSession.endSession();
    }
  } catch (error: any) {
    console.error('Error adding episodes:', error);
    return NextResponse.json(
      {
        error: 'Failed to add episodes',
        details: error.message
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    // 1. Authorization
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get project ID and episode ID from params/query
    const projectId = params.projectId;
    const { searchParams } = new URL(request.url);
    const episodeId = searchParams.get('episodeId');

    if (!projectId || !episodeId) {
      return NextResponse.json(
        { error: 'Project ID and Episode ID are required' },
        { status: 400 }
      );
    }

    // 3. Connect to database
    const { db, client } = await connectToDatabase();
    const mongoSession = await client.startSession();
    mongoSession.startTransaction();

    try {
      // 4. Get project and episode details
      const project = await db.collection<Project>('projects').findOne({
        _id: new ObjectId(projectId)
      });

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      const episode = project.episodes.find(ep => ep._id.toString() === episodeId);
      if (!episode) {
        return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
      }

      // 5. Delete file from R2
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: episode.fileKey,
        });
        await s3Client.send(deleteCommand);
      } catch (error) {
        console.error('Error deleting file from R2:', error);
        // Continue with MongoDB deletion even if R2 deletion fails
      }

      // 6. Remove episode from project in MongoDB
      const updateResult = await db.collection<Project>('projects').updateOne(
        { _id: new ObjectId(projectId) },
        {
          $pull: {
            episodes: { _id: new ObjectId(episodeId) }
          },
          $set: {
            updatedAt: new Date()
          }
        },
        { session: mongoSession }
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error('Failed to remove episode from project');
      }

      await mongoSession.commitTransaction();

      return NextResponse.json({
        success: true,
        message: 'Episode deleted successfully'
      });
    } catch (error) {
      await mongoSession.abortTransaction();
      throw error;
    } finally {
      await mongoSession.endSession();
    }
  } catch (error: any) {
    console.error('Error deleting episode:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete episode',
        details: error.message
      },
      { status: 500 }
    );
  }
} 
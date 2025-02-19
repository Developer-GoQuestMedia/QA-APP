import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: { episodeId: string } }
) {
  try {
    // Log incoming request details
    const requestUrl = new URL(request.url);
    console.debug('Episode GET request details:', {
      method: request.method,
      url: request.url,
      params,
      headers: Object.fromEntries(request.headers.entries()),
      searchParams: Object.fromEntries(requestUrl.searchParams.entries())
    });

    // Check authentication
    const session = await getServerSession(authOptions);
    console.debug('Authentication status:', {
      hasSession: !!session,
      userRole: session?.user?.role,
      userEmail: session?.user?.email
    });

    if (!session || session.user.role !== 'admin') {
      const error = {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized access',
        details: {
          hasSession: !!session,
          userRole: session?.user?.role
        }
      };
      console.warn('Unauthorized access attempt:', error);
      return NextResponse.json({ error }, { status: 401 });
    }

    // Get and validate parameters
    const { episodeId } = params;
    const { searchParams } = requestUrl;
    const projectId = searchParams.get('projectId');

    // Validate parameters
    if (!episodeId || !projectId) {
      const error = {
        code: 'MISSING_PARAMETERS',
        message: 'Missing required parameters',
        details: {
          episodeId,
          projectId,
          searchParams: Object.fromEntries(searchParams.entries())
        }
      };
      console.warn('Missing parameters:', error);
      return NextResponse.json({ error }, { status: 400 });
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(episodeId) || !ObjectId.isValid(projectId)) {
      const error = {
        code: 'INVALID_ID_FORMAT',
        message: 'Invalid ID format',
        details: {
          episodeId,
          projectId,
          isValidEpisodeId: ObjectId.isValid(episodeId),
          isValidProjectId: ObjectId.isValid(projectId)
        }
      };
      console.warn('Invalid ID format:', error);
      return NextResponse.json({ error }, { status: 400 });
    }

    // Connect to database
    const { db } = await connectToDatabase();
    
    // Convert and validate ObjectIds
    const projectObjId = new ObjectId(projectId);
    const episodeObjId = new ObjectId(episodeId);
    
    // Log query parameters with more detail
    console.debug('Database query details:', {
      projectId,
      episodeId,
      projectObjId: projectObjId.toString(),
      episodeObjId: episodeObjId.toString(),
      query: { 
        _id: projectObjId,
        'episodes._id': episodeObjId
      }
    });

    // First check if project exists
    const projectExists = await db.collection('projects').findOne(
      { _id: projectObjId },
      { projection: { _id: 1 } }
    );

    if (!projectExists) {
      const error = {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found',
        details: { 
          projectId,
          projectObjId: projectObjId.toString()
        }
      };
      console.warn('Project not found:', error);
      return NextResponse.json({ error }, { status: 404 });
    }

    // Then check if episode exists in project
    const project = await db.collection('projects').findOne(
      { 
        _id: projectObjId,
        'episodes._id': episodeObjId
      },
      {
        projection: {
          'episodes.$': 1
        }
      }
    );

    // Log raw query result for debugging
    console.debug('Raw database query result:', {
      hasProject: !!project,
      projectData: project,
      hasEpisodes: !!project?.episodes,
      episodeCount: project?.episodes?.length,
      firstEpisode: project?.episodes?.[0] ? {
        _id: project.episodes[0]._id?.toString(),
        name: project.episodes[0].name
      } : null
    });

    if (!project) {
      const error = {
        code: 'EPISODE_NOT_FOUND',
        message: 'Episode not found in project',
        details: { 
          projectId,
          episodeId,
          projectObjId: projectObjId.toString(),
          episodeObjId: episodeObjId.toString()
        }
      };
      console.warn('Episode not found in project:', error);
      return NextResponse.json({ error }, { status: 404 });
    }

    const episode = project.episodes[0];
    if (!episode) {
      const error = {
        code: 'EPISODE_NOT_FOUND',
        message: 'Episode not found in project',
        details: { projectId, episodeId }
      };
      console.warn('Episode not found:', error);
      return NextResponse.json({ error }, { status: 404 });
    }

    // Log successful response
    console.debug('Successful episode fetch:', {
      episodeId: episode._id,
      episodeName: episode.name,
      status: episode.status
    });

    return NextResponse.json({
      success: true,
      episode
    });
  } catch (error: any) {
    // Enhanced error logging
    const errorDetails = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      type: typeof error,
      isError: error instanceof Error,
      keys: Object.keys(error || {})
    };
    
    console.error('Error fetching episode:', errorDetails);
    
    return NextResponse.json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch episode',
        details: errorDetails
      }
    }, { status: 500 });
  }
} 
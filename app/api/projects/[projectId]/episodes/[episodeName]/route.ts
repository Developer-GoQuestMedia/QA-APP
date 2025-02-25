import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { authOptions } from '@/app/api/auth/auth.config';

interface DebugLogData {
  error?: {
    message: string;
    name: string;
    stack?: string;
  };
  projectId?: string;
  username?: string;
  role?: string;
  collection?: string;
  queryId?: string;
  queryObject?: string;
  id?: string;
  hasEpisodes?: boolean;
  episodeCount?: number;
  title?: string;
  projectData?: string;
  rawEpisodeName?: string;
  decodedEpisodeName?: string;
  episodeName?: string;
  url?: string;
  availableEpisodes?: Array<{
    name: string;
    status: string;
    id?: string;
  }>;
  searchedName?: string;
  name?: string;
  status?: string;
  episodeData?: string;
}

function debugLog(message: string, data?: DebugLogData) {
  console.debug(`[Episode API] ${message}`, {
    ...data,
    timestamp: new Date().toISOString()
  });
}

// Helper function to verify database connection
async function verifyDatabaseConnection() {
  try {
    const { db } = await connectToDatabase();
    return { success: true, db };
  } catch (error) {
    return { success: false, error };
  }
}

interface EpisodeParams {
  projectId: string;
  episodeName: string;
}

interface EpisodeData {
  _id: ObjectId;
  name: string;
  status: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectData {
  _id: ObjectId;
  title: string;
  episodes?: EpisodeData[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: EpisodeParams }
): Promise<NextResponse> {
  debugLog('=== EPISODE FETCH START ===');
  debugLog('Request URL', { url: request.url });
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      debugLog('No session found', { 
        error: { 
          message: 'Unauthorized', 
          name: 'AuthError' 
        } 
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow both admin and voice-over users
    if (!['admin', 'voiceOver'].includes(session.user.role)) {
      debugLog('Unauthorized role', { 
        error: { 
          message: 'Insufficient permissions', 
          name: 'AuthError' 
        },
        role: session.user.role
      });
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { projectId, episodeName } = params;
    if (!projectId || !episodeName) {
      debugLog('Missing required parameters', { 
        projectId, 
        episodeName 
      });
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    debugLog('Received request', { 
      projectId, 
      episodeName 
    });

    // Validate parameters
    if (!ObjectId.isValid(projectId)) {
      debugLog('Invalid projectId format', { projectId });
      return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 });
    }
    debugLog('Parameters valid', { 
      projectId, 
      episodeName 
    });

    // Verify database connection
    debugLog('Verifying database connection...');
    const { success, db, error } = await verifyDatabaseConnection();
    if (!success || !db) {
      debugLog('Database connection failed', { error });
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }
    debugLog('Database connection verified');

    // Fetch project
    const query = { _id: new ObjectId(projectId) };
    debugLog('Executing MongoDB query', { 
      collection: 'projects', 
      queryId: query._id.toString(),
      queryObject: JSON.stringify(query)
    });
    
    const project = await db.collection<ProjectData>('projects').findOne(query);
    if (!project) {
      debugLog('Project not found', { projectId });
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    debugLog('Project found', { 
      id: project._id.toString(),
      hasEpisodes: !!project.episodes,
      episodeCount: project.episodes?.length || 0,
      title: project.title,
      projectData: JSON.stringify(project)
    });

    // Validate episodes array
    if (!Array.isArray(project.episodes) || project.episodes.length === 0) {
      debugLog('No episodes in project', { projectId, title: project.title });
      return NextResponse.json({ error: 'Project has no episodes' }, { status: 404 });
    }

    // Find specific episode
    const decodedEpisodeName = decodeURIComponent(episodeName);
    debugLog('Episode search details', {
      rawEpisodeName: episodeName,
      decodedEpisodeName: decodedEpisodeName,
      availableEpisodes: project.episodes.map(ep => ({
        name: ep.name,
        status: ep.status,
        id: ep._id?.toString()
      }))
    });

    const episode = project.episodes.find(ep => 
      ep.name.toLowerCase() === decodedEpisodeName.toLowerCase()
    );

    if (!episode) {
      debugLog('Episode not found', { 
        searchedName: decodedEpisodeName,
        availableEpisodes: project.episodes.map(ep => ({
          name: ep.name,
          status: ep.status
        }))
      });
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    // Return episode data
    debugLog('Episode found', { 
      name: episode.name, 
      status: episode.status,
      episodeData: JSON.stringify(episode)
    });
    debugLog('=== EPISODE FETCH END ===');
    
    return NextResponse.json({ 
      episode: {
        _id: episode._id?.toString() || projectId,
        name: episode.name,
        status: episode.status,
        projectId: projectId,
        createdAt: episode.createdAt || new Date(),
        updatedAt: episode.updatedAt || new Date()
      }
    });

  } catch (error) {
    const err = error as Error;
    debugLog('Unhandled error', { 
      error: {
        message: err.message,
        name: err.name,
        stack: err.stack
      }
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 
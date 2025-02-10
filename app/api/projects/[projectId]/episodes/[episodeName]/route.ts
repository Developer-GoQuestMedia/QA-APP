import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { authOptions } from '@/lib/auth';

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
  const timestamp = new Date().toISOString();
  const prefix = '🔍 [EPISODE_DEBUG]';
  if (data) {
    console.log(`${prefix} [${timestamp}] ${message}:`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} [${timestamp}] ${message}`);
  }
}

// Helper function to verify database connection
async function verifyDatabaseConnection() {
  try {
    debugLog('Attempting database connection');
    const { db, client } = await connectToDatabase();
    const result = await client.db().command({ ping: 1 });
    debugLog('Database ping result', result);
    return { success: true, db };
  } catch (error) {
    const err = error as Error;
    debugLog('Database connection error', { 
      error: {
        message: err.message,
        name: err.name,
        stack: err.stack
      }
    });
    return { success: false, error: err };
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

    // 1. Verify session
    const sessionData = await getServerSession(authOptions);
    if (!sessionData?.user?.username || !sessionData?.user?.role) {
      debugLog('Unauthorized: Invalid session data');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    debugLog('Session verified', { 
      username: sessionData.user.username, 
      role: sessionData.user.role 
    });

    // 2. Validate parameters
    if (!ObjectId.isValid(projectId)) {
      debugLog('Invalid projectId format', { projectId });
      return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 });
    }
    debugLog('Parameters valid', { 
      projectId, 
      episodeName 
    });

    // 3. Verify database connection
    debugLog('Verifying database connection...');
    const { success, db, error } = await verifyDatabaseConnection();
    if (!success || !db) {
      debugLog('Database connection failed', { error });
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }
    debugLog('Database connection verified');

    // 4. Fetch project
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

    // 5. Validate episodes array
    if (!Array.isArray(project.episodes) || project.episodes.length === 0) {
      debugLog('No episodes in project', { projectId, title: project.title });
      return NextResponse.json({ error: 'Project has no episodes' }, { status: 404 });
    }

    // 6. Find specific episode
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

    // 7. Return episode data
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
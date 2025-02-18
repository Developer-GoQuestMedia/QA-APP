import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: Request,
  { params }: { params: { episodeId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const episodeId = params.episodeId;

    console.log('Debug - Received params:', { 
      projectId, 
      episodeId,
      projectIdType: typeof projectId,
      episodeIdType: typeof episodeId
    });

    if (!projectId || !episodeId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const db = await getMongoDb();

    // Improve project query with error handling
    let projectObjectId;
    try {
      projectObjectId = new ObjectId(projectId);
    } catch (error) {
      console.error('Invalid project ID format:', projectId);
      return NextResponse.json(
        { error: 'Invalid project ID format' },
        { status: 400 }
      );
    }

    // First find the project with more detailed query
    const project = await db.collection('projects').findOne(
      { _id: projectObjectId },
      { projection: { episodes: 1, title: 1 } } // Only fetch needed fields
    );

    console.log('Debug - Project query:', {
      queryId: projectObjectId.toString(),
      found: !!project,
      hasEpisodes: !!project?.episodes,
      episodeCount: project?.episodes?.length,
      projectTitle: project?.title
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found', details: { projectId } },
        { status: 404 }
      );
    }

    // Then find the episode within the project's episodes array
    const episode = project.episodes?.find((ep: any) => {
      // Convert both IDs to strings for comparison
      const epId = ep._id instanceof ObjectId 
        ? ep._id.toString() 
        : typeof ep._id === 'object' && ep._id?.$oid 
          ? ep._id.$oid 
          : String(ep._id);
      
      // Since episodeId is a string from params, we just need to ensure it's a string
      const targetEpisodeId = String(episodeId);

      console.log('Debug - Comparing episode IDs:', {
        episodeId: targetEpisodeId,
        currentEpId: epId,
        episodeData: ep,
        matches: epId === targetEpisodeId
      });

      return epId === targetEpisodeId;
    });

    console.log('Debug - Episode found:', {
      found: !!episode,
      episodeId,
      episodeData: episode
    });

    if (!episode) {
      return NextResponse.json(
        { error: 'Episode not found in project', details: {
          projectId,
          episodeId,
          availableEpisodeIds: project.episodes?.map((ep: any) => {
            const epId = ep._id instanceof ObjectId 
              ? ep._id.toString() 
              : typeof ep._id === 'object' && ep._id?.$oid 
                ? ep._id.$oid 
                : String(ep._id);
            return { id: epId, name: ep.name };
          })
        }},
        { status: 404 }
      );
    }

    // Normalize episode data before returning
    const normalizedEpisode = {
      ...episode,
      videoKey: episode.videoKey || episode.videokey, // Handle inconsistent casing
      _id: episode._id instanceof ObjectId 
        ? episode._id.toString() 
        : typeof episode._id === 'object' && episode._id?.$oid 
          ? episode._id.$oid 
          : String(episode._id)
    };

    return NextResponse.json({ episode: normalizedEpisode });
  } catch (error) {
    console.error('Error fetching episode:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      params: {
        url: request.url,
        episodeId: params.episodeId,
        projectId: new URL(request.url).searchParams.get('projectId')
      }
    });

    const errorMessage = error instanceof Error 
      ? `Failed to fetch episode data: ${error.message}`
      : 'Failed to fetch episode data';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 
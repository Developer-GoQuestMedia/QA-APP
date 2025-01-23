import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import axios from 'axios';

export async function POST(
  request: Request,
  { params }: { params: { episodeId: string } }
) {
  console.log('API call request received:', {
    episodeId: params.episodeId,
    params
  });

  // 1) Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!params.episodeId) {
    console.error('Episode ID missing in params');
    return NextResponse.json(
      { error: 'Episode ID is required' },
      { status: 400 }
    );
  }

  // 2) Parse request body
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // 3) Basic DB check
  const { db } = await connectToDatabase();
  const episodeObjectId = new ObjectId(params.episodeId);
  const episodeDoc = await db.collection('projects').findOne(
    { 'episodes._id': episodeObjectId },
    { projection: { 'episodes.$': 1 } }
  );
  if (!episodeDoc || !episodeDoc.episodes?.[0]) {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
  }

  // 4) Return an immediate success response so we don’t block/wait.
  const immediateResponse = NextResponse.json({
    success: true,
    message: 'API call started in the background. Poll status to see updates.',
  });

  /**
   * 5) Fire & forget: In the background, call the API
   *    and update the DB with the date/time of the call.
   */
  (async () => {
    try {
      console.log('Calling external API in the background...');
      const apiResponse = await axios.post(
        'https://some-external-api.com/whatever',
        {
          // Pass along whatever data you need
          name: requestBody.name,
          videoPath: requestBody.videoPath,
          videoKey: requestBody.videoKey,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          // Optionally set a timeout
          timeout: 1000 * 60, // 60 seconds, for example
        }
      );

      // Just log or store the response if needed
      console.log('API response received (background)', apiResponse.data);

      // Update DB with the date/time (and optionally the response)
      await db.collection('projects').updateOne(
        { 'episodes._id': episodeObjectId },
        {
          $set: {
            'episodes.$.lastApiCall': new Date(),
            'episodes.$.apiCallMessage': `API called successfully at ${new Date().toISOString()}`,
          }
        }
      );
    } catch (error: any) {
      console.error('Background API call error:', error.message);
      // Optionally update DB with error details
      await db.collection('projects').updateOne(
        { 'episodes._id': episodeObjectId },
        {
          $set: {
            'episodes.$.apiCallMessage': `API call failed at ${new Date().toISOString()}: ${error.message}`,
          },
        }
      );
    }
  })();

  // Return immediately so Next.js does not kill the route
  return immediateResponse;
}

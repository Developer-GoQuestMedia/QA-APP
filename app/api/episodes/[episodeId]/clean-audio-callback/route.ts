import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
// If you need authentication, import getServerSession and authOptions:
// import { getServerSession } from 'next-auth';
// import { authOptions } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { episodeId: string } }
) {
  // Optional: If you want to validate a user session, uncomment the lines below:
  /*
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  */

  if (!params.episodeId) {
    return NextResponse.json(
      { error: 'episodeId is required in the URL.' },
      { status: 400 }
    );
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    inputParameters,
    cleanedSpeechPath,
    cleanedSpeechKey,
    musicAndSoundEffectsPath,
    musicAndSoundEffectsKey,
  } = body;

//   // Validate required fields
//   if (
//     !inputParameters ||
//     !cleanedSpeechPath ||
//     !cleanedSpeechKey ||
//     !musicAndSoundEffectsPath ||
//     !musicAndSoundEffectsKey
//   ) {
//     return NextResponse.json(
//       {
//         error:
//           'Missing one of the required fields: inputParameters, cleanedSpeechPath, cleanedSpeechKey, musicAndSoundEffectsPath, musicAndSoundEffectsKey',
//       },
//       { status: 400 }
//     );
//   }

  try {
    const { db } = await connectToDatabase();

    // Confirm the episode exists
    const episodeObjectId = new ObjectId(params.episodeId);
    const findEpisode = await db.collection('projects').findOne(
      { 'episodes._id': episodeObjectId },
      { projection: { 'episodes.$': 1 } }
    );

    if (!findEpisode || !findEpisode.episodes?.[0]) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    // Update that episode’s step1 object
    await db.collection('projects').updateOne(
      { 'episodes._id': episodeObjectId },
      {
        $set: {
          'episodes.$.step1': {
            inputParameters,
            cleanedSpeechPath,
            cleanedSpeechKey,
            musicAndSoundEffectsPath,
            musicAndSoundEffectsKey,
            updatedAt: new Date(),
          },
        },
      }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating episode:', error);
    return NextResponse.json(
      { error: 'Failed to update the episode data.' },
      { status: 500 }
    );
  }
}

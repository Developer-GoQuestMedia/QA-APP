import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(
  request: Request,
  { params }: { params: { episodeId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    
    // Find the episode
    const episode = await db.collection('projects').findOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      { projection: { 'episodes.$': 1 } }
    );

    if (!episode || !episode.episodes?.[0]) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    const targetEpisode = episode.episodes[0];

    // Verify episode has completed step 4
    if (targetEpisode.steps?.step4?.status !== 'completed') {
      return NextResponse.json(
        { error: 'Episode must complete step 4 first' },
        { status: 400 }
      );
    }

    // Get translation data from step 4
    const translationData = targetEpisode.steps?.step4?.translationData;
    if (!translationData || !translationData.dialogues || !Array.isArray(translationData.dialogues)) {
      return NextResponse.json(
        { error: 'Invalid translation data from step 4' },
        { status: 400 }
      );
    }

    // Extract unique characters and count their dialogues
    const characterDialogues = new Map<string, number>();
    const characterSamples = new Map<string, string>();
    
    translationData.dialogues.forEach((dialogue: { characterName: string; translatedText: string }) => {
      const count = characterDialogues.get(dialogue.characterName) || 0;
      characterDialogues.set(dialogue.characterName, count + 1);
      
      // Store first dialogue as sample if not already stored
      if (!characterSamples.has(dialogue.characterName)) {
        characterSamples.set(dialogue.characterName, dialogue.translatedText);
      }
    });

    const characters = Array.from(characterDialogues.entries()).map(([characterName, dialogueCount]) => ({
      characterName,
      dialogueCount,
      sampleDialogue: characterSamples.get(characterName),
    }));

    // Update status to processing and store character analysis
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step5.status': 'processing',
          'episodes.$.step': 5,
          'episodes.$.steps.step5.characters': characters,
        }
      }
    );

    return NextResponse.json({
      success: true,
      characters,
      message: 'Character analysis completed'
    });
  } catch (error: any) {
    console.error('Error in step 5:', error);
    
    // Update status to error
    const { db } = await connectToDatabase();
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step5.status': 'error',
          'episodes.$.steps.step5.error': error.message,
        }
      }
    );

    return NextResponse.json(
      { error: 'Failed to process step 5' },
      { status: 500 }
    );
  }
} 
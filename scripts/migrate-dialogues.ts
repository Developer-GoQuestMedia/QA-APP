import mongoose from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import { WordDetail, CharacterProfile } from '../types/dialogue';
import { Collection } from 'mongodb';

// Setup __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
config({ path: envPath });

// Debug: Check if env vars are loaded
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://vivekkumarsingh:dGeuK817ItxjmUb4@cluster0.vir7o.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

async function generateAndUpdateWords(dialoguesCollection: Collection) {
  console.log('\nStarting word generation preview...');
  
  // Get a sample document with non-empty dialogue
  const sampleDoc = await dialoguesCollection.findOne({
    'dialogue.original': { $exists: true, $ne: '' }
  });

  if (!sampleDoc) {
    // If no document with non-empty dialogue found, try to find any document
    const anyDoc = await dialoguesCollection.findOne({});
    console.log('No documents found with non-empty dialogue. Sample document:', 
      JSON.stringify(anyDoc?.dialogue || {}, null, 2));
    return;
  }

  // Update index normalization
  const normalizedIndex = await normalizeIndex(sampleDoc);
  if (normalizedIndex === null) {
    console.log('Warning: Could not normalize index for sample document');
  }

  // Generate sample words for preview
  const originalText = sampleDoc.dialogue?.original || '';
  if (!originalText.trim()) {
    console.log('Sample document has empty dialogue text');
    return;
  }

  const wordList = originalText
    .trim()
    .split(/\s+/)
    .filter((word: string) => word.length > 0);

  const sampleWordObjects: WordDetail[] = wordList.map((word: string, index: number) => ({
    characterName: sampleDoc.character,
    wordSequenceNumber: index + 1,
    word: word,
    wordTimestamp: sampleDoc.timeStart,
    dialogNumber: sampleDoc.index,
    dialogStartTimestamp: sampleDoc.timeStart,
    dialogEndTimestamp: sampleDoc.timeEnd,
    dialogVocalFile: sampleDoc.voiceOverUrl || '',
    characterProfile: {
      age: '',
      occupation: '',
      accents: [],
      otherNotes: ''
    } as CharacterProfile,
    numberOfLipMovementsForThisWord: 0
  }));

  console.log('\nSample document:');
  console.log('Original text:', originalText);
  console.log('\nGenerated words array (first 3 items):', JSON.stringify(sampleWordObjects.slice(0, 3), null, 2));

  // Ask for confirmation
  console.log('\nWould you like to proceed with updating all documents? (y/n)');
  const response = await new Promise(resolve => {
    process.stdin.once('data', data => {
      resolve(data.toString().trim().toLowerCase());
    });
  });

  if (response !== 'y') {
    console.log('Operation cancelled by user');
    return;
  }

  // Proceed with full update
  const allDocs = await dialoguesCollection.find({
    'dialogue.original': { $exists: true, $ne: '' }
  }).toArray();
  
  console.log(`\nProceeding to update ${allDocs.length} documents...`);
  let updatedCount = 0;

  for (const doc of allDocs) {
    if (doc.words && doc.words.length > 0) {
      console.log(`Skipping document ${doc._id} - already has words`);
      continue;
    }

    const wordObjects = generateWordsForDoc(doc);
    await dialoguesCollection.updateOne(
      { _id: doc._id },
      { $set: { words: wordObjects } }
    );
    updatedCount++;
    
    if (updatedCount % 10 === 0) {
      console.log(`Progress: ${updatedCount}/${allDocs.length} documents updated`);
    }
  }

  console.log(`\nWord generation completed. Updated ${updatedCount} documents`);
}

function generateWordsForDoc(doc: any): WordDetail[] {
  const originalText = doc.dialogue?.original || '';
  if (!originalText.trim()) {
    console.log(`Document ${doc._id} has empty dialogue text`);
    return [];
  }

  // Enhanced text cleaning
  const cleanText = originalText
    .trim()  // Remove leading/trailing whitespace and newlines
    .replace(/\.{3,}/g, ' ')  // Replace ellipsis with space
    .replace(/[.,!?।॥…\n\r]+/g, ' ')  // Replace punctuation and newlines with space
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .trim();  // Final trim

  // Split into words and filter
  const wordList = cleanText
    .split(' ')
    .filter((word: string) => {
      const cleaned = word.trim();
      return cleaned.length > 0 && 
             !/^[.,!?।॥…]+$/.test(cleaned) &&  // Not just punctuation
             !/^\d+$/.test(cleaned);           // Not just numbers
    });

  if (wordList.length === 0) {
    console.log(`Document ${doc._id} has no valid words after cleaning`);
    return [];
  }

  // Calculate time distribution
  const startTime = doc.timeStart || '';
  const endTime = doc.timeEnd || '';
  const timePerWord = calculateTimePerWord(startTime, endTime, wordList.length);

  // Preview for debugging
  if (process.env.DEBUG) {
    console.log(`\nDocument ${doc._id} text processing:
    Original: "${originalText}"
    Cleaned: "${cleanText}"
    Words: ${JSON.stringify(wordList)}
    Time per word: ${timePerWord}ms`);
  }

  return wordList.map((word: string, index: number) => {
    const cleanWord = word.trim();
    const lipMovements = calculateLipMovements(cleanWord);
    const wordTimestamp = calculateWordTimestamp(startTime, timePerWord, index);

    return {
      characterName: doc.character || '',
      wordSequenceNumber: index + 1,
      word: cleanWord,
      wordTimestamp,
      dialogNumber: normalizeIndex(doc),
      dialogStartTimestamp: startTime,
      dialogEndTimestamp: endTime,
      dialogVocalFile: doc.voiceOverUrl || '',
      characterProfile: {
        age: doc.characterProfile?.age || '',
        occupation: doc.characterProfile?.occupation || '',
        accents: doc.characterProfile?.accents || [],
        otherNotes: doc.characterProfile?.otherNotes || ''
      } as CharacterProfile,
      numberOfLipMovementsForThisWord: lipMovements
    };
  });
}

// Helper function to calculate time per word
function calculateTimePerWord(startTime: string, endTime: string, wordCount: number): number {
  try {
    const [startHours, startMinutes, startSeconds, startMillis] = startTime.split(':').map(Number);
    const [endHours, endMinutes, endSeconds, endMillis] = endTime.split(':').map(Number);
    
    const startTotalMillis = (startHours * 3600000) + (startMinutes * 60000) + (startSeconds * 1000) + startMillis;
    const endTotalMillis = (endHours * 3600000) + (endMinutes * 60000) + (endSeconds * 1000) + endMillis;
    
    return Math.floor((endTotalMillis - startTotalMillis) / wordCount);
  } catch (error) {
    console.warn('Error calculating time per word, using default spacing');
    return 500; // Default 500ms per word
  }
}

// Helper function to calculate word timestamp
function calculateWordTimestamp(startTime: string, timePerWord: number, wordIndex: number): string {
  try {
    const [hours, minutes, seconds, millis] = startTime.split(':').map(Number);
    const startTotalMillis = (hours * 3600000) + (minutes * 60000) + (seconds * 1000) + millis;
    const wordTimeMillis = startTotalMillis + (timePerWord * wordIndex);
    
    const newHours = Math.floor(wordTimeMillis / 3600000);
    const newMinutes = Math.floor((wordTimeMillis % 3600000) / 60000);
    const newSeconds = Math.floor((wordTimeMillis % 60000) / 1000);
    const newMillis = wordTimeMillis % 1000;
    
    return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')}:${newMillis.toString().padStart(3, '0')}`;
  } catch (error) {
    console.warn('Error calculating word timestamp, using start time');
    return startTime;
  }
}

// Enhanced lip movement calculation
function calculateLipMovements(word: string): number {
  // Handle Devanagari text
  if (/[\u0900-\u097F]/.test(word)) {
    return calculateDevanagariLipMovements(word);
  }
  
  // Handle English/Latin text
  return calculateEnglishLipMovements(word);
}

function calculateDevanagariLipMovements(word: string): number {
  // Count matras (vowel marks) and explicit vowels
  const matraCount = (word.match(/[\u093E-\u094D\u0955-\u0963]/g) || []).length;
  const vowelCount = (word.match(/[\u0904-\u0914]/g) || []).length;
  const halfLetterCount = (word.match(/्[कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह]/g) || []).length;
  
  // Basic syllable count: matras + explicit vowels + half letters
  const syllables = matraCount + vowelCount + halfLetterCount;
  return Math.max(1, syllables);
}

function calculateEnglishLipMovements(word: string): number {
  const syllableRegex = /[^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))?/gi;
  const matches = word.match(syllableRegex);
  return matches ? matches.length : 1;
}

// Add debug preview function
async function previewWordGeneration(doc: Record<string, any>): Promise<WordDetail[]> {
  console.log('\nSample document:');
  console.log('Original text:', JSON.stringify(doc.dialogue?.original));
  
  const words = generateWordsForDoc(doc);
  console.log('\nGenerated words:', JSON.stringify(words, null, 2));
  
  // Additional debug info
  if (words.length > 0) {
    console.log('\nWord timing distribution:');
    words.forEach(w => {
      console.log(`"${w.word}": ${w.wordTimestamp} (${w.numberOfLipMovementsForThisWord} lip movements)`);
    });
  }
  
  return words;
}

async function normalizeIndex(doc: any): Promise<number> {
  if (!doc.index) return 0;
  
  try {
    if (typeof doc.index === 'object') {
      if (doc.index.$numberInt) {
        return parseInt(doc.index.$numberInt, 10);
      }
      return 0;
    }
    
    if (typeof doc.index === 'string') {
      // Handle string indices like "04"
      return parseInt(doc.index, 10);
    }
    
    if (typeof doc.index === 'number') {
      return doc.index;
    }
    
    return 0;
  } catch (error) {
    console.error(`Error normalizing index for document ${doc._id}:`, error);
    return 0;
  }
}

async function verifyDocument(doc: any) {
  const issues: string[] = [];
  
  // Check index specifically
  const normalizedIndex = await normalizeIndex(doc);
  if (normalizedIndex === 0 && doc.index !== 0) {
    issues.push(`Invalid index: ${JSON.stringify(doc.index)}`);
  }
  
  // Check required fields
  if (!doc.index || typeof doc.index !== 'number') issues.push('Invalid index');
  if (!doc.timeStart || typeof doc.timeStart !== 'string') issues.push('Invalid timeStart');
  if (!doc.timeEnd || typeof doc.timeEnd !== 'string') issues.push('Invalid timeEnd');
  if (!doc.character || typeof doc.character !== 'string') issues.push('Invalid character');
  if (typeof doc.videoUrl !== 'string') issues.push('Invalid videoUrl');
  if (!doc.status || typeof doc.status !== 'string') issues.push('Invalid status');
  
  // Check dialogue structure
  if (!doc.dialogue || 
      typeof doc.dialogue.original !== 'string' ||
      typeof doc.dialogue.translated !== 'string' ||
      typeof doc.dialogue.adapted !== 'string') {
    issues.push('Invalid dialogue structure');
  }
  
  // Check emotions structure
  if (!doc.emotions?.primary ||
      typeof doc.emotions.primary.emotion !== 'string' ||
      typeof doc.emotions.primary.intensity !== 'number' ||
      doc.emotions.primary.intensity < 0 ||
      doc.emotions.primary.intensity > 100) {
    issues.push('Invalid emotions structure');
  }
  
  // Check words array if it exists
  if (doc.words) {
    if (!Array.isArray(doc.words)) {
      issues.push('Invalid words array');
    } else {
      const invalidWords = doc.words.some((word: any) => 
        !word.word || 
        typeof word.word !== 'string' ||
        !word.wordSequenceNumber ||
        typeof word.wordSequenceNumber !== 'number'
      );
      if (invalidWords) issues.push('Invalid word objects in words array');
    }
  }
  
  // Check scenario object
  if (!doc.scenario || 
      typeof doc.scenario !== 'object' ||
      typeof doc.scenario.name !== 'string' ||
      typeof doc.scenario.description !== 'string' ||
      typeof doc.scenario.location !== 'string' ||
      typeof doc.scenario.timeOfDay !== 'string') {
    issues.push('Invalid scenario object');
  }
  
  return issues.length ? issues : 'No issues found';
}

async function migrationScript() {
  let connection: typeof mongoose | null = null;
  try {
    // Connect to MongoDB
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }
    
    console.log('Attempting to connect to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Failed to get database instance');
    }
    console.log('Got database instance');
    console.log('Database name:', db.databaseName);

    const dialoguesCollection = db.collection('demo_S1_E1');
    console.log('Accessing dialogues collection...');
    
    // Check if collection exists and has documents
    const count = await dialoguesCollection.countDocuments();
    console.log('Total documents in collection:', count);

    // Add this: Check structure of first document
    const sampleDoc = await dialoguesCollection.findOne({});
    console.log('Sample document structure:', JSON.stringify(sampleDoc, null, 2));

    // After getting sample document, add this check
    console.log('\nChecking index patterns...');
    const indexPatterns = await dialoguesCollection.distinct('index');
    console.log('Unique indices:', indexPatterns.sort((a, b) => a - b));

    // Also check index distribution
    const indexCounts = await dialoguesCollection.aggregate([
      { $group: { _id: "$index", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    
    console.log('\nIndex distribution:');
    console.log(JSON.stringify(indexCounts, null, 2));

    // After index distribution check and before main update
    console.log('\nStarting word generation...');
    await generateAndUpdateWords(dialoguesCollection);

    // Then continue with the main update
    console.log('Starting update operation...');
    const result = await dialoguesCollection.updateMany(
      {},  // Match all documents
      [    // Use aggregation pipeline for complex transformations
        {
          $set: {
            // Normalize index first
            index: {
              $convert: {
                input: {
                  $cond: {
                    if: { $eq: [{ $type: "$index" }, "object"] },
                    then: { $toInt: "$index.numberInt" },
                    else: {
                      $cond: {
                        if: { $eq: [{ $type: "$index" }, "string"] },
                        then: { $toInt: "$index" },
                        else: { $ifNull: ["$index", 0] }
                      }
                    }
                  }
                },
                to: "int",
                onError: 0,
                onNull: 0
              }
            },
            // Convert lipMovements to string using $toInt and $toString
            lipMovements: {
              $let: {
                vars: {
                  numValue: {
                    $cond: {
                      if: { $eq: [{ $type: "$lipMovements" }, "object"] },
                      then: { $toInt: "$lipMovements.numberInt" },
                      else: { $toInt: { $ifNull: ["$lipMovements", "0"] } }
                    }
                  }
                },
                in: { $toString: "$$numValue" }
              }
            },

            // Ensure required fields exist with default values if missing
            timeStart: { $ifNull: ["$timeStart", ""] },
            timeEnd: { $ifNull: ["$timeEnd", ""] },
            character: { $ifNull: ["$character", ""] },
            videoUrl: { $ifNull: ["$videoUrl", ""] },
            status: { $ifNull: ["$status", "pending"] },

            // Ensure dialogue structure
            dialogue: {
              $ifNull: ["$dialogue", {
                original: "",
                translated: "",
                adapted: ""
              }]
            },

            // Fix emotions structure and types
            emotions: {
              $ifNull: ["$emotions", {
                primary: {
                  emotion: "",
                  intensity: 0
                }
              }]
            },

            // Add missing arrays/objects if not present
            words: { $ifNull: ["$words", []] },  // Just set empty array if missing
            scenario: { 
              $ifNull: ["$scenario", {
                name: "",
                description: "",
                location: "",
                timeOfDay: "",
                otherScenarioNotes: ""
              }]
            },

            // Optional fields with proper types
            direction: { $ifNull: ["$direction", ""] },
            sceneContext: { $ifNull: ["$sceneContext", ""] },
            technicalNotes: { $ifNull: ["$technicalNotes", ""] },
            culturalNotes: { $ifNull: ["$culturalNotes", ""] },
            voiceOverNotes: { $ifNull: ["$voiceOverNotes", ""] },
            directorNotes: { $ifNull: ["$directorNotes", ""] },
            recordingStatus: { $ifNull: ["$recordingStatus", ""] },
            projectId: { $ifNull: ["$projectId", ""] },
            updatedAt: { $ifNull: ["$updatedAt", new Date().toISOString()] },
            updatedBy: { $ifNull: ["$updatedBy", ""] },

            // Handle voiceOverUrl and deleteVoiceOver
            voiceOverUrl: { $ifNull: ["$voiceOverUrl", "$audioUrl"] },
            deleteVoiceOver: { $ifNull: ["$deleteVoiceOver", false] }
          }
        },
        {
          $unset: ["audioUrl"]  // Remove redundant audioUrl field
        }
      ]
    );

    console.log(`Migration completed. Modified ${result.modifiedCount} documents`);

    console.log('Verifying updated documents...');
    
    // Sample verification of a few documents
    const verifiedDocs = await dialoguesCollection.find({}).limit(10).toArray();
    const verificationResults = await Promise.all(verifiedDocs.map(async doc => ({
      _id: doc._id,
      index: doc.index,
      issues: await verifyDocument(doc)
    })));
    
    console.log('\nVerification Results:');
    console.log(JSON.stringify(verificationResults, null, 2));
    
    // Count documents with specific fields to verify
    const stats = {
      total: await dialoguesCollection.countDocuments(),
      withWords: await dialoguesCollection.countDocuments({ words: { $exists: true } }),
      withScenario: await dialoguesCollection.countDocuments({ scenario: { $exists: true } }),
      withEmotions: await dialoguesCollection.countDocuments({ emotions: { $exists: true } }),
      withLipMovements: await dialoguesCollection.countDocuments({ lipMovements: { $exists: true } })
    };
    
    console.log('\nCollection Statistics:');
    console.log(JSON.stringify(stats, null, 2));

  } catch (error) {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    if (connection) {
      try {
        await connection.disconnect();
        console.log('Disconnected from MongoDB');
      } catch (error) {
        console.error('Error during disconnect:', error);
      }
    }
  }
}

// Add process error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the migration
migrationScript(); 
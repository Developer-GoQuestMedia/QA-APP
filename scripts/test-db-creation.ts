import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

// Setup __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://vivekkumarsingh:dGeuK817ItxjmUb4@cluster0.vir7o.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

async function testDatabaseCreation() {
  console.log('Starting database creation test...');
  console.log('Using MongoDB URI:', MONGODB_URI);
  
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    // Create a demo database
    const databaseName = 'demo_test_db';
    const db = client.db(databaseName);
    console.log(`Created database reference: ${databaseName}`);

    // Create test collections
    const collections = [
      'demo_collection_1',
      'demo_collection_2',
      'demo_collection_3'
    ];

    for (const collectionName of collections) {
      try {
        await db.createCollection(collectionName);
        console.log(`Created collection: ${collectionName}`);
      } catch (error: any) {
        if (error.code === 48) {
          console.log(`Collection ${collectionName} already exists`);
        } else {
          console.error(`Error creating collection ${collectionName}:`, error);
          throw error;
        }
      }
    }

    // List all collections to verify
    const collectionsList = await db.listCollections().toArray();
    console.log('\nVerifying collections:');
    collectionsList.forEach(collection => {
      console.log(`- ${collection.name}`);
    });

    // Insert a test document
    const testCollection = db.collection('demo_collection_1');
    await testCollection.insertOne({
      test: true,
      createdAt: new Date(),
      message: 'Test document'
    });
    console.log('\nInserted test document');

    // Verify document
    const doc = await testCollection.findOne({ test: true });
    console.log('Retrieved test document:', doc);

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await client.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the test
testDatabaseCreation()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  }); 
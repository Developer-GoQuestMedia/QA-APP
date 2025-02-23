const { parentPort, workerData } = require('worker_threads');
const { MongoClient } = require('mongodb');

async function createCollections() {
  const { dbName, collections, mongoUri } = workerData;
  const client = await MongoClient.connect(mongoUri);

  try {
    const db = client.db(dbName);
    
    for (const collection of collections) {
      await db.createCollection(collection.name);
      
      // Create indexes in parallel
      await Promise.all([
        db.collection(collection.name).createIndex({ timestamp: 1 }, { background: true }),
        db.collection(collection.name).createIndex({ episodeId: 1 }, { background: true })
      ]);
    }

    parentPort.postMessage({ success: true });
  } catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
  } finally {
    await client.close();
  }
}

createCollections(); 
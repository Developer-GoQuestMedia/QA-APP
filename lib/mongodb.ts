import { MongoClient } from 'mongodb'

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not defined in environment variables')
  throw new Error('Please define MONGODB_URI in your environment files')
}

if (!process.env.MONGODB_DB) {
  console.error('MONGODB_DB is not defined in environment variables')
  throw new Error('Please define MONGODB_DB in your environment files')
}

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB
const options = {}

let client: MongoClient
let clientPromise: Promise<MongoClient>

// Add global type for MongoDB
declare global {
  var mongo: {
    conn: MongoClient | null;
    promise: Promise<MongoClient> | null;
  } | null
}

if (!global.mongo) {
  global.mongo = {
    conn: null,
    promise: null
  }
}

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global.mongo.promise) {
    client = new MongoClient(uri, options)
    global.mongo.conn = client
    global.mongo.promise = client.connect()
  }
  clientPromise = global.mongo.promise!
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

export async function connectToDatabase() {
  try {
    const client = await clientPromise
    const db = client.db(dbName)
    return { client, db }
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error)
    throw error
  }
}

// Export the promisified client for use in other modules
export { clientPromise }

export async function getMongoDb() {
  const clientResolved = await clientPromise;
  console.log('Debug - MongoDB Connection:', {
    dbName,
    uri: uri.replace(/\/\/[^@]+@/, '//***:***@') // Log URI with hidden credentials
  });
  return clientResolved.db(dbName);
}


import { MongoClient } from 'mongodb'

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not defined in environment variables')
  console.log('Available environment variables:', Object.keys(process.env))
  throw new Error('Please define MONGODB_URI in your environment files (.env.local or .env)')
}

if (!process.env.MONGODB_DB) {
  console.error('MONGODB_DB is not defined in environment variables')
  throw new Error('Please define MONGODB_DB in your environment files (.env.local or .env)')
}

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB

let client: MongoClient
let clientPromise: Promise<MongoClient>

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>
  }

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri)
    globalWithMongo._mongoClientPromise = client.connect()
  }
  clientPromise = globalWithMongo._mongoClientPromise
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri)
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


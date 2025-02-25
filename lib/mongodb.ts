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
const options = {
  maxPoolSize: 10,
  minPoolSize: 5,
  maxIdleTimeMS: 60000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  retryReads: true,
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
}

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient>

interface GlobalMongo {
  conn: MongoClient | null;
  promise: Promise<MongoClient> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongo: GlobalMongo | null;
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
      .catch(error => {
        console.error('MongoDB connection error:', error)
        throw error
      })
  }
  clientPromise = global.mongo.promise!
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
    .catch(error => {
      console.error('MongoDB connection error:', error)
      throw error
    })
}

export async function connectToDatabase() {
  try {
    const client = await clientPromise
    const db = client.db(dbName)

    // Verify connection is alive
    await db.command({ ping: 1 })
    console.log('MongoDB connection verified successfully')

    return { client, db }
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error)
    // Attempt to reconnect
    if (client) {
      try {
        await client.close()
      } catch (closeError) {
        console.error('Error closing MongoDB connection:', closeError)
      }
      client = new MongoClient(uri, options)
      clientPromise = client.connect()
      return connectToDatabase()
    }
    throw error
  }
}

// Export the promisified client for use in other modules
export { clientPromise }

export async function getMongoDb() {
  const clientResolved = await clientPromise;
  console.log('Debug - MongoDB Connection:', {
    dbName,
    uri: uri.replace(/\/\/[^@]+@/, '//***:***@'),
    timestamp: new Date().toISOString(),
    connectionState: clientResolved.listenerCount('close') > 0 ? 'connected' : 'disconnected'
  });
  return clientResolved.db(dbName);
}

// Add connection event listeners
if (client) {
  client.on('serverHeartbeatFailed', (event) => {
    console.error('MongoDB server heartbeat failed:', event)
  })

  client.on('topologyOpening', () => {
    console.log('MongoDB topology opening')
  })

  client.on('topologyClosed', () => {
    console.log('MongoDB topology closed')
  })
}

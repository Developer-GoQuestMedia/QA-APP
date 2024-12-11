import { MongoClient, Db } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const MONGODB_DB = process.env.MONGODB_DB || 'test'

interface GlobalMongo {
    conn: { client: MongoClient; db: Db } | null;
    promise: Promise<{ client: MongoClient; db: Db }> | null;
}

declare global {
    var mongodb: GlobalMongo;
}

// Initialize the global mongodb object if it doesn't exist
if (!global.mongodb) {
    global.mongodb = { conn: null, promise: null };
}

const cached = global.mongodb;

export async function connectToDatabase() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const client = new MongoClient(MONGODB_URI);
        cached.promise = client.connect()
            .then((client) => ({
                client,
                db: client.db(MONGODB_DB)
            }));
    }
    cached.conn = await cached.promise;
    return cached.conn;
}

export function getDb(): Db {
    if (!cached?.conn?.db) {
        throw new Error('Database not initialized');
    }
    return cached.conn.db;
}


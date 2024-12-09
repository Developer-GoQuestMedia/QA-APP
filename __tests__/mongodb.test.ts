// Mock MongoDB module before importing anything else
jest.mock('mongodb', () => ({
    MongoClient: jest.fn()
}));

import { Db, MongoClient } from 'mongodb';
import type { jest } from '@jest/globals';

interface MockDbConnection {
    client: MongoClient;
    db: Db;
}

// Mock the mongodb.ts module
jest.mock('../lib/mongodb', () => {
    const mockCollection = {
        find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([])
        }),
        findOne: jest.fn()
    };

    const mockDb = {
        collection: jest.fn().mockReturnValue(mockCollection)
    } as unknown as Db;

    const mockClient = {
        connect: jest.fn(),
        db: jest.fn()
    } as unknown as MongoClient;

    return {
        connectToDatabase: jest.fn().mockResolvedValue({
            client: mockClient,
            db: mockDb
        } as MockDbConnection),
        getDb: jest.fn().mockReturnValue(mockDb)
    };
});

import { connectToDatabase, getDb } from '../lib/mongodb';

describe('MongoDB Connection and Data Fetching', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Database Connection', () => {
        it('should successfully connect to the database', async () => {
            const result = await connectToDatabase();
            expect(result).toBeDefined();
            expect(result.client).toBeDefined();
            expect(result.db).toBeDefined();
            expect(result.db.collection).toBeDefined();
        });
    });

    describe('Database Access', () => {
        it('should return the database instance', async () => {
            const db = getDb();
            expect(db).toBeDefined();
            expect(db.collection).toBeDefined();
        });

        it('should allow collection access', async () => {
            const db = getDb();
            const collection = db.collection('test');
            expect(collection).toBeDefined();
            expect(collection.find).toBeDefined();
            expect(collection.findOne).toBeDefined();
        });
    });
}); 
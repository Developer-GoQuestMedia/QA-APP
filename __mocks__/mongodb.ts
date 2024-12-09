import { MongoClient } from 'mongodb';
import { jest } from '@jest/globals';

const mockCollection = {
    find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
    }),
    findOne: jest.fn(),
};

const mockDb = {
    collection: jest.fn().mockReturnValue(mockCollection),
};

const mockClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    db: jest.fn().mockReturnValue(mockDb),
    close: jest.fn(),
};

export const MongoClient = jest.fn().mockImplementation(() => mockClient) as unknown as typeof MongoClient; 
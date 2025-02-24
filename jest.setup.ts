import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'
import { MockedRequest, MockedResponse, rest } from 'msw'
import { setupServer } from 'msw/node'
import { MongoClient } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: {
      user: {
        name: 'Test User',
        email: 'test@example.com',
        role: 'user',
      },
      expires: new Date(Date.now() + 2 * 86400).toISOString(),
    },
    status: 'authenticated',
  })),
  signIn: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(),
}))

// Mock react-query
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useQueryClient: jest.fn(() => ({
    setQueryData: jest.fn(),
  })),
}))

// Set up DOM environment
Object.defineProperty(global, 'TextEncoder', {
  value: TextEncoder,
})

Object.defineProperty(global, 'TextDecoder', {
  value: TextDecoder,
})

// Mock window.URL
global.URL.createObjectURL = jest.fn(() => 'mock-url')
global.URL.revokeObjectURL = jest.fn()

// Mock MediaRecorder
class MockMediaRecorder {
  start = jest.fn()
  stop = jest.fn()
  pause = jest.fn()
  resume = jest.fn()
  addEventListener = jest.fn()
  removeEventListener = jest.fn()
  state = 'inactive'

  static isTypeSupported(type: string) {
    return true
  }
}

global.MediaRecorder = MockMediaRecorder as any

// Mock HTMLMediaElement
Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: jest.fn(),
})

Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: jest.fn(),
})

// Setup MSW
const handlers = [
  // Auth endpoints
  rest.post('/api/auth/login', (req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ success: true }))
  }),
  
  // Projects endpoints
  rest.get('/api/projects', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        projects: [
          {
            _id: '1',
            title: 'Test Project',
            status: 'active',
          },
        ],
      })
    )
  }),
  
  // Episodes endpoints
  rest.get('/api/episodes', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        episodes: [
          {
            _id: '1',
            name: 'Test Episode',
            status: 'pending',
          },
        ],
      })
    )
  }),
  
  // Voice processing endpoints
  rest.post('/api/voice-models/speech-to-speech', async (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        audioUrl: 'https://example.com/audio.wav',
      })
    )
  }),
]

const server = setupServer(...handlers)

// Setup MongoDB Memory Server
let mongoServer: MongoMemoryServer
let mongoClient: MongoClient

beforeAll(async () => {
  // Start MSW server
  server.listen()
  
  // Start MongoDB Memory Server
  mongoServer = await MongoMemoryServer.create()
  const mongoUri = mongoServer.getUri()
  mongoClient = new MongoClient(mongoUri)
  await mongoClient.connect()
  
  // Set environment variables
  process.env.MONGODB_URI = mongoUri
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
  process.env.NEXTAUTH_SECRET = 'test-secret'
})

afterEach(() => {
  // Reset MSW handlers
  server.resetHandlers()
})

afterAll(async () => {
  // Cleanup
  server.close()
  await mongoClient.close()
  await mongoServer.stop()
})

// Global test utilities
global.testUtils = {
  // Database helpers
  db: {
    clearCollection: async (collectionName: string) => {
      const collection = mongoClient.db().collection(collectionName)
      await collection.deleteMany({})
    },
    insertDocument: async (collectionName: string, document: any) => {
      const collection = mongoClient.db().collection(collectionName)
      await collection.insertOne(document)
    },
  },
  
  // Mock helpers
  mocks: {
    // Add custom MSW handler
    addHandler: (method: string, path: string, handler: (req: MockedRequest, res: MockedResponse, ctx: any) => any) => {
      server.use(
        rest[method as keyof typeof rest](path, handler)
      )
    },
  },
  
  // Auth helpers
  auth: {
    mockSession: (data: any) => {
      const nextAuth = jest.requireMock('next-auth/react')
      nextAuth.useSession.mockImplementation(() => ({
        data,
        status: 'authenticated',
      }))
    },
  },
}
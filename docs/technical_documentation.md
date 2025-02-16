# QA-APP Technical Documentation

## Project Overview

QA-APP is a sophisticated Next.js-based application designed for managing and processing audio/video content with advanced Q&A capabilities. The application features real-time collaboration, voice processing, and comprehensive project management tools with specialized roles including Director, Sr. Director, Transcriber, Translator, and Voice-over artists.

## Technical Stack

### Core Technologies
- **Framework**: Next.js 14.2 with App Router
- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.0+
- **Database**: MongoDB with Prisma ORM
- **Real-time Communication**: Socket.IO
- **Authentication**: NextAuth.js
- **State Management**: React Query (Tanstack Query)
- **Styling**: Tailwind CSS with Shadcn/UI
- **Testing**: Jest with React Testing Library
- **Queue Management**: BullMQ with Redis

### Key Dependencies
- `@prisma/client`: ^5.0.0 - Database ORM
- `socket.io`: ^4.7.0 - Real-time communication
- `next-auth`: ^4.24.0 - Authentication and authorization
- `@tanstack/react-query`: ^5.0.0 - Data fetching and caching
- `mongodb`: ^6.0.0 - Database driver
- `bullmq`: ^4.0.0 - Job queue management
- `@aws-sdk/client-s3`: ^3.0.0 - S3 integration for media storage
- `@vercel/blob`: ^0.15.0 - Blob storage for media files
- `shadcn/ui`: ^1.0.0 - UI components

## System Architecture

### 1. Application Structure
```
app/
├── api/                # API routes
│   ├── auth/          # Authentication endpoints
│   ├── voice-models/  # Voice processing endpoints
│   ├── voice-over/    # Voice-over management
│   ├── dialogues/     # Dialogue management
│   ├── srDirector/    # Sr. Director specific endpoints
│   ├── director/      # Director specific endpoints
│   ├── socket/        # WebSocket endpoints
│   └── admin/         # Admin management
├── components/        # Shared components
│   ├── ui/           # UI components
│   └── providers/    # Context providers
├── lib/              # Core utilities
├── types/            # TypeScript definitions
└── [routes]/         # Application routes
```

### 2. Core Features

#### Role-Based System
- **Sr. Director**: Project oversight and final approval
- **Director**: Project management and review
- **Transcriber**: Audio transcription
- **Translator**: Audio translation
- **Voice-over Artist**: Audio recording and processing
- **Admin**: System management and monitoring

#### Authentication System
- NextAuth.js with custom providers
- Role-based access control
- Secure session management with JWT
- Protected API routes with middleware
- Rate limiting implementation

#### Real-time Communication
- Socket.IO implementation with room management
- Project-specific channels
- Live updates for dialogue changes
- Real-time voice processing status
- Automatic reconnection with state recovery

#### Voice Processing
- Multiple voice model support
- Real-time audio processing
- Noise reduction capabilities
- Progress tracking with WebSocket updates
- S3/Blob storage integration
- Queue-based processing with BullMQ

#### Project Management
- Hierarchical project structure
- Episode and dialogue tracking
- Multi-stage approval process
- Team collaboration features
- Real-time status updates
- Bulk operations support

#### Admin Dashboard
- Comprehensive project oversight
- User management with role assignment
- System monitoring and metrics
- Voice model management
- Audit logging and activity tracking

## API Structure

### REST Endpoints

#### Authentication
- `POST /api/auth/[...nextauth]`: Authentication endpoints
- `GET /api/auth/session`: Session management
- `POST /api/auth/callback`: OAuth callbacks

#### Voice Processing
- `POST /api/voice-models/speech-to-speech`: Voice transformation
- `POST /api/voice-over/process`: Voice-over processing
- `POST /api/noise-reduction`: Audio cleanup

#### Project Management
- `GET /api/srDirector/projects`: Sr. Director projects
- `GET /api/director/projects`: Director projects
- `GET /api/translator/projects`: Translator projects
- `POST /api/dialogues`: Dialogue management
- `PUT /api/dialogues/[id]`: Update dialogues
- `POST /api/dialogues/[id]/translate`: Submit translation

#### Admin
- `GET /api/admin/users`: User management
- `POST /api/admin/voice-models`: Voice model management
- `GET /api/admin/metrics`: System metrics

### Socket Events

#### Project Events
- `dialogueUpdate`: Real-time dialogue changes
- `translationUpdate`: Translation status changes
- `voiceProcessing`: Voice processing status
- `approvalUpdate`: Approval status changes

#### System Events
- `connect`: Socket connection with auth
- `disconnect`: Clean disconnection
- `error`: Error handling with recovery
- `roomJoin`: Project room management

## Database Schema

### Collections

#### Users
```typescript
interface User {
  _id: ObjectId;
  email: string;
  name: string;
  role: 'admin' | 'srDirector' | 'director' | 'transcriber' | 'translator' | 'voiceArtist';
  permissions: string[];
  isActive: boolean;
  lastLogin: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Projects
```typescript
interface Project {
  _id: ObjectId;
  title: string;
  description: string;
  status: 'draft' | 'in-review' | 'approved' | 'in-progress' | 'completed';
  sourceLanguage: string;
  targetLanguage: string;
  assignedRoles: {
    srDirector?: string;
    director?: string;
    transcriber?: string;
    translator?: string;
    voiceArtist?: string;
  };
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Dialogues
```typescript
interface Dialogue {
  _id: ObjectId;
  projectId: ObjectId;
  episodeId: ObjectId;
  content: string;
  translation?: string;
  audioUrl?: string;
  status: 'pending' | 'transcribed' | 'translated' | 'recorded' | 'approved';
  approvals: {
    director?: boolean;
    srDirector?: boolean;
  };
  metadata: {
    duration?: number;
    wordCount?: number;
    lastModifiedBy: string;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

## Security Implementation

### Authentication
- JWT with rotating keys
- Secure session management
- Role-based middleware
- Rate limiting per endpoint
- CSRF protection

### Authorization
- Granular permission system
- Resource-level access control
- API route protection
- WebSocket authentication
- Role hierarchy enforcement

### Data Protection
- Input validation with Zod
- XSS prevention
- CORS configuration
- Rate limiting with Redis
- Secure file handling

## Development Guidelines

### Code Standards
1. TypeScript strict mode required
2. Comprehensive error handling
3. React hooks best practices
4. Component-based architecture
5. Test-driven development

### Best Practices
1. Proper type definitions
2. Loading state management
3. Error boundary implementation
4. Next.js 14 conventions
5. Modular component design
6. Translation workflow management
7. Multi-language support handling

### Performance Optimization
1. React Query caching
2. Redis connection pooling
3. Optimized MongoDB queries
4. Proper indexing strategy
5. Efficient file processing

## Deployment

### Requirements
- Node.js 18+
- MongoDB 6+
- Redis 7+
- AWS S3 bucket
- Environment configuration

### Environment Variables
```env
NEXTAUTH_URL=
NEXTAUTH_SECRET=
MONGODB_URI=
REDIS_URL=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_BUCKET_NAME=
BLOB_READ_WRITE_TOKEN=
```

### Deployment Steps
1. Build application
2. Configure environment
3. Setup database indexes
4. Initialize Redis
5. Configure S3/Blob storage
6. Deploy worker processes

## Monitoring and Maintenance

### System Health
- Socket connection monitoring
- Queue performance tracking
- API response metrics
- Error rate monitoring
- Resource utilization

### Backup and Recovery
- Automated database backups
- Media file redundancy
- System state snapshots
- Data integrity verification

### Error Tracking
- Structured error logging
- Performance monitoring
- User activity tracking
- Queue monitoring
- Real-time alerts

## Future Enhancements

### Planned Features
1. Enhanced analytics dashboard
2. Advanced search capabilities
3. Batch processing improvements
4. Additional voice models
5. Extended API functionality
6. Enhanced translation memory system
7. Machine translation integration
8. Translation quality metrics

### Scalability Plans
1. Horizontal scaling support
2. Load balancing implementation
3. Caching layer enhancement
4. Performance optimization

## Support and Resources

### Documentation
- API Documentation
- Component Documentation
- Database Schema
- Deployment Guide

### Contact
- Technical Support
- Development Team
- Project Management

### Version Control
- GitHub Repository
- Branch Strategy
- Release Process

## Queue System

### Redis Requirements
- Minimum Redis version: 6.2.0 (recommended)
- Redis configuration:
  ```conf
  maxmemory 128mb
  maxmemory-policy allkeys-lru
  ```

### Queue Operations

#### Adding Jobs
```typescript
import { addAudioCleaningJob } from '@/lib/queueJobs';

// Add a new job
const job = await addAudioCleaningJob({
  episodeId: 'episode123',
  name: 'example.mp4',
  videoPath: 's3://bucket/path/example.mp4',
  videoKey: 'unique-key'
});

// Get job status
const status = await getJobStatus(job.id);
```

#### Monitoring
- REST API endpoints:
  - `GET /api/queue/status`: Get overall queue metrics
  - `GET /api/queue/jobs/[jobId]`: Get specific job status

#### Queue Metrics
- Active jobs count
- Waiting jobs count
- Completed jobs count
- Failed jobs count
- Job processing time
- Error rates

#### Job Lifecycle
1. Job Added → Waiting
2. Worker Picks Up → Active
3. Processing → Updates Progress
4. Completion → Success/Failure
5. Cleanup → After retention period

#### Error Handling
- Automatic retries (3 attempts)
- Exponential backoff
- Failed job retention (7 days)
- Error logging and monitoring 
# QA Application Documentation

## Overview
A Next.js-based web application for managing and processing dialogues with multiple user roles including transcribers, translators, voice-over artists, directors, and administrators.

## Technical Stack

### Core Technologies
- **Framework**: Next.js 14.2
- **Language**: TypeScript
- **Database**: MongoDB
- **Authentication**: NextAuth.js
- **State Management**: TanStack React Query
- **Styling**: TailwindCSS
- **Animation**: Framer Motion
- **Testing**: Jest & React Testing Library

### Key Dependencies

#### Backend Services:
- MongoDB for database
- AWS S3 for file storage
- Vercel Blob for asset management

#### Frontend Libraries:
- React 18
- Framer Motion for animations
- TanStack React Query for data fetching
- React Swipeable for touch interactions

## Project Structure

```
├── app/
│   ├── api/                 # API routes
│   ├── allDashboards/      # Role-specific dashboard views
│   ├── components/         # App-specific components
│   ├── dashboard/         # Main dashboard
│   ├── login/            # Authentication pages
│   └── styles/          # Global styles
├── components/         # Reusable components
├── hooks/             # Custom React hooks
├── lib/              # Utility functions and configurations
├── scripts/          # Database seeding scripts
├── types/            # TypeScript type definitions
└── utils/            # Helper functions
```

## Core Components

### View Components:
- **TranscriberView**: For transcribing dialogues
- **TranslatorView**: For translating dialogues
- **VoiceOverView**: For recording voice-overs
- **DirectorView**: For reviewing and approving content
- **AdminView**: For system administration

### Dialogue Components:
- **TranscriberDialogueView**: Detailed dialogue transcription interface
- **TranslatorDialogueView**: Translation interface
- **VoiceOverDialogueView**: Voice recording interface
- **DirectorDialogueView**: Review and approval interface

## Features

### 1. User Management
- Role-based authentication
- Secure login system
- Role-specific dashboards

### 2. Dialogue Processing
- Transcription workflow
- Translation system
- Voice-over recording
- Director review process

### 3. Project Management
- Project creation and organization
- Progress tracking
- Status management

### 4. Media Handling
- Audio recording and playback
- Video playback support
- File upload and storage

## Development Tools

### Testing
- Jest for unit and integration testing
- React Testing Library for component testing
- MongoDB Memory Server for database testing

### Code Quality
- ESLint for code linting
- TypeScript for type safety
- Prettier for code formatting

### Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests
npm run seed         # Seed database
npm run seed:users   # Seed user data
```

## Build and Development Process

### Available Scripts

```bash
# Development
npm run dev          # Start development server

# Testing
npm run test         # Run all tests
npm run test:watch   # Run tests in watch mode

# Building
npm run build        # Complete build process with tests
npm run build:next   # Build Next.js app only
npm run build:test   # Run tests only
npm run build:start  # Build and start the application

# Database
npm run seed         # Seed database
npm run seed:users   # Seed user data

# Production
npm run start        # Start production server
```

### Build Process

The build process is automated and includes several stages:

1. **Test Execution** (`npm run build:test`)
   - Runs all test suites
   - Ensures code quality
   - Validates functionality
   - Continues even if no tests exist

2. **Next.js Build** (`npm run build:next`)
   - Compiles TypeScript code
   - Generates production bundles
   - Optimizes assets
   - Creates static pages where possible

3. **Build Verification** (`scripts/build-success.js`)
   - Displays build success message
   - Shows comprehensive build summary
   - Provides deployment readiness status
   - Interactive prompt for application start

### Build Output

After a successful build, you'll see:

```bash
════════════════════════════════════════════════════════════════════════════════
🎉 Build Completed Successfully! 🎉
✓ All tests passed
✓ Next.js build completed
✓ Application is ready for deployment
════════════════════════════════════════════════════════════════════════════════

Build Summary:
• Environment: Production
• Test Coverage: Passed
• Build Size: Optimized
• Static Pages: Generated
• API Routes: Configured

Would you like to start the application? (y/n):
```

### Build Features

- **Integrated Testing**: Automatically runs all tests before building
- **Interactive**: Option to start the application after successful build
- **Comprehensive Reporting**: Detailed build summary and status
- **Error Handling**: Clear error messages and build failure reporting
- **Production Ready**: Optimized for production deployment

### Common Build Commands

1. **Complete Build Process**:
   ```bash
   npm run build
   ```
   This runs tests, builds the application, and provides an option to start.

2. **Build and Start**:
   ```bash
   npm run build:start
   ```
   Automatically runs the complete build and starts the application.

3. **Development Build**:
   ```bash
   npm run dev
   ```
   Starts the development server with hot reloading.

### Environment Setup

Before building, ensure:
1. All environment variables are properly set
2. Database connections are configured
3. Required dependencies are installed
4. Proper Node.js version is used

### Troubleshooting Build Issues

If you encounter build errors:

1. **Test Failures**:
   - Check test output for specific failures
   - Run `npm run test` for detailed test reports
   - Fix failing tests before proceeding

2. **Build Failures**:
   - Check for TypeScript errors
   - Verify environment variables
   - Ensure all dependencies are installed
   - Clear `.next` directory and rebuild

3. **Runtime Errors**:
   - Check server logs
   - Verify database connections
   - Validate API configurations

## Environment Configuration
Required environment variables:
- `MONGODB_URI`: MongoDB connection string
- `NEXTAUTH_SECRET`: Authentication secret
- `NEXTAUTH_URL`: Authentication URL
- AWS S3 credentials for file storage
- Vercel Blob configuration

## Security Features
- JWT-based authentication
- Secure password hashing (bcryptjs)
- Environment variable protection
- Role-based access control

## Performance Optimizations
- Next.js image optimization
- React Query for efficient data caching
- Lazy loading of components
- Optimized build process

## Deployment
The application is configured for deployment on Vercel with:
- Automatic HTTPS
- Edge functions support
- Asset optimization
- Serverless functions

## Best Practices

### 1. Code Organization:
- Component-based architecture
- Separation of concerns
- TypeScript for type safety

### 2. Security:
- Environment variable protection
- Secure authentication
- Input validation

### 3. Performance:
- Optimized builds
- Efficient data fetching
- Proper caching strategies

## API and Function Documentation

### Custom Hooks

#### `useDialogues(projectId: string)`
A custom hook for fetching and managing dialogue data.
- **Parameters**: 
  - `projectId`: The ID of the project to fetch dialogues for
- **Returns**: Query object containing:
  - `data`: Array of dialogue objects
  - `isLoading`: Loading state
  - `error`: Error state if any
- **Features**:
  - Automatic caching (5 minutes)
  - Data retention (30 minutes)
  - Automatic revalidation
  - Type-safe dialogue interface

#### `useProjects()`
A custom hook for managing project data.
- **Returns**: Query object for project data
- **Features**:
  - Real-time project updates
  - Cached project data
  - Project status tracking

### API Routes

#### Dialogue Management
```typescript
POST /api/dialogues
// Create new dialogue
{
  projectId: string
  index: number
  timeStart: string
  timeEnd: string
  character: string
  dialogue: {
    original: string
    translated: string
    adapted: string
  }
}

PATCH /api/dialogues/:id
// Update dialogue status and content
{
  status: string
  dialogue: {
    original?: string
    translated?: string
    adapted?: string
  }
  voiceOverUrl?: string
}

GET /api/dialogues?projectId=:projectId
// Fetch dialogues for a project
```

#### Media Handling
```typescript
POST /api/upload-voice-over
// Upload voice-over recording
FormData:
  - audio: Blob
  - dialogueId: string
  - dialogueIndex: string
  - projectId: string

GET /api/media/:projectId/:filename
// Fetch media files
```

#### User Management
```typescript
POST /api/auth/login
// User authentication
{
  email: string
  password: string
}

GET /api/users/me
// Get current user profile

PATCH /api/users/:id
// Update user role or status
{
  role?: string
  status?: string
}
```

### Utility Functions

#### Audio Processing
```typescript
// utils/audio.ts
interface AudioConfig {
  sampleRate: number
  channels: number
  format: string
}

processAudio(blob: Blob, config: AudioConfig): Promise<Blob>
// Process audio recordings with specified configuration

mergeAudioTracks(tracks: Blob[]): Promise<Blob>
// Merge multiple audio tracks into single file
```

#### Project Status Management
```typescript
interface ProjectStatus {
  transcribed: number
  translated: number
  voiceOver: number
  approved: number
  total: number
}

calculateProjectProgress(dialogues: Dialogue[]): ProjectStatus
// Calculate project completion statistics
```

### Type Definitions

#### Dialogue Interface
```typescript
interface Dialogue {
  _id: string
  index: number
  timeStart: string
  timeEnd: string
  character: string
  videoUrl: string
  dialogue: {
    original: string
    translated: string
    adapted: string
  }
  status: string
  voiceOverUrl?: string
  voiceOverNotes?: string
  directorNotes?: string
}
```

#### Project Interface
```typescript
interface Project {
  _id: string
  name: string
  description: string
  status: string
  createdAt: Date
  updatedAt: Date
  dialogues: Dialogue[]
  assignedUsers: {
    transcriber?: string
    translator?: string
    voiceOver?: string
    director?: string
  }
}
```

## API Endpoints Documentation

### Authentication Endpoints

#### `POST /api/auth/login`
Authenticates a user and creates a session.
- **Request Body**:
  ```typescript
  {
    email: string     // User's email address
    password: string  // User's password
  }
  ```
- **Response**:
  ```typescript
  {
    token: string     // JWT authentication token
    user: {
      id: string
      email: string
      role: string
      name: string
    }
  }
  ```
- **Status Codes**:
  - `200`: Success
  - `401`: Invalid credentials
  - `400`: Missing required fields
  - `500`: Server error

#### `POST /api/auth/logout`
Ends the current user session.
- **Response**: `200` on success
- **Headers Required**: `Authorization: Bearer <token>`

### User Management Endpoints

#### `GET /api/users/me`
Retrieves the current user's profile.
- **Headers Required**: `Authorization: Bearer <token>`
- **Response**:
  ```typescript
  {
    id: string
    email: string
    name: string
    role: string
    createdAt: string
    updatedAt: string
    projects: string[]  // Array of project IDs
  }
  ```
- **Status Codes**:
  - `200`: Success
  - `401`: Unauthorized
  - `404`: User not found

#### `PATCH /api/users/:id`
Updates a user's information.
- **Headers Required**: `Authorization: Bearer <token>`
- **URL Parameters**: `id` - User ID
- **Request Body**:
  ```typescript
  {
    name?: string
    role?: string
    status?: string
    email?: string
  }
  ```
- **Response**: Updated user object
- **Status Codes**:
  - `200`: Success
  - `401`: Unauthorized
  - `403`: Forbidden (insufficient permissions)
  - `404`: User not found

### Project Management Endpoints

#### `GET /api/projects`
Retrieves all projects accessible to the current user.
- **Headers Required**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `status?: string` - Filter by project status
  - `role?: string` - Filter by user role
  - `page?: number` - Page number for pagination
  - `limit?: number` - Items per page
- **Response**:
  ```typescript
  {
    data: Project[]
    total: number
    page: number
    limit: number
  }
  ```

#### `POST /api/projects`
Creates a new project.
- **Headers Required**: `Authorization: Bearer <token>`
- **Request Body**:
  ```typescript
  {
    name: string
    description: string
    assignedUsers?: {
      transcriber?: string
      translator?: string
      voiceOver?: string
      director?: string
    }
  }
  ```
- **Response**: Created project object
- **Status Codes**:
  - `201`: Created
  - `400`: Invalid request body
  - `401`: Unauthorized
  - `403`: Forbidden

### Dialogue Management Endpoints

#### `GET /api/dialogues`
Retrieves dialogues for a project.
- **Headers Required**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `projectId: string` (required)
  - `status?: string`
  - `page?: number`
  - `limit?: number`
- **Response**:
  ```typescript
  {
    data: Dialogue[]
    total: number
    page: number
    limit: number
  }
  ```

#### `POST /api/dialogues`
Creates a new dialogue entry.
- **Headers Required**: 
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- **Request Body**:
  ```typescript
  {
    projectId: string
    index: number
    timeStart: string
    timeEnd: string
    character: string
    dialogue: {
      original: string
      translated?: string
      adapted?: string
    }
  }
  ```
- **Response**: Created dialogue object
- **Status Codes**:
  - `201`: Created
  - `400`: Invalid request body
  - `401`: Unauthorized
  - `403`: Forbidden

#### `PATCH /api/dialogues/:id`
Updates a dialogue entry.
- **Headers Required**: `Authorization: Bearer <token>`
- **URL Parameters**: `id` - Dialogue ID
- **Request Body**:
  ```typescript
  {
    status?: string
    dialogue?: {
      original?: string
      translated?: string
      adapted?: string
    }
    character?: string
    timeStart?: string
    timeEnd?: string
    voiceOverUrl?: string
    voiceOverNotes?: string
    directorNotes?: string
  }
  ```
- **Response**: Updated dialogue object
- **Status Codes**:
  - `200`: Success
  - `400`: Invalid request body
  - `401`: Unauthorized
  - `403`: Forbidden
  - `404`: Dialogue not found

### Media Handling Endpoints

#### `POST /api/upload-voice-over`
Uploads a voice-over recording.
- **Headers Required**: 
  - `Authorization: Bearer <token>`
  - `Content-Type: multipart/form-data`
- **Request Body**:
  ```typescript
  FormData:
    - audio: Blob       // Audio file
    - dialogueId: string
    - dialogueIndex: string
    - projectId: string
  ```
- **Response**:
  ```typescript
  {
    url: string        // URL of uploaded audio
    duration: number   // Duration in seconds
  }
  ```
- **Status Codes**:
  - `201`: Created
  - `400`: Invalid file or missing fields
  - `401`: Unauthorized
  - `413`: File too large
  - `415`: Unsupported file type

#### `GET /api/media/:projectId/:filename`
Retrieves a media file.
- **Headers Required**: `Authorization: Bearer <token>`
- **URL Parameters**:
  - `projectId`: Project ID
  - `filename`: File name
- **Response**: Media file stream
- **Status Codes**:
  - `200`: Success
  - `401`: Unauthorized
  - `403`: Forbidden
  - `404`: File not found

### Progress Tracking Endpoints

#### `GET /api/projects/:id/progress`
Retrieves project progress statistics.
- **Headers Required**: `Authorization: Bearer <token>`
- **URL Parameters**: `id` - Project ID
- **Response**:
  ```typescript
  {
    transcribed: number    // Percentage complete
    translated: number
    voiceOver: number
    approved: number
    total: number         // Total dialogues
    lastUpdated: string   // ISO date string
  }
  ```
- **Status Codes**:
  - `200`: Success
  - `401`: Unauthorized
  - `404`: Project not found



## Points to be need attention

### Common UI Requirements
- Implementation of consistent UI design patterns across the application
- Unified dashboard interface for QA application
- Common components library development

### Media Features
- Voice-over recording functionality
- Video playback implementation
- Admin video upload capabilities
- Python-based video processing:
  - Video trimming functionality
  - Video cropping tools
  - Video merging capabilities
- Voice-over timing interface
- Waveform visualization for audio

### Role-Specific UI Requirements
- Transcriber Interface:
  - Transcription workspace
  - Progress tracking
  - Quality metrics

- Translator Interface:
  - Translation workspace
  - Reference materials
  - Version control

- Director Interface:
  - Review dashboard
  - Approval workflow
  - Feedback system

- Admin Interface:
  - User management
  - Project oversight
  - System configuration

- QA Interface:
  - Quality check tools
  - Issue tracking
  - Performance metrics

- Voice-over Artist Interface:
  - Recording studio
  - Take management
  - Audio preview

### Questions to Address
- Evaluation of unified UI architecture approach
- Implementation of artist registration system for admin

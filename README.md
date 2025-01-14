Below is a deep and detailed architecture-level flow and data flow explanation of the QA App, based on the repository's folder structure and file contents. This walkthrough will give you a comprehensive understanding of:

How the project is organized
Where each type of data is handled
How the server-side (API) and client-side (React) pieces communicate
How user roles (RBAC) flow through the application
The lifecycle of data from database to UI
1. High-Level Overview
This application is built with Next.js (14+) as its core framework. It uses:

App Router structure (in /app directory) for server components, client components, and API routes.
API Endpoints for server-side logic and data fetching (mostly in /app/api/*).
MongoDB (via mongoose/native Mongo driver usage in lib/mongodb.ts) as the primary database.
Prisma for some parts (like /app/api/episodes) referencing a prisma client (possibly for more advanced querying or optional usage).
NextAuth for authentication (/app/api/auth/[...nextauth] + auth.config.ts).
Role-Based Access Control (RBAC) enforced in middleware.ts and in the server routes themselves.
React Query (@tanstack/react-query) on the client side for data fetching and caching.
At a high-level, the user flow is:

User logs in

NextAuth checks credentials.
User's session is created with a role (admin, director, transcriber, translator, voiceOver).
Middleware verifies the session / user role**

If not authenticated, it redirects to /login.
If user is authenticated, it checks if the requested route is allowed by the user’s role.
Otherwise, it redirects to the correct dashboard or denies access.
User lands on their dashboard (e.g., /allDashboards/admin or /allDashboards/director, etc.).

The relevant data (projects, dialogues, users, etc.) is fetched from the server via React Query + the Next.js API routes.
User performs actions (CRUD operations on projects, dialogues, uploading voice-over audio, etc.).

These are handled by the various /api/* endpoints.
The server updates the database and returns updated data.
The React Query cache is invalidated or updated to keep the UI in sync.
Data is stored in MongoDB. Some calls (like /app/api/episodes) use Prisma with the same Mongo DB, presumably for more complex or schema-driven operations.

Below is a more granular breakdown of the core flow and architecture.

2. Directory/Module-by-Module Explanation
2.1. /app/ (Next.js App Router)
2.1.1. Route Groupings
/app/allDashboards/:

Houses dashboards for each role:
admin/
director/
transcriber/
translator/
voice-over/
These pages fetch data relevant to each role’s tasks (like listing projects assigned to them).
Data Flow:
A user visits allDashboards/[role].
The page checks session (via next-auth/react hooks).
The page uses React Query hooks (useProjects, etc.) to fetch data from /api/projects, /api/dialogues, etc.
/app/admin/project/[projectId]

Sub-routes for specialized Admin views (e.g. progress).
Data Flow:
Admin user visits /admin/project/[projectId]/progress.
Frontend calls /api/admin/projects/[projectId]/progress to get the project’s progress stats (transcribed, translated, voice-over, etc.).
The server queries MongoDB to aggregate dialogue statuses and returns a JSON response.
/app/api/:

Where all Next.js API routes live in the new App Router paradigm.
Subfolders:
admin/ – Admin-only endpoints for managing projects and users.
auth/ – NextAuth config and endpoints.
dialogues/ – CRUD endpoints for dialogues.
projects/ – Non-admin project endpoints.
upload-* – Endpoints for uploading audio files to S3-compatible storage.
users/ – Endpoints for user data (e.g., me route).
voice-over/upload – Another audio upload endpoint specialized for voice-over usage.
2.1.2. API Calls and Their Flows
Below are the key subfolders in /app/api/ and their roles:

/app/api/admin/projects

route.ts:
Handles GET (list all projects), POST (create a new project & handle video file uploads), DELETE (delete entire project, drop DB, remove from S3).
This is for admin usage only.
[projectId]/assign/route.ts:
Assign or remove users from a project.
[projectId]/progress/route.ts:
Returns the % of dialogues transcribed, translated, etc.
[projectId]/route.ts:
Get single project, update project, or delete.
/app/api/admin/users

Manage user creation, listing, or single user GET/PATCH/DELETE.
Admin-only usage.
/app/api/auth

[...nextauth] + auth.config.ts – NextAuth configuration.
login/route.ts – A simpler login endpoint returning a JWT token if needed.
/app/api/dialogues

route.ts: GET all dialogues for a project (and optionally filter by collection or episodeId).
[id]/route.ts: GET, PUT, PATCH, DELETE single dialogue.
/app/api/projects

GET all projects, or POST create.
Another route for assign/route.ts.
/app/api/episodes/route.ts

Uses prisma to get episodes for a project.
Possibly is bridging from a historical approach or for advanced queries.
/app/api/upload-audio/ and /app/api/upload-voice-over/

Handle uploading audio to R2/S3, then update dialogues in the DB with the resulting audio URLs.
2.1.3. Front-End Pages Within /app/
page.tsx (root): redirects to /allDashboards.

login/page.tsx:

The login screen.
Uses signIn('credentials', ...).
On success, user is redirected to their appropriate dashboard.
layout.tsx: The root layout that sets up HTML skeleton, global <Providers>, etc.

globals.css + Tailwind config: Project-wide styles.

2.2. /components/
2.2.1. Shared UI Components
Button.tsx / Card.tsx / ThemeToggle.tsx:
Basic, reusable UI elements or “atoms.”
Also exist in the /app/components/ path (some duplication or transitional refactor is visible in the repo).
2.2.2. Role-Specific Views
These are the more complex screens or “feature components,” each tailored to a user role or workflow:

AdminView.tsx:

A React component that lists projects, handles creating new projects, editing, assigning users, etc.
Data fetched with React Query from /api/admin/* routes.
The UI manipulates the DB by calling admin endpoints.
TranscriberView.tsx, TranslatorView.tsx, DirectorView.tsx, VoiceOverView.tsx

Each shows a list of “assigned” projects for that role.
Clicking a project navigates to [projectId]/page.tsx with a specialized dialogue interface (e.g., for transcription or translation).
TranscriberDialogueView.tsx, TranslatorDialogueView.tsx, DirectorDialogueView.tsx, VoiceOverDialogueView.tsx

Each is a more specialized UI for handling dialogues: transcribing text, adding translations, listening to the video, uploading or recording audio, etc.
They rely heavily on React Query + custom hooks (useDialogues, useEpisodes, useAudioRecording) to manage the data + interactions with /api/dialogues routes.
2.2.3. Other Utility Components
DashboardLayout.tsx: A layout with a top nav bar, signOut button, etc., specifically used in some older approach (possibly replaced by Next.js layout?).
AudioVisualizer.tsx: Visualizes real-time audio waveforms from a MediaStream.
RecordingTimer.tsx: A small bar + time tracker that shows how long you’ve been recording audio.
2.3. /hooks/
useAudioRecording.ts:

A custom React hook that handles the complexities of accessing the user’s microphone, streaming audio, storing it into a Blob, stopping/starting recording, and giving you a final audio file.
This hook is used in the VoiceOverDialogueView.tsx and other places that let you record audio.
useDialogues.ts, useEpisodes.ts, useProject.ts, useProjects.ts:

A set of “React Query hooks” that fetch data from the relevant endpoints.
For instance, useProjects calls /api/projects and caches them. useDialogues calls /api/dialogues?projectId=....
2.4. /lib/
mongodb.ts:

Sets up a MongoClient with a global promise in dev mode to avoid re-initializing the client on every call.
This is used by server (API) code for direct queries via client.db().
auth.ts and auth.config.ts:

NextAuth options or credentials-based approach.
e.g., hashing passwords with bcrypt and verifying them in the DB.
prisma.ts:

Instantiates a Prisma client for the same DB.
Some code in /app/api/episodes/route.ts uses this.
seed.ts: Basic seeds for local dev or test.

2.5. /types/
dialogue.ts, project.ts, user.ts:

TypeScript type definitions for dialogues, projects, and users.
Typically used on both the server side (for typed DB results) and on the client side (for typed React props and state).
next-auth.d.ts:

Extended type definitions for NextAuth to include role, username, etc. in the session and JWT.
2.6. /utils/
audio.ts: Contains code that creates a WAV blob from raw Float32 PCM data, plus a custom Worklet for capturing audio chunks.
formatters.ts: Parsing times (like 00:01:31:480) into numeric seconds, etc.
cn.ts: Merges Tailwind classes with clsx + tailwind-merge.
2.7. middleware.ts (RBAC & Auth Enforcement)
This file is crucial in Next.js 13+ for server-side path protection:

Checks if user is authenticated (inspects JWT from NextAuth).
Enforces route restrictions based on the user’s role:
E.g., if a user with role “transcriber” tries to access /allDashboards/director/..., it redirects them to /allDashboards/transcriber.
Redirects to /login if no token (unauthenticated).
The role -> path relationships are defined in ROLE_ROUTES.
Effectively, the “front door” to all pages like /allDashboards/director/ is locked if your token role doesn’t match.

3. Detailed Data Flow
Here’s an example end-to-end flow for an Admin user:

Login:

Admin visits /login, enters username, password.
NextAuth calls the credentials authorize function (lib/auth.ts or auth.config.ts).
If correct, NextAuth sets a JWT in cookies and re-directs to allDashboards/admin.
Middleware (middleware.ts) checks:

It sees the token, sees role=admin, and allows /allDashboards/admin route.
Admin Dashboard (/app/allDashboards/admin/page.tsx):

The React component uses React Query’s useProjects() -> calls /api/projects -> GET returns all projects from db.collection('projects').
The Admin sees the list of projects, can click on one, or can create a new project.
Creating a Project:

AdminView has a form, user selects some video files, etc.
This calls /api/admin/projects via POST with a FormData that includes the video file.
The route:
Checks if user is admin.
Creates DB records in projects collection.
Uploads the file to R2 / S3.
Returns success JSON.
Admin can Assign a User to a Project:

Calls /api/admin/projects/[projectId]/assign via POST with { usernames: ["transcriber1"] }.
The server finds the user doc in users collection, updates projects collection’s assignedTo array with their role.
The assigned user now sees that project in their dashboard because the front-end filters for “my assigned projects.”

4. Role-Specific Use Cases
Transcriber logs in, sees only projects assigned to them with role=transcriber.

They open a project’s dialogues screen (/allDashboards/transcriber/[projectId]).
That calls useDialogues(projectId) -> /api/dialogues?projectId=xyz.
They transcribe text, and upon saving, the front-end calls PATCH /api/dialogues/[dialogueId] with { status: 'transcribed', dialogue: {...} }.
Translator does a similar flow but updates status to translated and sets dialogue.translated field.

Director can approve or request revision on the dialogue. Also can leave directorNotes.

VoiceOver user can record audio via useAudioRecording, then calls /api/upload-voice-over to store the WAV file. Finally sets the dialogue.voiceOverUrl in the DB.

Admin is basically “God mode”—manages all data, including user creation, project creation, assignment, deletion.

5. Conclusion
Overall, the QA App:

Uses Next.js as a unified environment for both frontend and backend (API routes).
MongoDB as the main data store, with partial usage of Prisma in certain endpoints.
NextAuth for authentication, with role-based checks stored in the JWT.
Middleware for role-based route protection.
React Query on the client side for data fetching and caching, hooking into the /app/api/* routes.
Audio workflows (for transcription, translation, voice-over) revolve around the dialogues collection—each dialogue row has fields for “transcribed text,” “translated text,” “voiceOverUrl,” “directorNotes,” etc.
Multiple specialized UI components in the components/ folder handle each role’s tasks in a step-by-step workflow.
This architecture cleanly separates roles, data (projects, dialogues, etc.), and functionality (API routes for each operation), providing a robust structure for multi-step media workflows.



















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

### Database configuration
- How to configure the database for the project releated to dialogues as per the series and episodes?
- I HAVE SUGGESTION WE CAN USE 2 DATABASE ONE FOR COMMON USE (PROJECT AND USERS) AND OTHER ONE FOR DIALOGUES AND MEDIA(WITH COLLECTION NAME AS PER SERIES AND EPISODES).

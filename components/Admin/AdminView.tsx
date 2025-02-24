/**
 * AdminView Component
 * 
 * A comprehensive admin dashboard for managing projects and users.
 * Features include:
 * - Project management (CRUD operations)
 * - User management
 * - Episode tracking
 * - Team assignment
 * - Status management
 */

'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Project, ProjectStatus, Episode, AssignedUser } from '@/types/project';
import { UserRole, User } from '@/types/user';
import { useRouter } from 'next/navigation';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import {
  Search,
  Plus,
  MoreVertical,
  Users,
  Settings,
  ChartBar,
  Trash2,
  Edit3,
  UserPlus,
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { io } from 'socket.io-client';
import { ObjectId } from 'mongodb';

// Add socket imports
import { getSocketClient, authenticateSocket, joinProjectRoom, leaveProjectRoom } from '@/lib/socket';

// ===============================
// Type Definitions
// ===============================

interface AdminViewProps {
  projects: Project[];
  refetchProjects: () => Promise<void>;
}

interface UploadProgressData {
  loaded: number;
  total: number;
  phase: 'pending' | 'uploading' | 'creating-collection' | 'processing' | 'success' | 'error';
  message?: string;
}

type Tab = 'projects' | 'users';

// Add type declarations at the top of the file
interface FilteredProject {
  _id: string;
  title: string;
  status: ProjectStatus;
  assignedTo: AssignedUser[];
  createdAt: string;
  updatedAt: string;
}

// Add this interface for the filtered users logging
interface FilteredUsersLog {
  total: number;
  filtered: number;
  searchTerm: string;
  selectedCount: number;
}

// Add these type declarations at the top of the file
interface ProjectHandlers {
  handleCreateProject: () => Promise<void>;
  handleUpdateProject: (projectId: string) => Promise<void>;
  handleDeleteProject: (projectId: string) => Promise<void>;
  handleAssignUsers: () => Promise<void>;
}

interface UserHandlers {
  handleCreateUser: () => Promise<void>;
  handleUpdateUser: (userId: string) => Promise<void>;
  handleDeleteUser: (userId: string) => Promise<void>;
}

// Add these type declarations at the top of the file
interface UserSelectionHandlers {
  handleUserSelection: (username: string) => void;
  handleRemoveUser: (projectId: string, username: string) => Promise<void>;
}

// Add these type declarations at the top of the file
interface ProjectState {
  title: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: ProjectStatus;
  videoFiles: File[];
}

interface UserState {
  username: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}

interface AdminViewState {
  isProjectsLoading: boolean;
  loadError: string | null;
  selectedProject: Project | null;
  selectedUser: User | null;
  searchTerm: string;
  activeTab: 'projects' | 'users';
  viewMode: 'grid' | 'list';
  sortBy: 'title' | 'date' | 'status';
  filterStatus: ProjectStatus | 'all';
  selectedProjectForTeam: Project | null;
  selectedProjectForEpisodes: Project | null;
  selectedEpisode: Episode | null;
  selectedUsernames: string[];
  isCreating: boolean;
  isCreatingUser: boolean;
  isEditing: boolean;
  isAssigning: boolean;
  isEpisodesModalOpen: boolean;
  isEpisodeDetailsOpen: boolean;
  showDeleteConfirm: boolean;
  showUserDeleteConfirm: boolean;
  error: string;
  success: string;
  assignUserSearchTerm: string;
  filteredUsers: User[];
  modalFilteredUsers: User[];
}

interface UploadProgress {
  totalFiles: number;
  completedFiles: number;
  currentFile: number;
  percentage: number;
  [key: string]: number;
}

interface TimeoutRefs {
  search?: NodeJS.Timeout;
  filter?: NodeJS.Timeout;
  [key: string]: NodeJS.Timeout | undefined;
}

interface MemoizedData {
  filteredProjects: Project[];
  filteredUsers: User[];
  modalFilteredUsers: User[];
  projectHandlers: ProjectHandlers;
  userHandlers: UserHandlers;
  userSelectionHandlers: UserSelectionHandlers;
}

// Upload progress type definitions
interface UploadProgressState {
  [key: string]: {
    phase: 'pending' | 'uploading' | 'creating-collection' | 'processing' | 'success' | 'error';
    loaded: number;
    total: number;
    message?: string;
  };
}

// ===============================
// Constants
// ===============================

/**
 * Color mappings for different project statuses
 * Used for visual distinction in the UI
 */
const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  'in-progress': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  'on-hold': 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
} as const;

// ===============================
// Utility Functions
// ===============================

/**
 * Formats bytes into human-readable sizes
 */
const formatBytes = (bytes: number, decimals: number = 2) => {
  if (bytes === 0) return '0 MB';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Gets current timestamp in ISO format
 */
const getTimeStamp = () => {
  return new Date().toISOString();
};



/**
 * Custom hook for handling admin notifications
 */
function useNotifyAdmin() {
  return useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') {
      toast.error(message);
    } else {
      toast.success(message);
    }
  }, []);
}

/**
 * Generic error handler
 */
const handleError = (error: Error): void => {
  console.error('Error:', error);
  toast.error('An error occurred. Please try again.');
};

// ===============================
// Main Component
// ===============================

export default function AdminView({ projects, refetchProjects }: AdminViewProps) {
  const session = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const notify = useNotifyAdmin();
  const socketRef = useRef<ReturnType<typeof getSocketClient> | null>(null);
  const projectsRef = useRef<Project[]>(projects);
  const hasInitializedRef = useRef<boolean>(false);
  
  // Refs for debouncing and API calls
  const timeoutRefs = useRef<TimeoutRefs>({});

  // Initial state with proper typing
  const initialState: AdminViewState = {
    isProjectsLoading: false,
    loadError: null,
    selectedProject: null,
    selectedUser: null,
    searchTerm: '',
    activeTab: 'projects',
    viewMode: 'grid',
    sortBy: 'date',
    filterStatus: 'all',
    selectedProjectForTeam: null,
    selectedProjectForEpisodes: null,
    selectedEpisode: null,
    selectedUsernames: [],
    isCreating: false,
    isCreatingUser: false,
    isEditing: false,
    isAssigning: false,
    isEpisodesModalOpen: false,
    isEpisodeDetailsOpen: false,
    showDeleteConfirm: false,
    showUserDeleteConfirm: false,
    error: '',
    success: '',
    assignUserSearchTerm: '',
    filteredUsers: [],
    modalFilteredUsers: []
  };

  const [state, setState] = useState<AdminViewState>(initialState);

  const [newProject, setNewProject] = useState<ProjectState>({
    title: '',
    description: '',
    sourceLanguage: '',
    targetLanguage: '',
    status: 'pending',
    videoFiles: []
  });

  const [newUser, setNewUser] = useState<UserState>({
    username: '',
    email: '',
    password: '',
    role: 'transcriber',
    isActive: true,
  });

  // Upload progress state with proper typing
  const [uploadStatus, setUploadStatus] = useState<UploadProgressState[string]['phase']>('pending');

  // Upload progress update helper
  const updateUploadProgress = useCallback((fileId: string, progress: Partial<UploadProgressState[string]>) => {
    setUploadProgress(prev => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        ...progress
      }
    }));
  }, []);

  // // Fix fetchProjectsWithLoading declaration
  // const fetchProjectsWithLoading = useCallback(async () => {
  //   setState(prev => ({ ...prev, isProjectsLoading: true }));
  //   try {
  //     await refetchProjects();
  //   } catch (error) {
  //     console.error('Error fetching projects:', error);
  //     toast.error('Failed to fetch projects');
  //   } finally {
  //     setState(prev => ({ ...prev, isProjectsLoading: false }));
  //   }
  // }, [refetchProjects]);

  // State update helper with proper typing
  const updateState = useCallback((updates: Partial<AdminViewState> | ((prev: AdminViewState) => Partial<AdminViewState>)) => {
    setState(prev => ({
      ...prev,
      ...(typeof updates === 'function' ? updates(prev) : updates)
    }));
  }, []);

  // UI event handlers
  const handleTabChange = useCallback((tab: Tab) => {
    updateState({ activeTab: tab });
  }, [updateState]);

  const handleViewModeChange = useCallback((mode: 'grid' | 'list') => {
    updateState({ viewMode: mode });
  }, [updateState]);

  const handleSortChange = useCallback((sort: 'title' | 'date' | 'status') => {
    updateState({ sortBy: sort });
  }, [updateState]);

  // Project selection handlers
  const handleProjectSelect = useCallback((project: Project | null) => {
    updateState({
      selectedProject: project,
      selectedProjectForTeam: project,
      isEditing: false,
      isAssigning: false,
      showDeleteConfirm: false
    });
  }, [updateState]);

  // User selection handlers
  const handleUserSelect = useCallback((user: User | null) => {
    updateState({ 
      selectedUser: user,
      isCreatingUser: false,
      showUserDeleteConfirm: false
    });
  }, [updateState]);

  // Modal handlers
  const handleModalClose = useCallback(() => {
    updateState({
      isEpisodesModalOpen: false,
      selectedEpisode: null,
      isEpisodeDetailsOpen: false
    });
  }, [updateState]);

  // Search and filter handlers with proper typing
  const handleSearch = useCallback((term: string) => {
    if (timeoutRefs.current.search) {
      clearTimeout(timeoutRefs.current.search);
    }
    timeoutRefs.current.search = setTimeout(() => {
      updateState({ searchTerm: term });
    }, 300);
  }, [updateState]);

  const handleFilter = useCallback((status: ProjectStatus | 'all') => {
    if (timeoutRefs.current.filter) {
      clearTimeout(timeoutRefs.current.filter);
    }
    timeoutRefs.current.filter = setTimeout(() => {
      updateState({ filterStatus: status });
    }, 300);
  }, [updateState]);

  // Move all hooks to the top level
  const memoizedData = useMemo<MemoizedData>(() => {
    const filtered = projects.filter(project => {
      if (state.filterStatus !== 'all' && project.status !== state.filterStatus) return false;
      if (state.searchTerm && !project.title.toLowerCase().includes(state.searchTerm.toLowerCase())) return false;
      return true;
    });
    return {
      filteredProjects: filtered,
      filteredUsers: [],
      modalFilteredUsers: [],
      projectHandlers: {
        handleCreateProject: async () => {},
        handleUpdateProject: async (projectId: string) => {},
        handleDeleteProject: async (projectId: string) => {},
        handleAssignUsers: async () => {},
      },
      userHandlers: {
        handleCreateUser: async () => {},
        handleUpdateUser: async (userId: string) => {},
        handleDeleteUser: async (userId: string) => {},
      },
      userSelectionHandlers: {
        handleUserSelection: (username: string) => {},
        handleRemoveUser: async (projectId: string, username: string) => {},
      },
    };
  }, [projects, state.filterStatus, state.searchTerm]);

  const memoizedProjects = useMemo(() => {
    return projects?.map((project: Project) => ({
      ...project,
      // Add any transformations needed
    })) || [];
  }, [projects]);

  const memoizedUsers = useMemo<User[]>(() => {
    if (!state.modalFilteredUsers) return [];
    return state.modalFilteredUsers.filter(user => 
      user.username.toLowerCase().includes(state.assignUserSearchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(state.assignUserSearchTerm.toLowerCase())
    );
  }, [state.modalFilteredUsers, state.assignUserSearchTerm]);

  // Move useQuery outside conditionals
  const { data: queryData, isLoading, error: queryError } = useQuery({
    queryKey: ['adminData'],
    queryFn: async () => {
      const response = await axios.get('/api/admin/data');
      return response.data;
    }
  });

  // Move useCallback outside conditionals
  const handleCallback = useCallback((projectId: string, action: 'edit' | 'delete' | 'assign'): void => {
    switch (action) {
      case 'edit':
        updateState({ isEditing: true });
        handleProjectSelect(projects.find(p => p._id === projectId) || null);
        break;
      case 'delete':
        updateState({ showDeleteConfirm: true });
        handleProjectSelect(projects.find(p => p._id === projectId) || null);
        break;
      case 'assign':
        updateState({ isAssigning: true });
        handleProjectSelect(projects.find(p => p._id === projectId) || null);
        break;
    }
  }, [projects, updateState, handleProjectSelect]);

  // Socket connection effect with proper typing
  useEffect(() => {
    if (!session?.data?.user) return;

    const initializeSocket = async () => {
      try {
        const socket = await getSocketClient();
        if (!socket) throw new Error('Failed to initialize socket');
        
        socketRef.current = socket;
        await authenticateSocket(socket, session.data.user as { id: string, email: string });
        
        // Join rooms for all projects
        projects.forEach((project: Project) => {
          joinProjectRoom(project._id.toString());
        });

        hasInitializedRef.current = true;
      } catch (error) {
        console.error('Socket initialization error:', error);
        notify('Failed to establish real-time connection', 'error');
      }
    };

    void initializeSocket();

    return () => {
      if (socketRef.current) {
        projects.forEach((project: Project) => {
          leaveProjectRoom(project._id.toString());
        });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [session?.data?.user, projects, notify]);

  // Fix fetchProjectsWithLoading declaration
  const fetchProjectsWithLoading = useCallback(async () => {
    setState(prev => ({ ...prev, isProjectsLoading: true }));
    try {
      await refetchProjects();
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast.error('Failed to fetch projects');
    } finally {
      setState(prev => ({ ...prev, isProjectsLoading: false }));
    }
  }, [refetchProjects]);

  // Project fetching effect - Only fetch if no projects and not already fetching
  useEffect(() => {
    const shouldFetchProjects = !projectsRef.current?.length && !hasInitializedRef.current;
    
    if (shouldFetchProjects) {
      console.log('AdminView - No projects found, fetching...');
      void fetchProjectsWithLoading();
    } else {
      console.log('AdminView - Projects already loaded:', {
        count: projectsRef.current?.length,
        titles: projectsRef.current?.map((p: Project) => p.title)
      });
    }

    projectsRef.current = memoizedProjects;
  }, [memoizedProjects, refetchProjects, fetchProjectsWithLoading]);

  // Upload progress type definitions at the top with other interfaces
  interface UploadProgressState {
    [key: string]: {
      phase: 'pending' | 'uploading' | 'creating-collection' | 'processing' | 'success' | 'error';
      loaded: number;
      total: number;
      message?: string;
    };
  }


  // Handler functions
  const handleProjectAction = useCallback(async (action: 'create' | 'update' | 'delete', projectId?: string) => {
    try {
      if (action !== 'create' && !projectId) return;
      if (action === 'update' && !state.selectedProject) return;
      
      switch (action) {
        case 'create':
          await handleCreateProject();
          break;
        case 'update':
          if (!state.selectedProject) return;
          // Implementation
          break;
        case 'delete':
          if (!state.selectedProject) return;
          await handleDeleteProject(projectId);
          break;
      }
    } catch (error) {
      console.error(`Error ${action}ing project:`, error);
      toast.error(`Failed to ${action} project`);
    }
  }, [state.selectedProject]);

  const handleEpisodeAction = useCallback(async (action: 'view' | 'edit' | 'delete', episodeId?: string) => {
    if (!state.selectedProjectForEpisodes || !state.selectedEpisode) return;
    
    try {
      switch (action) {
        case 'view':
          // Implementation
          break;
        case 'edit':
          // Implementation
          break;
        case 'delete':
          // Implementation
          break;
      }
    } catch (error) {
      console.error(`Error ${action}ing episode:`, error);
      toast.error(`Failed to ${action} episode`);
    }
  }, [state.selectedProjectForEpisodes, state.selectedEpisode]);

  

  // Add missing handler functions
  const handleUpdateStatus = useCallback(async (projectId: string, newStatus: ProjectStatus) => {
    try {
      await axios.patch(`/api/admin/projects/${projectId}`, { status: newStatus });
      await refetchProjects();
      notify('Status updated successfully');
    } catch (err) {
      notify('Failed to update project status', 'error');
    }
  }, [refetchProjects, notify]);

  const handleRemoveUser = useCallback(async (projectId: string, username: string) => {
    try {
      await axios.post(`/api/admin/projects/${projectId}/remove-user`, { username });
      await refetchProjects();
      notify('User removed successfully', 'success');
    } catch (error) {
      console.error('Error removing user:', error);
      notify('Failed to remove user', 'error');
    }
  }, [refetchProjects, notify]);

  const handleToggleUserActive = useCallback(async (userId: string, isActive: boolean) => {
    try {
      await axios.patch(`/api/admin/users/${userId}`, { isActive });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      notify(`User ${isActive ? 'activated' : 'deactivated'} successfully`);
    } catch (err) {
      notify(`Failed to ${isActive ? 'activate' : 'deactivate'} user`, 'error');
    }
  }, [queryClient, notify]);

  const handleUserSelection = useCallback((username: string) => {
    setState(prev => ({
      ...prev,
      selectedUsernames: prev.selectedUsernames.includes(username)
        ? prev.selectedUsernames.filter(u => u !== username)
        : [...prev.selectedUsernames, username]
    }));
  }, []);

  const setAssignUserSearchTerm = useCallback((term: string) => {
    setState(prev => ({ ...prev, assignUserSearchTerm: term }));
  }, []);

  // Fix state management issues
  const updateProjectState = (updates: Partial<Project>) => {
    if (!state.selectedProject?._id) return;

    setState(prev => ({
      ...prev,
      selectedProject: {
        ...prev.selectedProject!,
        ...updates,
        _id: prev.selectedProject!._id // Ensure _id is always present
      } as Project
    }));
  };

  const updateUserState = (updates: Partial<User>) => {
    if (!state.selectedUser?._id) return;

    setState(prev => ({
      ...prev,
      selectedUser: {
        ...prev.selectedUser!,
        ...updates,
        _id: prev.selectedUser!._id
      } as User
    }));
  };

  const updateEpisodeState = (updates: Partial<Episode>) => {
    if (!state.selectedEpisode?._id || !state.selectedProjectForEpisodes?._id) return;

    setState(prev => ({
      ...prev,
      selectedEpisode: {
        ...prev.selectedEpisode!,
        ...updates,
        _id: prev.selectedEpisode!._id
      } as Episode
    }));
  };

  const setIsCreating = (value: boolean) => setState(prev => ({ ...prev, isCreating: value }));
  const setIsCreatingUser = (value: boolean) => setState(prev => ({ ...prev, isCreatingUser: value }));
  const setAssignUserSearchTerm = (term: string) => setState(prev => ({ ...prev, assignUserSearchTerm: term }));

  // Fix project update handlers with proper typing
  const handleProjectUpdate = (field: keyof Project, value: string) => {
    if (!state.selectedProject) return;
    
    setState(prev => ({
      ...prev,
      selectedProject: {
        ...prev.selectedProject!,
        [field]: value,
        _id: prev.selectedProject!._id // Ensure _id is preserved
      }
    }));
  };

  // Fix episode null checks
  const handleEpisodeSelection = (episode: Episode | null) => {
    if (!state.selectedProjectForEpisodes?.episodes) return;
    
    setState(prev => ({
      ...prev,
      selectedEpisode: episode
    }));
  };

  // Fix user action handlers with proper null checks
  const handleUserAction = (action: string) => {
    if (!state.selectedUser?._id) return;
    
    switch (action) {
      case 'delete':
        handleDeleteUser(state.selectedUser._id.toString());
        break;
      // Add other cases as needed
    }
  };

  // Fix upload progress state handling
  const updateUploadProgress = (progress: UploadProgress) => {
    setState(prev => ({
      ...prev,
      uploadProgress: {
        phase: progress.phase,
        loaded: progress.loaded,
        total: progress.total,
        message: progress.message
      }
    }));
  };

  // Fix project selection with proper type checking
  const handleProjectSelection = (project: Project) => {
    setState(prev => ({
      ...prev,
      selectedProject: {
        ...project,
        _id: project._id.toString() // Ensure _id is string
      } as Project
    }));
  };

  // Fix user selection with proper type checking
  const handleUserSelection = (user: User) => {
    setState(prev => ({
      ...prev,
      selectedUser: {
        ...user,
        _id: user._id.toString() // Ensure _id is string
      }
    }));
  };

  // Fix episode state updates
  const handleEpisodeUpdate = (episodeId: string, updates: Partial<Episode>) => {
    if (!state.selectedProjectForEpisodes?.episodes) return;

    setState(prev => ({
      ...prev,
      selectedProjectForEpisodes: {
        ...prev.selectedProjectForEpisodes!,
        episodes: prev.selectedProjectForEpisodes!.episodes!.map(ep =>
          ep._id === episodeId ? { ...ep, ...updates } : ep
        )
      } as Project
    }));
  };

  // Show loading state
  if (state.isProjectsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
          <p className="text-foreground">Loading projects...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (state.loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg max-w-lg">
          <p className="font-semibold mb-2">Error</p>
          <p>{state.loadError}</p>
          <button
            onClick={() => void fetchProjectsWithLoading()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Update project rooms when projects change
  useEffect(() => {
    if (socketRef.current && hasInitializedRef.current) {
      const oldProjects = projectsRef.current || [];
      const newProjects = memoizedProjects;

      // Leave rooms for removed projects
      oldProjects.forEach((oldProject: Project) => {
        if (!newProjects.find((p: Project) => p._id === oldProject._id)) {
          leaveProjectRoom(oldProject._id.toString());
        }
      });

      // Join rooms for new projects
      newProjects.forEach((newProject: Project) => {
        if (!oldProjects.find((p: Project) => p._id === newProject._id)) {
          joinProjectRoom(newProject._id.toString());
        }
      });

      projectsRef.current = newProjects;
    }
  }, [memoizedProjects]);

  // Project action handlers
  const handleProjectAction = useCallback(async (action: 'create' | 'update' | 'delete', projectId?: string) => {
    try {
      updateState({ isProjectsLoading: true, error: '' });
      
      switch (action) {
        case 'create':
          updateState({ isCreating: true });
          // Implementation for create
          break;
        case 'update':
          if (!projectId) throw new Error('Project ID is required for update');
          updateState({ isEditing: true });
          // Implementation for update
          break;
        case 'delete':
          if (!projectId) throw new Error('Project ID is required for delete');
          updateState({ showDeleteConfirm: true });
          // Implementation for delete
          break;
      }
      
      await refetchProjects();
      updateState({ success: `Project ${action}d successfully` });
    } catch (err) {
      updateState({ error: err instanceof Error ? err.message : 'An error occurred' });
    } finally {
      updateState({ 
        isProjectsLoading: false,
        isCreating: false,
        isEditing: false,
        showDeleteConfirm: false
      });
    }
  }, [refetchProjects, updateState]);

  // User action handlers
  const handleUserAction = useCallback(async (action: 'create' | 'update' | 'delete', userId?: string) => {
    try {
      updateState({ error: '' });
      
      switch (action) {
        case 'create':
          updateState({ isCreatingUser: true });
          // Implementation for create
          break;
        case 'update':
          if (!userId) throw new Error('User ID is required for update');
          // Implementation for update
          break;
        case 'delete':
          if (!userId) throw new Error('User ID is required for delete');
          updateState({ showUserDeleteConfirm: true });
          // Implementation for delete
          break;
      }
      
      updateState({ success: `User ${action}d successfully` });
    } catch (err) {
      updateState({ error: err instanceof Error ? err.message : 'An error occurred' });
    } finally {
      updateState({ 
        isCreatingUser: false,
        showUserDeleteConfirm: false
      });
    }
  }, [updateState]);

  // Team assignment handlers
  const handleTeamAssignment = useCallback(async (projectId: string, usernames: string[]) => {
    try {
      updateState({ isAssigning: true, error: '' });
      
      // Implementation for team assignment
      
      updateState({ success: 'Team assigned successfully' });
    } catch (err) {
      updateState({ error: err instanceof Error ? err.message : 'An error occurred' });
    } finally {
      updateState({ 
        isAssigning: false,
        selectedUsernames: []
      });
    }
  }, [updateState]);

  // Episode handlers
  const handleEpisodeAction = useCallback(async (action: 'add' | 'update' | 'delete', episodeData?: Partial<Episode>) => {
    try {
      if (!state.selectedProjectForEpisodes?._id) {
        throw new Error('No project selected');
      }

      updateState({ isProjectsLoading: true, error: '' });
      
      switch (action) {
        case 'add':
          if (!episodeData) throw new Error('Episode data is required for add');
          // Implementation for add
          break;
        case 'update':
          if (!episodeData?._id) throw new Error('Episode ID is required for update');
          // Implementation for update
          break;
        case 'delete':
          if (!episodeData?._id) throw new Error('Episode ID is required for delete');
          // Implementation for delete
          break;
      }

      await refetchProjects();
      updateState({ success: `Episode ${action}d successfully` });
    } catch (err) {
      updateState({ error: err instanceof Error ? err.message : 'An error occurred' });
    } finally {
      updateState({ isProjectsLoading: false });
    }
  }, [state.selectedProjectForEpisodes, refetchProjects, updateState]);

  // Upload handlers
  const handleUpload = useCallback(async (files: File[]) => {
    try {
      setUploadProgress({
        totalFiles: files.length,
        completedFiles: 0,
        currentFile: 0,
        percentage: 0
      });
      setUploadStatus('uploading');

      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        
        await axios.post('/api/upload', formData, {
          onUploadProgress: (progressEvent) => {
            const percentage = progressEvent.total
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
              : 0;
            
            updateUploadProgress(files[i].name, {
              loaded: progressEvent.loaded,
              total: progressEvent.total,
              phase: 'uploading',
              message: `Uploading ${files[i].name} (${formatBytes(progressEvent.loaded)} / ${formatBytes(progressEvent.total)})`
            });
          }
        });

        updateUploadProgress(files[i].name, {
          phase: 'creating-collection',
          message: `Creating collection for ${files[i].name}`
        });

        updateUploadProgress(files[i].name, {
          phase: 'processing',
          message: `Processing ${files[i].name}`
        });

        updateUploadProgress(files[i].name, {
          phase: 'success',
          message: `Successfully uploaded ${files[i].name}`
        });
      }

      setUploadStatus('success');
    } catch (err) {
      setUploadStatus('error');
      updateState({ error: err instanceof Error ? err.message : 'Upload failed' });
    }
  }, [updateState]);

  // // Function to fetch projects with loading state
  // const fetchProjectsWithLoading = useCallback(async () => {
  //   try {
  //     updateState({ isProjectsLoading: true, loadError: null });
  //     await refetchProjects();
  //   } catch (err) {
  //     updateState({ 
  //       loadError: err instanceof Error ? err.message : 'An error occurred',
  //       isProjectsLoading: false 
  //     });
  //   } finally {
  //     updateState({ isProjectsLoading: false });
  //   }
  // }, [refetchProjects, updateState]);

  // Fix state update type issues for project updates
  const updateSelectedProject = (updates: Partial<Project>) => {
    if (!state.selectedProject?._id) return;

    setState(prev => ({
      ...prev,
      selectedProject: {
        ...prev.selectedProject!,
        ...updates,
        _id: prev.selectedProject!._id // Ensure _id is always present
      } as Project
    }));
  };

  // Fix upload progress state type
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>({});

  // Add type guard for null checks
  const isProjectSelected = (project: Project | null): project is Project => {
    return project !== null;
  };

  const isEpisodeSelected = (episode: Episode | null): episode is Episode => {
    return episode !== null;
  };

  // Fix project action handlers
  const handleProjectAction = useCallback(async (action: 'create' | 'update' | 'delete', projectId?: string) => {
    try {
      if (action !== 'create' && !projectId) return;
      if (action === 'update' && !isProjectSelected(state.selectedProject)) return;

      // Rest of the implementation
    } catch (error) {
      console.error(`Error ${action}ing project:`, error);
      toast.error(`Failed to ${action} project`);
    }
  }, [state.selectedProject]);

  // Fix episode handling
  const handleEpisodeAction = useCallback(async (action: 'view' | 'edit' | 'delete') => {
    if (!isProjectSelected(state.selectedProjectForEpisodes) || !isEpisodeSelected(state.selectedEpisode)) return;
  
    // Rest of the implementation
  }, [state.selectedProjectForEpisodes, state.selectedEpisode]);

  // Fix view mode toggle
  const toggleViewMode = useCallback(() => {
    setState(prev => ({
      ...prev,
      viewMode: prev.viewMode === 'grid' ? 'list' : 'grid'
    }));
  }, []);

  // Fix null checks for selected items
  const handleSelectedProject = useCallback(() => {
    if (!state.selectedProject) return null;
    return {
      ...state.selectedProject,
      _id: state.selectedProject._id || '',
      title: state.selectedProject.title || '',
      description: state.selectedProject.description || '',
      sourceLanguage: state.selectedProject.sourceLanguage || '',
      targetLanguage: state.selectedProject.targetLanguage || '',
      status: state.selectedProject.status || 'pending',
      dialogue_collection: state.selectedProject.dialogue_collection || ''
    };
  }, [state.selectedProject]);

  const handleSelectedUser = useCallback(() => {
    if (!state.selectedUser) return null;
    return {
      ...state.selectedUser,
      _id: state.selectedUser._id || '',
      username: state.selectedUser.username || '',
      email: state.selectedUser.email || '',
      role: state.selectedUser.role || 'translator'
    };
  }, [state.selectedUser]);

  const handleSelectedEpisode = useCallback(() => {
    if (!state.selectedProjectForEpisodes || !state.selectedEpisode) return null;
    return {
      ...state.selectedEpisode,
      _id: state.selectedEpisode._id || '',
      name: state.selectedEpisode.name || '',
      status: state.selectedEpisode.status || 'pending'
    };
  }, [state.selectedProjectForEpisodes, state.selectedEpisode]);

  // ----------------------------------------
  // RENDER
  // ----------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top Bar */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleTabChange('projects')}
                  className={`px-4 py-2 rounded-lg transition-colors ${state.activeTab === 'projects'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                  Projects
                </button>
                <button
                  onClick={() => handleTabChange('users')}
                  className={`px-4 py-2 rounded-lg transition-colors ${state.activeTab === 'users'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                  Users
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {state.activeTab === 'projects' && (
                <>
                  <button
                    onClick={() => handleViewModeChange((prev) => (prev === 'grid' ? 'list' : 'grid'))}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                  >
                    {state.viewMode === 'grid' ? 'List View' : 'Grid View'}
                  </button>
                  <button
                    onClick={() => updateState({ isCreating: true })}
                    className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Project
                  </button>
                </>
              )}
              {state.activeTab === 'users' && (
                <button
                  onClick={() => updateState({ isCreatingUser: true })}
                  className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Create User
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
          <div className="flex-1 w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
              <input
                type="text"
                placeholder={`Search ${state.activeTab}...`}
                value={state.searchTerm}
                onChange={(e) => {
                  console.log('Search term changed:', e.target.value); // Debug log
                  handleSearch(e.target.value);
                }}
                className="w-full pl-10 pr-4 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
          </div>

          {state.activeTab === 'projects' && (
            <div className="flex items-center space-x-4 w-full sm:w-auto">
              <select
                value={state.filterStatus}
                onChange={(e) => {
                  console.log('Status filter changed:', e.target.value); // Debug log
                  handleFilter(e.target.value as ProjectStatus | 'all');
                }}
                className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="on-hold">On Hold</option>
              </select>
              <select
                value={state.sortBy}
                onChange={(e) => {
                  console.log('Sort changed:', e.target.value); // Debug log
                  handleSortChange(e.target.value as 'title' | 'date' | 'status');
                }}
                className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              >
                <option value="date">Sort by Date</option>
                <option value="title">Sort by Title</option>
                <option value="status">Sort by Status</option>
              </select>
            </div>
          )}


        </div>
      </div>

      {/* Notifications */}
      {state.error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
          <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg max-w-lg">
            {state.error}
          </div>
        </div>
      )}
      {state.success && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
          <div className="bg-green-100 border border-green-400 text-green-700 px-6 py-4 rounded-lg max-w-lg">
            {state.success}
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {state.activeTab === 'projects' ? (
          // Projects (Grid or List)
          <div
            className={
              state.viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                : 'space-y-4'
            }
          >
            {memoizedData.filteredProjects.map((project: Project) => (
              <div
                key={project._id.toString()}
                className={`bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow duration-200 ${state.viewMode === 'list' ? 'p-4' : 'p-6'
                  }`}
              >
                <div
                  className={`${state.viewMode === 'list' ? 'flex items-center justify-between' : 'space-y-4'
                    }`}
                >
                  <div className={state.viewMode === 'list' ? 'flex-1' : ''}>
                    <div className="flex justify-between items-start">
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {project.title}
                      </h2>
                      <div className="flex items-center space-x-2">
                        <div className="dropdown-container relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProjectSelect(project);
                            }}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300"
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>
                          {state.selectedProject?._id === project._id && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => handleProjectSelect(null)}
                              />
                              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg z-50 border dark:border-gray-700">
                                <div className="py-1">
                                  <button
                                    onClick={() => router.push(`/admin/project/${project._id}` as any)}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                  >
                                    <Settings className="w-4 h-4 mr-2" />
                                    Manage
                                  </button>
                                  <button
                                    onClick={() =>
                                      router.push(`/admin/project/${project._id}/progress`)
                                    }
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <ChartBar className="w-4 h-4 mr-2" />
                                    Progress
                                  </button>
                                  <button
                                    onClick={() => {
                                      updateState({ isEditing: true });
                                      handleProjectSelect(project);
                                    }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <Edit3 className="w-4 h-4 mr-2" />
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      updateState({ isAssigning: true });
                                      handleProjectSelect(project);
                                    }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <Users className="w-4 h-4 mr-2" />
                                    Assign Users
                                  </button>
                                  <button
                                    onClick={() => {
                                      updateState({ showDeleteConfirm: true });
                                      handleProjectSelect(project);
                                    }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {state.viewMode === 'grid' && (
                      <>
                        <p className="text-gray-600 dark:text-gray-300 mt-2">
                          {project.description}
                        </p>
                        <div className="flex flex-col gap-2 mt-4">
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Language: {project.sourceLanguage} → {project.targetLanguage}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Folder Path: {project.parentFolder}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Last Updated: {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'Never'}
                          </div>

                          {/* Project Status Control */}
                          <div className="mt-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                              Status
                            </label>
                            <select
                              value={project.status}
                              onChange={(e) => handleUpdateStatus(project._id.toString(), e.target.value as ProjectStatus)}
                              className={`text-sm rounded-full px-3 py-1 font-medium border-0 ${STATUS_COLORS[project.status as keyof typeof STATUS_COLORS]
                                }`}
                            >
                              <option value="pending">Pending</option>
                              <option value="in-progress">In Progress</option>
                              <option value="completed">Completed</option>
                              <option value="on-hold">On Hold</option>
                            </select>
                          </div>

                          {/* Assigned Users List */}
                          <div className="dropdown-container relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleProjectSelect(project);
                              }}
                              className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <span>Assigned Team ({project.assignedTo?.length || 0})</span>
                              <svg
                                className={`w-5 h-5 transition-transform duration-200 ${state.selectedProjectForTeam?._id === project._id ? 'transform rotate-180' : ''
                                  }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>

                            {state.selectedProjectForTeam?._id === project._id && (
                              <>
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={() => handleProjectSelect(null)}
                                />
                                <div className="absolute left-0 mt-2 w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg z-50 border dark:border-gray-700 max-h-60 overflow-y-auto">
                                  <div className="p-2 space-y-1">
                                    {(project.assignedTo?.length || 0) > 0 ? (
                                      project.assignedTo?.map((assignedUser: AssignedUser) => (
                                        <div
                                          key={assignedUser.username}
                                          className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                          <div className="flex items-center space-x-2">
                                            <span
                                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full ${
                                                assignedUser.role === 'transcriber'
                                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300'
                                                  : assignedUser.role === 'translator'
                                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                                                    : assignedUser.role === 'voiceOver'
                                                      ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                                                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                              }`}
                                            >
                                              {assignedUser.role}
                                            </span>
                                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                                              {assignedUser.username}
                                            </span>
                                          </div>
                                          <button
                                            onClick={() => handleRemoveUser(project._id.toString(), assignedUser.username)}
                                            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                            title="Remove user"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                                        No users assigned
                                      </div>
                                    )}
                                  </div>
                                  <div className="border-t border-gray-200 dark:border-gray-700 p-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateState({ isAssigning: true });
                                        handleProjectSelect(project);
                                      }}
                                      className="flex items-center justify-center w-full px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                                    >
                                      <Users className="w-4 h-4 mr-2" />
                                      Assign Users
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Episodes Button */}
                        <div className="mt-6">
                          <button
                            onClick={() => {
                              updateState({ 
                                selectedProjectForEpisodes: project,
                                isEpisodesModalOpen: true
                              });
                            }}
                            className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                          >
                            View Episodes ({project.episodes?.length || 0})
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Users Table
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Projects
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {memoizedUsers.map((user: User) => (
                  <tr key={user._id.toString()}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {user.username}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'transcriber'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300'
                          : user.role === 'translator'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                          : user.role === 'voiceOver'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleUserActive(user._id, !user.isActive)}
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                          }`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {user.assignedProjects?.length || 0} projects
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        Last login:{' '}
                        {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => {
                          updateState({ 
                            selectedUser: user,
                            showUserDeleteConfirm: true
                          });
                        }}
                        className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE PROJECT MODAL */}
      {state.isCreating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 w-full max-w-lg mx-auto my-8">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Create New Project
            </h2>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Title
                  </label>
                  <input
                    type="text"
                    value={newProject.title}
                    onChange={(e) =>
                      setNewProject((prev) => ({ ...prev, title: e.target.value }))
                    }
                    className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Description
                  </label>
                  <textarea
                    value={newProject.description}
                    onChange={(e) =>
                      setNewProject((prev) => ({ ...prev, description: e.target.value }))
                    }
                    className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                    rows={3}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Source Language
                    </label>
                    <input
                      type="text"
                      value={newProject.sourceLanguage}
                      onChange={(e) =>
                        setNewProject((prev) => ({ ...prev, sourceLanguage: e.target.value }))
                      }
                      className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Target Language
                    </label>
                    <input
                      type="text"
                      value={newProject.targetLanguage}
                      onChange={(e) =>
                        setNewProject((prev) => ({ ...prev, targetLanguage: e.target.value }))
                      }
                      className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                      required
                    />
                  </div>
                </div>
                {/* Video Upload */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Video Upload
                  </label>
                  <div className="space-y-4">
                    <div className="flex items-center justify-center w-full">
                      <label className="w-full flex flex-col items-center px-4 py-4 sm:py-6 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400">
                        <div className="flex flex-col items-center justify-center text-center">
                          <svg
                            className="w-8 h-8 text-gray-400 mb-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                          <p className="text-sm">Click or drag to upload videos</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Multiple files allowed • No size limit
                          </p>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept="video/*"
                          multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            setNewProject((prev) => ({
                              ...prev,
                              videoFiles: [...prev.videoFiles, ...files],
                            }));

                            // Initialize progress and status
                            const newProgress = { ...uploadProgress };
                            const newStatus = { ...uploadStatus };
                            files.forEach((file) => {
                              newProgress[file.name] = {
                                loaded: 0,
                                total: file.size,
                                phase: 'pending',
                                message: 'Waiting to start',
                              };
                              newStatus[file.name] = 'pending';
                            });
                            setUploadProgress(newProgress);
                            setUploadStatus(newStatus);
                          }}
                        />
                      </label>
                    </div>
                    {/* List of selected files */}
                    {newProject.videoFiles.length > 0 && (
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 sm:p-4">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Selected Files:
                        </h4>
                        <div className="space-y-3 max-h-48 overflow-y-auto">
                          {newProject.videoFiles.map((file, index) => (
                            <div key={index} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600 dark:text-gray-300 truncate pr-2">
                                  {file.name}
                                  {uploadProgress[file.name] && (
                                    <span
                                      data-file-name={file.name}
                                      className={`ml-2 text-xs ${uploadProgress[file.name].phase === 'success'
                                        ? 'text-green-500'
                                        : uploadProgress[file.name].phase === 'error'
                                          ? 'text-red-500'
                                          : uploadProgress[file.name].phase === 'creating-collection'
                                            ? 'text-yellow-500'
                                            : uploadProgress[file.name].phase === 'processing'
                                              ? 'text-purple-500'
                                              : uploadProgress[file.name].phase === 'uploading'
                                                ? 'text-blue-500'
                                                : 'text-gray-500'
                                        }`}
                                    >
                                      {uploadProgress[file.name].phase === 'uploading' &&
                                        ` (${formatBytes(uploadProgress[file.name].loaded)} / ${formatBytes(
                                          uploadProgress[file.name].total
                                        )})`}
                                      {uploadProgress[file.name].phase !== 'uploading' &&
                                        ` • ${uploadProgress[file.name].message}`}
                                    </span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewProject((prev) => ({
                                      ...prev,
                                      videoFiles: prev.videoFiles.filter((_, i) => i !== index),
                                    }));
                                    const newProgress = { ...uploadProgress };
                                    const newStatus = { ...uploadStatus };
                                    delete newProgress[file.name];
                                    delete newStatus[file.name];
                                    setUploadProgress(newProgress);
                                    setUploadStatus(newStatus);
                                  }}
                                  className="text-red-500 hover:text-red-700 flex-shrink-0"
                                  disabled={
                                    uploadProgress[file.name]?.phase === 'uploading' ||
                                    uploadProgress[file.name]?.phase === 'creating-collection' ||
                                    uploadProgress[file.name]?.phase === 'processing'
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                              {uploadProgress[file.name] &&
                                uploadProgress[file.name].phase !== 'error' && (
                                  <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                                    <div
                                      className={`h-2 rounded-full transition-all duration-300 ${uploadProgress[file.name].phase === 'success'
                                        ? 'bg-green-600'
                                        : uploadProgress[file.name].phase === 'creating-collection'
                                          ? 'bg-yellow-600'
                                          : uploadProgress[file.name].phase === 'processing'
                                            ? 'bg-purple-600'
                                            : uploadProgress[file.name].phase === 'uploading'
                                              ? 'bg-blue-600'
                                              : 'bg-gray-600'
                                        }`}
                                      style={{
                                        width:
                                          uploadProgress[file.name].phase === 'uploading'
                                            ? `${(uploadProgress[file.name].loaded /
                                              uploadProgress[file.name].total) *
                                            100
                                            }%`
                                            : uploadProgress[file.name].phase === 'creating-collection'
                                              ? '60%'
                                              : uploadProgress[file.name].phase === 'processing'
                                                ? '80%'
                                                : uploadProgress[file.name].phase === 'success'
                                                  ? '100%'
                                                  : '0%',
                                      }}
                                    ></div>
                                  </div>
                                )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => updateState({ isCreating: false })}
                  className="w-full sm:w-auto px-4 py-2 text-center text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {state.isCreatingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Create New User
            </h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Username
                </label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) =>
                    setNewUser((prev) => ({ ...prev, username: e.target.value }))
                  }
                  className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Email
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Password
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Role
                </label>
                <select
                  value={newUser.role === 'admin' ? 'director' : newUser.role}
                  onChange={(e) =>
                    setNewUser((prev) => ({ ...prev, role: e.target.value as UserRole }))
                  }
                  className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                  required
                >
                  <option value="transcriber">Transcriber</option>
                  <option value="translator">Translator</option>
                  <option value="voiceOver">Voice Over</option>
                  <option value="director">Director</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => updateState({ isCreatingUser: false })}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE USER CONFIRMATION MODAL */}
      {state.showUserDeleteConfirm && state.selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Delete User
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Are you sure you want to delete &quot;{state.selectedUser.username}&quot;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  updateState({ 
                    showUserDeleteConfirm: false,
                    selectedUser: null
                  });
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(state.selectedUser._id)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN USERS MODAL */}
      {state.isAssigning && state.selectedProject && (
        <div data-modal="assign-users" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Assign Users to {state.selectedProject.title}
            </h2>
            
            {/* Currently Assigned Users Section */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Currently Assigned Users
              </h3>
              <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border border-gray-200 dark:border-gray-700 rounded-lg">
                {(state.selectedProject.assignedTo?.length || 0) > 0 ? (
                  state.selectedProject.assignedTo?.map((assignedUser: AssignedUser) => (
                    <div
                      key={assignedUser.username}
                      className={`flex items-center gap-2 px-3 py-1 rounded-full ${
                        assignedUser.role === 'transcriber'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300'
                          : assignedUser.role === 'translator'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                          : assignedUser.role === 'voiceOver'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <span className="text-sm">
                        {assignedUser.username} ({assignedUser.role})
                      </span>
                      <button
                        onClick={() => handleRemoveUser(state.selectedProject._id.toString(), assignedUser.username)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    No users currently assigned
                  </span>
                )}
              </div>
            </div>

            {/* Available Users Section */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Available Users
                </h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {state.selectedUsernames.length} selected
                </span>
              </div>
              
              {/* Replace the search input in assign users modal */}
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Search users..."
                  value={state.assignUserSearchTerm}
                  onChange={(e) => updateState({ assignUserSearchTerm: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              </div>

              <div className="max-h-60 overflow-y-auto border dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                {memoizedUsers.length > 0 ? (
                  memoizedUsers.map((user: User) => {
                    const isSelected = state.selectedUsernames.includes(user.username);
                    return (
                      <div
                        key={user._id.toString()}
                        className={`flex items-center px-4 py-2 cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-blue-50 dark:bg-blue-900/20' 
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                        onClick={() => handleUserSelection(user.username)}
                      >
                        <div className="flex items-center flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleUserSelection(user.username)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                          />
                          <div className="ml-3 flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {user.username}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {user.email}
                                </div>
                              </div>
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  user.role === 'transcriber'
                                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300'
                                    : user.role === 'translator'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                                    : user.role === 'voiceOver'
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                }`}
                              >
                                {user.role}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    {state.assignUserSearchTerm ? 'No users match your search' : 'No users available'}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  updateState({ 
                    isAssigning: false,
                    selectedProject: null,
                    selectedUsernames: []
                  });
                  setAssignUserSearchTerm('');
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignUsers}
                disabled={state.selectedUsernames.length === 0}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Assign Selected Users ({state.selectedUsernames.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PROJECT MODAL */}
      {state.isEditing && state.selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Edit Project
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await axios.patch(`/api/admin/projects/${state.selectedProject._id}`, {
                    title: state.selectedProject.title,
                    description: state.selectedProject.description,
                    sourceLanguage: state.selectedProject.sourceLanguage,
                    targetLanguage: state.selectedProject.targetLanguage,
                    dialogue_collection: state.selectedProject.episodes[0].collectionName,
                    status: state.selectedProject.status,
                  });
                  await refetchProjects();
                  updateState({ isEditing: false, selectedProject: null });
                  notify('Project updated successfully');
                  setTimeout(() => updateState({ success: '' }), 3000);
                } catch (err) {
                  updateState({ error: 'Failed to update project' });
                  setTimeout(() => updateState({ error: '' }), 3000);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Title
                </label>
                <input
                  type="text"
                  value={state.selectedProject.title}
                  onChange={(e) =>
                    updateState((prev) => ({
                      ...prev,
                      selectedProject: { ...prev.selectedProject, title: e.target.value }
                    }))
                  }
                  className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Description
                </label>
                <textarea
                  value={state.selectedProject.description}
                  onChange={(e) =>
                    updateState((prev) => ({
                      ...prev,
                      selectedProject: { ...prev.selectedProject, description: e.target.value }
                    }))
                  }
                  className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                  rows={3}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Source Language
                  </label>
                  <input
                    type="text"
                    value={state.selectedProject.sourceLanguage}
                    onChange={(e) =>
                      updateState((prev) => ({
                        ...prev,
                        selectedProject: { ...prev.selectedProject, sourceLanguage: e.target.value }
                      }))
                    }
                    className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Target Language
                  </label>
                  <input
                    type="text"
                    value={state.selectedProject.targetLanguage}
                    onChange={(e) =>
                      updateState((prev) => ({
                        ...prev,
                        selectedProject: { ...prev.selectedProject, targetLanguage: e.target.value }
                      }))
                    }
                    className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Collection Name
                </label>
                <input
                  type="text"
                  value={state.selectedProject.episodes[0].collectionName}
                  onChange={(e) =>
                    updateState((prev) => ({
                      ...prev,
                      selectedProject: { ...prev.selectedProject, dialogue_collection: e.target.value }
                    }))
                  }
                  className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    updateState({ isEditing: false, selectedProject: null });
                  }}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE PROJECT CONFIRMATION MODAL */}
      {state.showDeleteConfirm && state.selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Delete Project
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Are you sure you want to delete &quot;{state.selectedProject.title}&quot;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  updateState({ showDeleteConfirm: false, selectedProject: null });
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProject(state.selectedProject._id.toString())}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------- */}
      {/* MODAL: EPISODES LIST FOR THE SELECTED PROJECT */}
      {/* --------------------------------------------- */}
      {state.isEpisodesModalOpen && state.selectedProjectForEpisodes && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[999]">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full relative">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Episodes for: <span className="italic">{state.selectedProjectForEpisodes.title}</span>
            </h2>

            <button
              onClick={() => {
                updateState({ 
                  isEpisodesModalOpen: false,
                  selectedEpisode: null
                });
              }}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span className="text-lg">×</span>
            </button>

            {/* Add Upload Button */}
            <div className="mb-4">
              <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                <div className="flex items-center">
                  <Plus className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">Add New Episodes</span>
                </div>
                <input
                  type="file"
                  multiple
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleAddEpisodes(e.target.files);
                    }
                  }}
                />
              </label>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {state.selectedProjectForEpisodes.episodes && state.selectedProjectForEpisodes.episodes.length > 0 ? (
                state.selectedProjectForEpisodes.episodes.map((episode: Episode) => (
                  <div
                    key={typeof episode._id === 'object' ? String(episode._id) : episode._id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full ${episode.status === 'uploaded'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                          : episode.status === 'processing'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300'
                        }`}
                      >
                        {episode.status}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {episode.name}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          if (!state.selectedProjectForEpisodes || !episode) return;
                          try {
                            const projectId = state.selectedProjectForEpisodes._id.toString();
                            const episodeId = episode._id.toString();
                            const episodeName = encodeURIComponent(episode.name);
                            
                            router.push(
                              `/admin/project/${projectId}/episodes/${episodeName}?projectId=${projectId}&episodeId=${episodeId}&projectTitle=${encodeURIComponent(state.selectedProjectForEpisodes.title)}&episodeName=${episodeName}`
                            );
                          } catch (error) {
                            console.error('Navigation error:', error);
                            notify('Error navigating to episode view', 'error');
                          }
                        }}
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        Open
                        <svg
                          className="ml-1.5 -mr-0.5 w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          updateState({ 
                            selectedEpisode: episode,
                            showDeleteConfirm: true
                          });
                        }}
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                      >
                        Delete
                        <Trash2 className="ml-1.5 w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-6 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  No episodes available
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add this new modal for episode deletion confirmation */}
      {state.showDeleteConfirm && state.selectedEpisode && state.selectedProjectForEpisodes && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[1000]">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Delete Episode
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Are you sure you want to delete episode "{state.selectedEpisode.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  updateState({ showDeleteConfirm: false, selectedEpisode: null });
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    const response = await fetch(
                      `/api/admin/projects/${state.selectedProjectForEpisodes._id}/add-episodes?episodeId=${state.selectedEpisode._id}`,
                      {
                        method: 'DELETE',
                      }
                    );
                    
                    const data = await response.json();
                    if (data.success) {
                      notify('Episode deleted successfully');
                      await refetchProjects();
                      updateState({ showDeleteConfirm: false, selectedEpisode: null });
                    } else {
                      notify('Failed to delete episode: ' + data.error, 'error');
                    }
                  } catch (error) {
                    console.error('Error deleting episode:', error);
                    notify('Failed to delete episode', 'error');
                  }
                }}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Container for notifications */}
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
    </div>
  );
}

interface Project {
  _id: string | ObjectId;
  title: string;
  description?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  status: ProjectStatus;
  dialogue_collection?: string;
  assignedTo: AssignedUser[];
  episodes?: Episode[];
  createdAt: string;
  updatedAt: string;
  index?: string;
}

const handleCreateProject = async () => {
  // Implementation
};

const handleDeleteProject = async (projectId: string) => {
  // Implementation
};

const handleCreateUser = async () => {
  // Implementation
};

const handleDeleteUser = async (userId: string) => {
  // Implementation
};

const handleAssignUsers = async () => {
  // Implementation
};

const handleAddEpisodes = async () => {
  // Implementation
};

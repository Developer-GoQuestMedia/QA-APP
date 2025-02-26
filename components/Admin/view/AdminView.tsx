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
import type { Project as BaseProject, ProjectStatus, Episode, AssignedUser } from '@/types/project';
import type { UserRole, User } from '@/types/user';
import { useRouter } from 'next/navigation';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
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

// Add socket imports
import { getSocketClient, authenticateSocket, joinProjectRoom, leaveProjectRoom } from '@/lib/socket';
import { ensureDate } from '../utils/adminTypes';
import AdminViewProjects from './AdminViewProjects';
import AdminViewUsers from './AdminViewUsers';

// Extend the base Project type with additional fields
interface Project extends BaseProject {
  _id: string;
  title: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: string;
  createdAt: string | Date;  // Allow both string and Date
  updatedAt: string | Date;  // Allow both string and Date
  assignedTo: AssignedUser[];
  parentFolder: string;
  databaseName: string;
  collectionName: string;
  episodes: Episode[];
  index: string;
  uploadStatus: {
    totalFiles: number;
    completedFiles: number;
    currentFile: number;
    status: string;
  };
}

// ===============================
// Type Definitions
// ===============================

interface AdminViewProps {
  projects: Project[];
  refetchProjects: () => Promise<void>;
}

type UploadPhase = 'pending' | 'uploading' | 'creating-collection' | 'processing' | 'success' | 'error';

interface UploadProgressData {
  phase: UploadPhase;
  loaded: number;
  total: number;
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

interface UserSelectionHandlers {
  handleUserSelection: (username: string) => void;
  handleRemoveUser: (projectId: string, username: string) => Promise<void>;
}

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
  activeTab: Tab;
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
  uploadProgress: UploadState;
}

interface UploadState {
  [key: string]: UploadProgressData;
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

interface UploadProgressUpdate {
  phase: UploadPhase;
  loaded: number;
  total: number;
  message?: string;
  fileName?: string;
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
  return useCallback((message: string, type: string = 'success') => {
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

// Add retry wrapper for axios requests
const axiosWithRetry = async (config: AxiosRequestConfig, maxRetries = 3) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios(config);
      return response;
    } catch (error) {
      if (error instanceof AxiosError) {
        const isRetryable = (
          error.message === 'Network Error' ||
          error.code === 'ECONNABORTED' ||
          (error.response?.status && error.response?.status >= 500)
        );

        if (isRetryable && attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Request failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
};

const isValidUploadPhase = (phase: string): phase is UploadPhase => {
  return ['initializing', 'pending', 'uploading', 'creating-collection', 'processing', 'success', 'error'].includes(phase);
};

export default function AdminView({ projects, refetchProjects }: AdminViewProps) {
  // Type guards for null checks - moved to top
  const isProjectSelected = (project: Project | null): project is Project => {
    return project !== null;
  };

  const isEpisodeSelected = (episode: Episode | null): episode is Episode => {
    return episode !== null;
  };

  // Session and router hooks
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
    modalFilteredUsers: [],
    uploadProgress: {}
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
  const [uploadStatus, setUploadStatus] = useState<UploadPhase>('pending');

  // Helper function moved inside component
  const handleCreateProject = async () => {
    const logContext = {
      startTime: new Date().toISOString(),
      requestId: `proj_${Date.now()}`,
      component: 'AdminView',
      action: 'handleCreateProject'
    };

    console.log('Project creation initiated', {
      ...logContext,
      newProject: {
        title: newProject.title,
        description: newProject.description?.substring(0, 50),
        sourceLanguage: newProject.sourceLanguage,
        targetLanguage: newProject.targetLanguage,
        videoFilesCount: newProject.videoFiles?.length
      }
    });

    try {
      // Reset any previous errors and set creating state
      setState(prev => ({
        ...prev,
        error: '',
        success: '',
        isCreating: true,
        uploadProgress: {}
      }));

      // Validate form data
      if (!newProject.title?.trim()) {
        throw new Error('Project title is required');
      }

      if (!newProject.sourceLanguage?.trim() || !newProject.targetLanguage?.trim()) {
        throw new Error('Source and target languages are required');
      }

      if (!newProject.videoFiles?.length) {
        throw new Error('At least one video file is required');
      }

      // Prepare form data
      const formData = new FormData();
      formData.append('title', newProject.title.trim());
      formData.append('description', newProject.description?.trim() || '');
      formData.append('sourceLanguage', newProject.sourceLanguage.trim());
      formData.append('targetLanguage', newProject.targetLanguage.trim());

      // Validate and append files
      let totalSize = 0;
      for (const file of newProject.videoFiles) {
        if (!file.type.startsWith('video/')) {
          throw new Error(`Invalid file type for ${file.name}. Only video files are allowed.`);
        }

        if (file.size > 900 * 1024 * 1024) {
          throw new Error(`File ${file.name} is too large. Maximum size is 900MB.`);
        }

        totalSize += file.size;
        formData.append('videos', file);
      }

      if (totalSize > 10 * 1024 * 1024 * 1024) {
        throw new Error('Total file size exceeds 10GB limit');
      }

      // Make API request
      console.log('Creating project with data:', {
        title: newProject.title,
        description: newProject.description,
        fileCount: newProject.videoFiles.length,
        totalSize: formatBytes(totalSize)
      });

      const response = await axios.post('/api/projects', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000, // 5 minutes
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || totalSize;
          const loaded = progressEvent.loaded;
          const progress = Math.round((loaded * 100) / total);

          console.log('Upload progress:', {
            loaded: formatBytes(loaded),
            total: formatBytes(total),
            progress: `${progress}%`
          });

          setState(prev => ({
            ...prev,
            uploadProgress: {
              'project-creation': {
                phase: 'uploading',
                loaded,
                total,
                message: `Uploading files: ${progress}%`
              }
            }
          }));
        }
      });

      console.log('Project creation response:', response.data);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create project');
      }

      // Success handling
      setState(prev => ({
        ...prev,
        isCreating: false,
        success: 'Project created successfully',
        error: '',
        uploadProgress: {
          'project-creation': {
            phase: 'success',
            loaded: totalSize,
            total: totalSize,
            message: 'Project created successfully'
          }
        }
      }));

      // Reset form
      setNewProject({
        title: '',
        description: '',
        sourceLanguage: '',
        targetLanguage: '',
        status: 'pending',
        videoFiles: []
      });

      // Refresh projects list
      await refetchProjects();

      return response.data;
    } catch (error) {
      console.error('Project creation failed:', error);
      setState(prev => ({
        ...prev,
        isCreating: false,
        error: error instanceof Error ? error.message : 'Failed to create project',
        uploadProgress: {
          'project-creation': {
            phase: 'error',
            loaded: 0,
            total: 0,
            message: error instanceof Error ? error.message : 'Upload failed'
          }
        }
      }));
      throw error;
    }
  };

  const handleUpdateProject = async (projectId: string) => {
    try {
      const response = await axios.patch(`/api/admin/projects/${projectId}`, state.selectedProject);
      if (response.data.success) {
        notify('Project updated successfully');
        await refetchProjects();
        setState(prev => ({ ...prev, isEditing: false }));
      }
    } catch (error) {
      notify('Failed to update project', 'error');
      console.error('Error updating project:', error);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      const response = await axios.delete(`/api/admin/projects/${projectId}`);
      if (response.data.success) {
        notify('Project deleted successfully');
        await refetchProjects();
        setState(prev => ({ ...prev, showDeleteConfirm: false }));
      }
    } catch (error) {
      notify('Failed to delete project', 'error');
      console.error('Error deleting project:', error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/admin/users', newUser);
      if (response.data.success) {
        notify('User created successfully');
        queryClient.invalidateQueries(['users']);
        setState(prev => ({ ...prev, isCreatingUser: false }));
      }
    } catch (error) {
      notify('Failed to create user', 'error');
      console.error('Error creating user:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const response = await axios.delete(`/api/admin/users/${userId}`);
      if (response.data.success) {
        notify('User deleted successfully');
        queryClient.invalidateQueries(['users']);
        setState(prev => ({ ...prev, showUserDeleteConfirm: false }));
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      notify('Failed to delete user', 'error');
    }
  };

  const handleAddEpisodes = useCallback(async (files: FileList) => {
    const selectedProject = state.selectedProjectForEpisodes;
    if (!selectedProject) {
      notify('No project selected');
      return;
    }

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('episodes', file);
      });

      const response = await axios.post(
        `/api/admin/projects/${selectedProject._id}/episodes`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (response.data.success) {
        notify('Episodes added successfully');
        await refetchProjects();
      }
    } catch (error) {
      notify('Failed to add episodes', 'error');
      console.error('Error adding episodes:', error);
    }
  }, [state.selectedProjectForEpisodes, notify, refetchProjects]);

  const handleAssignUsers = useCallback(async () => {
    const selectedProject = state.selectedProject;
    if (!selectedProject || state.selectedUsernames.length === 0) {
      notify('No project selected or no users to assign');
      return;
    }

    try {
      const response = await axios.post(`/api/admin/projects/${selectedProject._id}/assign`, {
        usernames: state.selectedUsernames
      });

      if (response.data.success) {
        notify('Users assigned successfully');
        await refetchProjects();
        setState(prev => ({
          ...prev,
          isAssigning: false,
          selectedUsernames: []
        }));
      }
    } catch (error) {
      notify('Failed to assign users', 'error');
      console.error('Error assigning users:', error);
    }
  }, [state.selectedProject, state.selectedUsernames, notify, refetchProjects]);

  // Upload progress update helper
  const updateUploadProgress = useCallback((data: UploadProgressUpdate) => {
    const key = data.fileName || data.phase;
    const progressData: UploadProgressData = {
      phase: data.phase,
      loaded: data.loaded,
      total: data.total,
      message: data.message
    };

    setState(prev => ({
      ...prev,
      uploadProgress: {
        ...prev.uploadProgress,
        [key]: progressData
      }
    }));
  }, [setState]);

  // Project action handler
  const handleProjectAction = useCallback(async (action: 'create' | 'update' | 'delete', projectId?: string) => {
    try {
      if (action !== 'create' && !projectId) return;
      if (action === 'update' && !state.selectedProject) return;

      setState(prev => ({ ...prev, isProjectsLoading: true, error: '' }));

      switch (action) {
        case 'create':
          await handleCreateProject();
          break;
        case 'update':
          if (!projectId) throw new Error('Project ID is required for update');
          setState(prev => ({ ...prev, isEditing: true }));
          await handleUpdateProject(projectId);
          break;
        case 'delete':
          if (!projectId) throw new Error('Project ID is required for delete');
          setState(prev => ({ ...prev, showDeleteConfirm: true }));
          await handleDeleteProject(projectId);
          break;
      }

      await refetchProjects();
      setState(prev => ({ ...prev, success: `Project ${action}d successfully` }));
    } catch (err) {
      console.error(`Error ${action}ing project:`, err);
      toast.error(`Failed to ${action} project`);
      setState(prev => ({ ...prev, error: err instanceof Error ? err.message : 'An error occurred' }));
    }
  }, [state.selectedProject, handleCreateProject, handleUpdateProject, handleDeleteProject, refetchProjects, setState]);

  // Episode navigation handler
  const handleEpisodeNavigation = useCallback((episode: Episode) => {
    const selectedProject = state.selectedProjectForEpisodes;
    if (!selectedProject || !episode) {
      notify('Project or episode not selected');
      return;
    }

    try {
      const projectId = selectedProject._id.toString();
      const episodeId = episode._id.toString();
      const episodeName = encodeURIComponent(episode.name);

      router.push(
        `/admin/project/${projectId}/episodes/${episodeName}?projectId=${projectId}&episodeId=${episodeId}&projectTitle=${encodeURIComponent(selectedProject.title)}&episodeName=${episodeName}`
      );
    } catch (error) {
      console.error('Navigation error:', error);
      notify('Error navigating to episode view', 'error');
    }
  }, [state.selectedProjectForEpisodes, router, notify]);

  // UI event handlers
  const handleTabChange = useCallback((tab: Tab) => {
    setState(prev => ({ ...prev, activeTab: tab }));
  }, []);

  const handleViewModeChange = useCallback((mode: 'grid' | 'list') => {
    setState(prev => ({ ...prev, viewMode: mode }));
  }, []);

  const handleSortChange = useCallback((sort: 'title' | 'date' | 'status') => {
    setState(prev => ({ ...prev, sortBy: sort }));
  }, []);

  // Project selection handlers
  const handleProjectSelect = useCallback((project: Project | null) => {
    setState(prev => ({
      ...prev,
      selectedProject: project,
      selectedProjectForTeam: project,
      isEditing: false,
      isAssigning: false,
      showDeleteConfirm: false
    }));
  }, []);

  // User selection handlers
  const handleUserSelect = useCallback((user: User | null) => {
    setState(prev => ({
      ...prev,
      selectedUser: user,
      isCreatingUser: false,
      showUserDeleteConfirm: false
    }));
  }, []);

  // Modal handlers
  const handleModalClose = useCallback(() => {
    setState(prev => ({
      ...prev,
      isEpisodesModalOpen: false,
      selectedEpisode: null,
      isEpisodeDetailsOpen: false
    }));
  }, []);

  // Search and filter handlers with proper typing
  const handleSearch = useCallback((term: string) => {
    if (timeoutRefs.current.search) {
      clearTimeout(timeoutRefs.current.search);
    }
    timeoutRefs.current.search = setTimeout(() => {
      setState(prev => ({ ...prev, searchTerm: term }));
    }, 300);
  }, []);

  const handleFilter = useCallback((status: ProjectStatus | 'all') => {
    if (timeoutRefs.current.filter) {
      clearTimeout(timeoutRefs.current.filter);
    }
    timeoutRefs.current.filter = setTimeout(() => {
      setState(prev => ({ ...prev, filterStatus: status }));
    }, 300);
  }, []);

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
        handleCreateProject: async () => { },
        handleUpdateProject: async (projectId: string) => { },
        handleDeleteProject: async (projectId: string) => { },
        handleAssignUsers: async () => { },
      },
      userHandlers: {
        handleCreateUser: async () => { },
        handleUpdateUser: async (userId: string) => { },
        handleDeleteUser: async (userId: string) => { },
      },
      userSelectionHandlers: {
        handleUserSelection: (username: string) => { },
        handleRemoveUser: async (projectId: string, username: string) => { },
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
    queryKey: ['adminData', state.activeTab],
    queryFn: async () => {
      try {
        let endpoint = '';
        switch (state.activeTab) {
          case 'projects':
            endpoint = '/api/projects';
            break;
          case 'users':
            endpoint = '/api/users';
            break;
          default:
            endpoint = '/api/projects';
        }

        console.log('Fetching data from endpoint:', endpoint);
        const response = await axiosWithRetry({
          url: endpoint,
          method: 'GET',
          timeout: 10000
        });
        
        // Check if response has the expected structure
        if (!response.data) {
          console.error('Empty response received');
          throw new Error('No data received from server');
        }

        if (response.data.error) {
          console.error('Server returned error:', response.data.error);
          throw new Error(response.data.error);
        }

        // Handle the new response structure
        const responseData = response.data.success ? response.data.data : response.data;
        
        if (!Array.isArray(responseData)) {
          console.error('Invalid response structure:', responseData);
          throw new Error('Invalid response structure');
        }

        return responseData;
      } catch (error) {
        console.error('Error fetching admin data:', {
          error,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : undefined
        });
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch data';
        notify(errorMessage, 'error');
        throw error;
      }
    },
    enabled: !!session?.data?.user, // Only run query when user is authenticated
    retry: 3, // Retry failed requests 3 times
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    onError: (error: unknown) => {
      console.error('Query error:', error);
      notify('Failed to fetch data. Please try again later.', 'error');
    }
  });

  // Move useCallback outside conditionals
  const handleCallback = useCallback((projectId: string, action: 'edit' | 'delete' | 'assign'): void => {
    switch (action) {
      case 'edit':
        setState(prev => ({ ...prev, isEditing: true }));
        handleProjectSelect(projects.find(p => p._id === projectId) || null);
        break;
      case 'delete':
        setState(prev => ({ ...prev, showDeleteConfirm: true }));
        handleProjectSelect(projects.find(p => p._id === projectId) || null);
        break;
      case 'assign':
        setState(prev => ({ ...prev, isAssigning: true }));
        handleProjectSelect(projects.find(p => p._id === projectId) || null);
        break;
    }
  }, [projects, setState, handleProjectSelect]);

  // Socket connection effect with proper typing
  useEffect(() => {
    const initializeSocket = async () => {
      if (!session.data?.user) return;

      try {
        const socket = getSocketClient();
        socketRef.current = socket;

        if (socket) {
          socket.on('connect', () => {
            console.log('Socket connected');
          });

          socket.on('projectUpdate', (updatedProject: Project) => {
            refetchProjects();
          });

          socket.on('uploadProgress', (data: { 
            phase: string;
            loaded: number;
            total: number;
            message?: string;
          }) => {
            if (!isValidUploadPhase(data.phase)) {
              console.error('Invalid upload phase:', data.phase);
              return;
            }

            const progressData: UploadProgressData = {
              phase: data.phase,
              loaded: data.loaded,
              total: data.total,
              message: data.message
            };

            setState(prev => ({
              ...prev,
              uploadProgress: {
                ...prev.uploadProgress,
                [data.phase]: progressData
              }
            }));
          });
        }

        return () => {
          if (socket) {
            socket.off('connect');
            socket.off('projectUpdate');
            socket.off('uploadProgress');
            socket.disconnect();
          }
        };
      } catch (error) {
        console.error('Socket initialization error:', error);
        notify('Failed to initialize socket connection', 'error');
      }
    };

    initializeSocket();
  }, [session.data?.user, refetchProjects, notify]);

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

  // Fix state management issues
  const updateProjectState = (updates: Partial<Project>) => {
    if (!state.selectedProject?._id) return;

    const currentProject = state.selectedProject;
    
    setState(prevState => ({
      ...prevState,
      selectedProject: {
        ...currentProject,
        ...updates,
        _id: currentProject._id,
        status: currentProject.status || 'pending',
        description: currentProject.description || '',
        sourceLanguage: currentProject.sourceLanguage || '',
        targetLanguage: currentProject.targetLanguage || '',
        assignedTo: currentProject.assignedTo || [],
        episodes: currentProject.episodes || [],
        createdAt: ensureDate(currentProject.createdAt),
        updatedAt: new Date().toISOString(),
        parentFolder: currentProject.parentFolder || '',
        databaseName: currentProject.databaseName || '',
        collectionName: currentProject.collectionName || '',
        uploadStatus: currentProject.uploadStatus || {
          totalFiles: 0,
          completedFiles: 0,
          currentFile: 0,
          status: 'pending'
        }
      }
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
      }
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
      }
    }));
  };

  const setIsCreating = (value: boolean) => setState(prev => ({ ...prev, isCreating: value }));
  const setIsCreatingUser = (value: boolean) => setState(prev => ({ ...prev, isCreatingUser: value }));

  // Search term handler
  const setAssignUserSearchTerm = useCallback((term: string) => {
    setState(prev => ({ ...prev, assignUserSearchTerm: term }));
  }, []);

  // Fix project update handlers with proper typing
  const handleProjectUpdate = (field: keyof Project, value: string) => {
    if (!state.selectedProject) return;
    updateProjectState({ 
      [field]: value,
      updatedAt: new Date().toISOString()
    });
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
  const handleUserAction = useCallback(async (action: 'create' | 'update' | 'delete', userId?: string) => {
    try {
      setState(prev => ({ ...prev, error: '' }));

      switch (action) {
        case 'create':
          setState(prev => ({ ...prev, isCreatingUser: true }));
          // Implementation for create
          break;
        case 'update':
          if (!userId) throw new Error('User ID is required for update');
          // Implementation for update
          break;
        case 'delete':
          if (!userId) throw new Error('User ID is required for delete');
          setState(prev => ({ ...prev, showUserDeleteConfirm: true }));
          // Implementation for delete
          break;
      }

      setState(prev => ({ ...prev, success: `User ${action}d successfully` }));
    } catch (err) {
      setState(prev => ({ ...prev, error: err instanceof Error ? err.message : 'An error occurred' }));
    } finally {
      setState(prev => ({
        ...prev,
        isCreatingUser: false,
        showUserDeleteConfirm: false
      }));
    }
  }, [setState]);

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

  // User selection handler with support for both username and user object
  const handleUserSelection = useCallback((userOrUsername: string | User) => {
    setState(prev => {
      if (typeof userOrUsername === 'string') {
        // Handle username selection for multi-select
        const username = userOrUsername;
        return {
          ...prev,
          selectedUsernames: prev.selectedUsernames.includes(username)
            ? prev.selectedUsernames.filter(u => u !== username)
            : [...prev.selectedUsernames, username]
        };
      } else {
        // Handle single user selection with proper type checking
        const user = userOrUsername;
        return {
          ...prev,
          selectedUser: {
            ...user,
            _id: user._id.toString() // Ensure _id is string
          }
        };
      }
    });
  }, []);

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

  // Fix view mode toggle
  const toggleViewMode = useCallback(() => {
    setState(prev => ({
      ...prev,
      viewMode: prev.viewMode === 'grid' ? 'list' : 'grid'
    }));
  }, []);

  // Episode action handler
  const handleEpisodeAction = useCallback(async (action: 'add' | 'update' | 'delete' | 'view' | 'edit', episodeData?: Partial<Episode>) => {
    try {
      if (!isProjectSelected(state.selectedProjectForEpisodes)) {
        throw new Error('No project selected');
      }

      if ((action === 'view' || action === 'edit' || action === 'delete') && !isEpisodeSelected(state.selectedEpisode)) {
        throw new Error('No episode selected');
      }

      setState(prev => ({ ...prev, isProjectsLoading: true, error: '' }));

      switch (action) {
        case 'add':
          if (!episodeData) throw new Error('Episode data is required for add');
          await handleAddEpisodes(episodeData as any);
          break;
        case 'update':
          if (!episodeData?._id) throw new Error('Episode ID is required for update');
          // Implementation for update
          break;
        case 'delete':
          if (!episodeData?._id) throw new Error('Episode ID is required for delete');
          // Implementation for delete
          break;
        case 'view':
        case 'edit':
          if (!state.selectedProjectForEpisodes || !state.selectedEpisode) return;
          // Implementation for view/edit
          break;
      }

      await refetchProjects();
      setState(prev => ({ ...prev, success: `Episode ${action}d successfully` }));
    } catch (err) {
      console.error(`Error ${action}ing episode:`, err);
      notify(`Failed to ${action} episode`, 'error');
      setState(prev => ({ ...prev, error: err instanceof Error ? err.message : 'An error occurred' }));
    } finally {
      setState(prev => ({ ...prev, isProjectsLoading: false }));
    }
  }, [state.selectedProjectForEpisodes, state.selectedEpisode, handleAddEpisodes, refetchProjects, isProjectSelected, isEpisodeSelected, notify]);

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
      dialogue_collection: state.selectedProject.episodes[0].collectionName || ''
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

  // Helper function moved inside component
  const ensureDate = (date: string | Date | undefined): string | Date => {
    if (!date) return new Date().toISOString();
    return typeof date === 'string' ? date : date.toISOString();
  };

  // ----------------------------------------
  // RENDER
  // ----------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex space-x-4">
              <button
                onClick={() => setState(prev => ({ ...prev, activeTab: 'projects' }))}
                className={`px-4 py-2 rounded-lg ${state.activeTab === 'projects' ? 'bg-blue-500 text-white' : 'text-gray-600'}`}
              >
                Projects
              </button>
              <button
                onClick={() => setState(prev => ({ ...prev, activeTab: 'users' }))}
                className={`px-4 py-2 rounded-lg ${state.activeTab === 'users' ? 'bg-blue-500 text-white' : 'text-gray-600'}`}
              >
                Users
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {state.activeTab === 'projects' ? (
          <AdminViewProjects
            projects={projects}
            viewMode={state.viewMode}
            filterStatus={state.filterStatus}
            sortBy={state.sortBy}
            selectedProject={state.selectedProject}
            selectedProjectForTeam={state.selectedProjectForTeam}
            selectedProjectForEpisodes={state.selectedProjectForEpisodes}
            isAssigning={state.isAssigning}
            onViewModeChange={(mode) => setState(prev => ({ ...prev, viewMode: mode }))}
            onFilterChange={(status) => setState(prev => ({ ...prev, filterStatus: status }))}
            onSortChange={(sort) => setState(prev => ({ ...prev, sortBy: sort }))}
            onCreateProject={() => setState(prev => ({ ...prev, isCreating: true }))}
            onProjectSelect={(project) => setState(prev => ({ 
              ...prev, 
              selectedProject: project ? {
                ...project,
                _id: project._id.toString(),
                title: project.title || '',
                description: project.description || '',
                sourceLanguage: project.sourceLanguage || '',
                targetLanguage: project.targetLanguage || '',
                status: project.status || 'pending',
                assignedTo: project.assignedTo || [],
                episodes: project.episodes || []
              } : null
            }))}
            onDeleteProject={(projectId) => setState(prev => ({ ...prev, showDeleteConfirm: true }))}
            onRemoveUser={async (projectId, username) => {
              // Implement user removal logic
            }}
            onAssignUsers={() => setState(prev => ({ ...prev, isAssigning: true }))}
            onEpisodesView={(project) => setState(prev => ({ 
              ...prev, 
              selectedProjectForEpisodes: {
                ...project,
                _id: project._id.toString(),
                title: project.title || '',
                description: project.description || '',
                sourceLanguage: project.sourceLanguage || '',
                targetLanguage: project.targetLanguage || '',
                status: project.status || 'pending',
                assignedTo: project.assignedTo || [],
                episodes: project.episodes || []
              },
              isEpisodesModalOpen: true 
            }))}
            notify={notify as (message: string, type?: string) => void}
            refetchProjects={refetchProjects}
          />
        ) : (
          <AdminViewUsers
            users={state.filteredUsers}
            selectedUser={state.selectedUser}
            onCreateUser={() => setState(prev => ({ ...prev, isCreatingUser: true }))}
            onDeleteUser={(userId) => setState(prev => ({ ...prev, showUserDeleteConfirm: true }))}
            onToggleUserActive={async (userId, isActive) => {
              // Implement user activation toggle logic
            }}
            notify={notify}
          />
        )}
      </div>

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

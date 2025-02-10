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

import { Project, ProjectStatus, Episode } from '@/types/project';
import { User, UserRole } from '@/types/user';
import { useState, useEffect, useMemo, useCallback } from 'react';
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
type FilteredProject = Pick<Project, '_id' | 'title' | 'status' | 'assignedTo'>;

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
  return (message: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') {
      toast.error(message);
    } else {
      toast.success(message);
    }
  };
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
  // Add debug logging at component mount
  useEffect(() => {
    console.log('AdminView - Component mounted with projects:', {
      projectsArray: projects,
      isArray: Array.isArray(projects),
      length: projects?.length,
      projectDetails: projects?.map(p => ({
        _id: p._id,
        title: p.title,
        status: p.status,
        assignedTo: p.assignedTo?.length || 0
      }))
    });

    // Initialize socket connection
    const socket = getSocketClient();

    if (socket && session.data?.user?.id) {
      authenticateSocket(session.data.user.id);

      // Join project rooms for all projects
      projects.forEach(project => {
        if (project._id) {
          joinProjectRoom(project._id.toString());
        }
      });
    }

    // Cleanup function
    return () => {
      if (socket) {
        projects.forEach(project => {
          if (project._id) {
            leaveProjectRoom(project._id.toString());
          }
        });
      }
    };
  }, [projects, session.data?.user?.id]);

  // =================
  // State Management
  // =================

  // Tab and View Control
  const [activeTab, setActiveTab] = useState<Tab>('projects');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'title' | 'date' | 'status'>('date');

  // Search and Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | 'all'>('all');

  // Project Selection States
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedProjectForTeam, setSelectedProjectForTeam] = useState<Project | null>(null);
  const [selectedProjectForEpisodes, setSelectedProjectForEpisodes] = useState<Project | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  // User Selection States
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);

  // Modal States
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isEpisodesModalOpen, setIsEpisodesModalOpen] = useState(false);
  const [isEpisodeDetailsOpen, setIsEpisodeDetailsOpen] = useState(false);

  // Confirmation States
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUserDeleteConfirm, setShowUserDeleteConfirm] = useState(false);

  // Form States
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
    sourceLanguage: '',
    targetLanguage: '',
    status: 'pending' as ProjectStatus,
    videoFiles: [] as File[],
  });

  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    role: 'transcriber' as UserRole,
    isActive: true,
  });

  // Progress States
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgressData>>({});
  const [uploadStatus, setUploadStatus] = useState<
    Record<string, 'pending' | 'uploading' | 'success' | 'error'>
  >({});

  // Feedback States
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Add new state for assign users search
  const [assignUserSearchTerm, setAssignUserSearchTerm] = useState('');

  // Add this near other state declarations
  const [modalFilteredUsers, setModalFilteredUsers] = useState<User[]>([]);

  // =================
  // Hooks
  // =================
  const router = useRouter();
  const queryClient = useQueryClient();
  const notify = useNotifyAdmin();

  // =================
  // Data Fetching
  // =================

  // User data query configuration
  const queryConfig = useMemo(
    () => ({
      queryKey: ['users'],
      queryFn: async () => {
        const response = await axios.get('/api/admin/users');
        return response.data.data;
      },
      staleTime: 30000,
      cacheTime: 3600000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1,
    }),
    []
  );

  const { data: users = [], isLoading: isLoadingUsers } = useQuery<User[]>(queryConfig);

  // =================
  // Effects
  // =================

  // Initial data fetch
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!projects?.length && !isLoadingUsers) {
        console.log('AdminView - No projects found, fetching...');
        try {
          await refetchProjects();
          console.log('AdminView - Projects fetched successfully:', {
            count: projects?.length,
            titles: projects?.map((project: Project) => project.title)
          });
        } catch (error) {
          console.error('AdminView - Error fetching projects:', error);
        }
      } else {
        console.log('AdminView - Projects already loaded:', {
          count: projects?.length,
          titles: projects?.map((project: Project) => project.title)
        });
      }
    };

    fetchInitialData();
  }, [projects, refetchProjects, isLoadingUsers]);

  // Socket.IO setup for real-time updates
  useEffect(() => {
    console.log('Connecting to Socket.IO on client mount...');
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000');

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    socket.on('notification', (data: { message: string; type: 'success' | 'error'; action?: string }) => {
      console.log('Real-time notification received:', data);
      notify(data.message, data.type);
      // Only refetch for project-related changes
      if (data.action && ['project_created', 'project_updated', 'project_deleted', 'users_assigned'].includes(data.action)) {
        refetchProjects();
      }
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    return () => {
      console.log('Cleaning up socket...');
      socket.disconnect();
    };
  }, [notify, refetchProjects]);

  // Reset both selection and search when modal opens
  useEffect(() => {
    if (isAssigning) {
      setSelectedUsernames([]);
      setAssignUserSearchTerm('');
    }
  }, [isAssigning]);

  // User selection handler
  const handleUserSelection = useCallback((username: string): void => {
    console.log('Selecting user:', username);
    setSelectedUsernames((prev: string[]) => {
      const isCurrentlySelected = prev.includes(username);
      const newSelection = isCurrentlySelected
        ? prev.filter((name: string) => name !== username)
        : [...prev, username];
      console.log('Updated selection:', newSelection);
      return newSelection;
    });
  }, []);

  // Add proper type declaration for the remove user handler
  const handleRemoveUser = useCallback(async (projectId: string, username: string): Promise<void> => {
    try {
      await axios.post(`/api/admin/projects/${projectId}/remove-user`, {
        username
      });
      await refetchProjects();
      notify('User removed successfully', 'success');
    } catch (error) {
      console.error('Error removing user:', error);
      notify('Failed to remove user', 'error');
    }
  }, [refetchProjects, notify]);

  // =================
  // Data Processing
  // =================

  /**
   * Filter and sort projects based on search term, status, and sort criteria
   */
  const filteredProjects = useMemo(() => {
    console.log('Filtering projects:', {
      inputProjects: projects,
      searchTerm,
      filterStatus,
      sortBy
    });

    if (!Array.isArray(projects)) {
      console.error('Projects is not an array:', projects);
      return [];
    }

    let filtered = projects.filter((project: Project) => {
      const matchesSearch = project.title.toLowerCase().includes(searchTerm.toLowerCase());
      console.log('Checking project:', {
        title: project.title,
        status: project.status,
        matchesSearch
      });
      return matchesSearch;
    });

    if (filterStatus !== 'all') {
      filtered = filtered.filter((project: Project) => project.status === filterStatus);
    }

    return filtered.sort((a: Project, b: Project) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'date':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });
  }, [projects, searchTerm, filterStatus, sortBy]);

  /**
   * Filter users based on search term (username or email)
   */
  const mainFilteredUsers = useMemo(() => {
    return users.filter(
      (user: User) =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  // Add this useEffect to handle user filtering
  useEffect(() => {
    if (!isAssigning || !selectedProject || !users) return;

    const filtered = users.filter((user: User) => {
      const isActive = user.isActive;
      const matchesSearch = 
        assignUserSearchTerm === '' ||
        user.username.toLowerCase().includes(assignUserSearchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(assignUserSearchTerm.toLowerCase());

      return isActive && matchesSearch;
    });

    const logData: FilteredUsersLog = {
      total: users.length,
      filtered: filtered.length,
      searchTerm: assignUserSearchTerm,
      selectedCount: selectedUsernames.length
    };
    
    console.log('Filtered users:', logData);
    setModalFilteredUsers(filtered);
  }, [users, selectedProject, assignUserSearchTerm, isAssigning, selectedUsernames]);

  // =================
  // Event Handlers
  // =================

  /**
   * Handles closing all dropdowns
   */
  const closeAllDropdowns = useCallback(() => {
    setSelectedProject(null);
    setSelectedProjectForTeam(null);
  }, []);

  /**
   * Handles clicking outside dropdowns
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      // Don't close if clicking inside the assign users modal
      if (target.closest('[data-modal="assign-users"]')) {
        return;
      }
      // Only close dropdowns when clicking outside dropdown containers
      if (!target.closest('.dropdown-container')) {
        closeAllDropdowns();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [closeAllDropdowns]);

  /**
   * Handle project creation with file upload and processing
   */
  const handleCreateProject = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.title || !newProject.videoFiles.length) {
      setError('Please fill in all required fields and upload at least one video file');
      return;
    }

    try {
      // Create FormData and append project details
      const formData = new FormData();
      formData.append('title', newProject.title);
      formData.append('description', newProject.description);
      formData.append('sourceLanguage', newProject.sourceLanguage);
      formData.append('targetLanguage', newProject.targetLanguage);
      formData.append('status', newProject.status);

      // Append video files
      newProject.videoFiles.forEach(file => {
        formData.append('videos', file);
      });

      await axios.post('/api/admin/projects', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setSuccess('Project created successfully');
      setIsCreating(false);
      setNewProject({
        title: '',
        description: '',
        sourceLanguage: '',
        targetLanguage: '',
        status: 'pending' as ProjectStatus,
        videoFiles: []
      });

      await refetchProjects();
    } catch (error) {
      console.error('Error creating project:', error);
      setError('Failed to create project');
      notify('Failed to create project', 'error');
    }
  }, [newProject, refetchProjects, notify]);

  // -------------------------------
  //  CREATE USER HANDLER (UPDATED)
  // -------------------------------
  const handleCreateUser = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/admin/users', newUser);
      if (response.data.success) {
        toast.success(response.data.notifyMessage);
        setIsCreatingUser(false);
        setNewUser({
          username: '',
          email: '',
          password: '',
          role: 'transcriber',
          isActive: true,
        });
        queryClient.invalidateQueries({ queryKey: ['users'] });
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (error) {
      if (error instanceof Error) {
        handleError(error);
      }
    }
  };

  // ------------------------------
  //  UPDATE PROJECT STATUS
  // ------------------------------
  const handleUpdateStatus = async (projectId: string, newStatus: ProjectStatus) => {
    try {
      await axios.patch(`/api/admin/projects/${projectId}`, { status: newStatus });
      if (typeof refetchProjects === 'function') {
        await refetchProjects();
      }
      notify('Status updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to update project status');
      setTimeout(() => setError(''), 3000);
    }
  };

  // ------------------------------
  //  DELETE PROJECT
  // ------------------------------
  const handleDeleteProject = async (projectId: string) => {
    try {
      await axios.delete(`/api/admin/projects?id=${projectId}`);
      if (typeof refetchProjects === 'function') {
        await refetchProjects();
      }
      setShowDeleteConfirm(false);
      setSelectedProject(null);
      notify('Project and associated files deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to delete project');
      setTimeout(() => setError(''), 3000);
    }
  };

  // ------------------------------
  //  DELETE USER
  // ------------------------------
  const handleDeleteUser = async (userId: string) => {
    try {
      await axios.delete(`/api/admin/users/${userId}`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowUserDeleteConfirm(false);
      setSelectedUser(null);
      notify('User deleted successfully.');
    } catch (err) {
      notify('Failed to delete user', 'error');
    }
  };

  // ------------------------------
  //  TOGGLE USER ACTIVE/INACTIVE
  // ------------------------------
  const handleToggleUserActive = async (userId: string, isActive: boolean) => {
    try {
      await axios.patch(`/api/admin/users/${userId}`, { isActive });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      notify(`User ${isActive ? 'activated' : 'deactivated'} successfully`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(`Failed to ${isActive ? 'activate' : 'deactivate'} user`);
      setTimeout(() => setError(''), 3000);
    }
  };

  // ------------------------------
  //  ASSIGN USERS TO PROJECT
  // ------------------------------
  const handleAssignUsers = useCallback(async () => {
    if (!selectedProject || !selectedUsernames.length) return;

    try {
      await axios.post(`/api/admin/projects/${selectedProject._id}/assign`, {
        usernames: selectedUsernames
      });

      await refetchProjects();
      setIsAssigning(false);
      setSelectedUsernames([]);
      setSelectedProject(null);
      notify('Users assigned successfully', 'success');
    } catch (error) {
      console.error('Error assigning users:', error);
      notify('Failed to assign users', 'error');
    }
  }, [selectedProject, selectedUsernames, refetchProjects, notify]);

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
                  onClick={() => setActiveTab('projects')}
                  className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'projects'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                  Projects
                </button>
                <button
                  onClick={() => setActiveTab('users')}
                  className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'users'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                  Users
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {activeTab === 'projects' && (
                <>
                  <button
                    onClick={() => setViewMode((prev) => (prev === 'grid' ? 'list' : 'grid'))}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                  >
                    {viewMode === 'grid' ? 'List View' : 'Grid View'}
                  </button>
                  <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Project
                  </button>
                </>
              )}
              {activeTab === 'users' && (
                <button
                  onClick={() => setIsCreatingUser(true)}
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
                placeholder={`Search ${activeTab}...`}
                value={searchTerm}
                onChange={(e) => {
                  console.log('Search term changed:', e.target.value); // Debug log
                  setSearchTerm(e.target.value);
                }}
                className="w-full pl-10 pr-4 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
          </div>

          {activeTab === 'projects' && (
            <div className="flex items-center space-x-4 w-full sm:w-auto">
              <select
                value={filterStatus}
                onChange={(e) => {
                  console.log('Status filter changed:', e.target.value); // Debug log
                  setFilterStatus(e.target.value as ProjectStatus | 'all');
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
                value={sortBy}
                onChange={(e) => {
                  console.log('Sort changed:', e.target.value); // Debug log
                  setSortBy(e.target.value as 'title' | 'date' | 'status');
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
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            {error}
          </div>
        </div>
      )}
      {success && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative">
            {success}
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {activeTab === 'projects' ? (
          // Projects (Grid or List)
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                : 'space-y-4'
            }
          >
            {filteredProjects.map((project) => (
              <div
                key={project._id.toString()}
                className={`bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow duration-200 ${viewMode === 'list' ? 'p-4' : 'p-6'
                  }`}
              >
                <div
                  className={`${viewMode === 'list' ? 'flex items-center justify-between' : 'space-y-4'
                    }`}
                >
                  <div className={viewMode === 'list' ? 'flex-1' : ''}>
                    <div className="flex justify-between items-start">
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {project.title}
                      </h2>
                      <div className="flex items-center space-x-2">
                        <div className="dropdown-container relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProject((prev) =>
                                prev && prev._id === project._id ? null : project
                              );
                              setSelectedProjectForTeam(null);
                            }}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300"
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>
                          {selectedProject?._id === project._id && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setSelectedProject(null)}
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
                                      setIsEditing(true);
                                      setSelectedProject(project);
                                    }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <Edit3 className="w-4 h-4 mr-2" />
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      setIsAssigning(true);
                                      setSelectedProject(project);
                                    }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <Users className="w-4 h-4 mr-2" />
                                    Assign Users
                                  </button>
                                  <button
                                    onClick={() => {
                                      setShowDeleteConfirm(true);
                                      setSelectedProject(project);
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

                    {viewMode === 'grid' && (
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
                            Last Updated: {new Date(project.updatedAt).toLocaleDateString()}
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
                                setSelectedProjectForTeam((prev) =>
                                  prev && prev._id === project._id ? null : project
                                );
                                setSelectedProject(null);
                              }}
                              className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <span>Assigned Team ({project.assignedTo.length})</span>
                              <svg
                                className={`w-5 h-5 transition-transform duration-200 ${selectedProjectForTeam?._id === project._id ? 'transform rotate-180' : ''
                                  }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>

                            {selectedProjectForTeam?._id === project._id && (
                              <>
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={() => setSelectedProjectForTeam(null)}
                                />
                                <div className="absolute left-0 mt-2 w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg z-50 border dark:border-gray-700 max-h-60 overflow-y-auto">
                                  <div className="p-2 space-y-1">
                                    {project.assignedTo.length > 0 ? (
                                      project.assignedTo.map((user) => (
                                        <div
                                          key={user.username}
                                          className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                          <div className="flex items-center space-x-2">
                                            <span
                                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${user.role === 'transcriber'
                                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300'
                                                : user.role === 'translator'
                                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                                                  : user.role === 'voiceOver'
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                                                    : user.role === 'director'
                                                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                                                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                                }`}
                                            >
                                              {user.role}
                                            </span>
                                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                                              {user.username}
                                            </span>
                                          </div>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRemoveUser(project._id.toString(), user.username);
                                            }}
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
                                        setIsAssigning(true);
                                        setSelectedProject(project);
                                        setSelectedProjectForTeam(null);
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
                              setSelectedProjectForEpisodes(project);
                              setIsEpisodesModalOpen(true);
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
                {mainFilteredUsers.map((user: User) => (
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
                              : user.role === 'director'
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
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
                          setSelectedUser(user);
                          setShowUserDeleteConfirm(true);
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
      {isCreating && (
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
                                          : uploadProgress[file.name].phase ===
                                            'creating-collection'
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
                                        : uploadProgress[file.name].phase ===
                                          'creating-collection'
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
                                            : uploadProgress[file.name].phase ===
                                              'creating-collection'
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
                  onClick={() => setIsCreating(false)}
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
      {isCreatingUser && (
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
                  onClick={() => setIsCreatingUser(false)}
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
      {showUserDeleteConfirm && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Delete User
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Are you sure you want to delete &quot;{selectedUser.username}&quot;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowUserDeleteConfirm(false);
                  setSelectedUser(null);
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(selectedUser._id)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN USERS MODAL */}
      {isAssigning && selectedProject && (
        <div data-modal="assign-users" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Assign Users to {selectedProject.title}
            </h2>
            
            {/* Currently Assigned Users Section */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Currently Assigned Users
              </h3>
              <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border border-gray-200 dark:border-gray-700 rounded-lg">
                {selectedProject.assignedTo.length > 0 ? (
                  selectedProject.assignedTo.map((user) => (
                    <div
                      key={user.username}
                      className={`flex items-center gap-2 px-3 py-1 rounded-full ${
                        user.role === 'transcriber'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300'
                          : user.role === 'translator'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                          : user.role === 'voiceOver'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                          : user.role === 'director'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <span className="text-sm">
                        {user.username} ({user.role})
                      </span>
                      <button
                        onClick={() => handleRemoveUser(selectedProject._id.toString(), user.username)}
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
                  {selectedUsernames.length} selected
                </span>
              </div>
              
              {/* Replace the search input in assign users modal */}
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Search users..."
                  value={assignUserSearchTerm}
                  onChange={(e) => setAssignUserSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              </div>

              <div className="max-h-60 overflow-y-auto border dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                {modalFilteredUsers.length > 0 ? (
                  modalFilteredUsers.map((user) => {
                    const isSelected = selectedUsernames.includes(user.username);
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
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                                    : user.role === 'director'
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
                    {assignUserSearchTerm ? 'No users match your search' : 'No users available'}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsAssigning(false);
                  setSelectedProject(null);
                  setSelectedUsernames([]);
                  setAssignUserSearchTerm('');
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignUsers}
                disabled={selectedUsernames.length === 0}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Assign Selected Users ({selectedUsernames.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PROJECT MODAL */}
      {isEditing && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Edit Project
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await axios.patch(`/api/admin/projects/${selectedProject._id}`, {
                    title: selectedProject.title,
                    description: selectedProject.description,
                    sourceLanguage: selectedProject.sourceLanguage,
                    targetLanguage: selectedProject.targetLanguage,
                    dialogue_collection: selectedProject.dialogue_collection,
                    status: selectedProject.status,
                  });
                  await refetchProjects();
                  setIsEditing(false);
                  setSelectedProject(null);
                  notify('Project updated successfully');
                  setTimeout(() => setSuccess(''), 3000);
                } catch (err) {
                  setError('Failed to update project');
                  setTimeout(() => setError(''), 3000);
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
                  value={selectedProject.title}
                  onChange={(e) =>
                    setSelectedProject((prev) => (prev ? { ...prev, title: e.target.value } : null))
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
                  value={selectedProject.description}
                  onChange={(e) =>
                    setSelectedProject((prev) =>
                      prev ? { ...prev, description: e.target.value } : null
                    )
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
                    value={selectedProject.sourceLanguage}
                    onChange={(e) =>
                      setSelectedProject((prev) =>
                        prev ? { ...prev, sourceLanguage: e.target.value } : null
                      )
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
                    value={selectedProject.targetLanguage}
                    onChange={(e) =>
                      setSelectedProject((prev) =>
                        prev ? { ...prev, targetLanguage: e.target.value } : null
                      )
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
                  value={selectedProject.dialogue_collection}
                  onChange={(e) =>
                    setSelectedProject((prev) =>
                      prev ? { ...prev, dialogue_collection: e.target.value } : null
                    )
                  }
                  className="w-full p-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setSelectedProject(null);
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
      {showDeleteConfirm && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Delete Project
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Are you sure you want to delete &quot;{selectedProject.title}&quot;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setSelectedProject(null);
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProject(selectedProject._id.toString())}
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
      {isEpisodesModalOpen && selectedProjectForEpisodes && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[999]">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full relative">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Episodes for: <span className="italic">{selectedProjectForEpisodes.title}</span>
            </h2>

            <button
              onClick={() => {
                setIsEpisodesModalOpen(false);
                setSelectedProjectForEpisodes(null);
              }}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span className="text-lg">×</span>
            </button>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {selectedProjectForEpisodes.episodes && selectedProjectForEpisodes.episodes.length > 0 ? (
                selectedProjectForEpisodes.episodes.map((episode) => (
                  <div
                    key={typeof episode._id === 'object' ? String(episode._id) : episode._id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          episode.status === 'uploaded'
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
                          console.log('Opening episode:', {
                            projectId: selectedProjectForEpisodes._id,
                            episodeName: episode.name,
                            timestamp: new Date().toISOString()
                          });
                          router.push(`/admin/project/${selectedProjectForEpisodes._id}/episodes/${encodeURIComponent(episode.name)}`);
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

// Function to notify admin view (if needed elsewhere)
function notifyAdmin(message: string) {
  console.log('Admin Notification:', message);
}

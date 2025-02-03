'use client';

import { Project, ProjectStatus, Episode } from '@/types/project';
import { User, UserRole } from '@/types/user';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient, useQuery } from '@tanstack/react-query';
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
import EpisodeView from './EpisodeView';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { io } from 'socket.io-client';

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

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  'in-progress': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  'on-hold': 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
} as const;

type Tab = 'projects' | 'users';

const formatBytes = (bytes: number, decimals: number = 2) => {
  if (bytes === 0) return '0 MB';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const getTimeStamp = () => {
  return new Date().toISOString();
};

// Utility function to notify admin
function useNotifyAdmin() {
  return (message: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') {
      toast.error(message); // Show error notifications
    } else {
      toast.success(message); // Show success notifications
    }
  };
}

const handleError = (error: Error): void => {
  console.error('Error:', error);
  toast.error('An error occurred. Please try again.');
};

export default function AdminView({ projects, refetchProjects }: AdminViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('projects');
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | 'all'>('all');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUserDeleteConfirm, setShowUserDeleteConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'title' | 'date' | 'status'>('date');

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

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);

  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgressData>>({});
  const [uploadStatus, setUploadStatus] = useState<
    Record<string, 'pending' | 'uploading' | 'success' | 'error'>
  >({});

  // ---------------------------------------
  //  NEW STATES FOR EPISODE MODALS
  // ---------------------------------------
  // Separate modal to show the entire episode list
  const [isEpisodesModalOpen, setIsEpisodesModalOpen] = useState(false);

  // Separate modal to show a single episode's details
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [isEpisodeDetailsOpen, setIsEpisodeDetailsOpen] = useState(false);

  // Memoize query configuration for fetching users
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

  const notify = useNotifyAdmin();

  // Only fetch on mount once if needed
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!projects?.length) {
        await refetchProjects();
      }
    };
    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchProjects]);

  // Socket.IO setup
  useEffect(() => {
    console.log('Connecting to Socket.IO on client mount...');

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000');

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    socket.on('notification', (data: { message: string; type: 'success' | 'error' }) => {
      console.log('Real-time notification received:', data);
      notify(data.message, data.type);
      refetchProjects(); // Trigger UI update
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    return () => {
      console.log('Cleaning up socket...');
      socket.disconnect();
    };
  }, [notify, refetchProjects]);

  // --------------------------
  //   FILTER & SORT PROJECTS
  // --------------------------
  const filteredProjects = useMemo(() => {
    return projects.filter((project: Project) =>
      project.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [projects, searchTerm]);

  // ------------------------
  //   FILTER USERS FOR TAB
  // ------------------------
  const filteredUsers = useMemo(() => {
    return users.filter(
      (user: User) =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  // -------------------------------------
  //  CREATE PROJECT HANDLER (UPDATED)
  // -------------------------------------
  const handleCreateProject = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const startTime = Date.now();
      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      try {
        console.log(`[${getTimeStamp()}] Starting project creation with payload:`, {
          title: newProject.title,
          description: newProject.description,
          sourceLanguage: newProject.sourceLanguage,
          targetLanguage: newProject.targetLanguage,
          totalFiles: newProject.videoFiles.length,
          fileNames: newProject.videoFiles.map((f) => f.name),
          totalSize: newProject.videoFiles.reduce((acc, file) => acc + file.size, 0),
        });

        // Validate required fields
        const requiredFields = ['title', 'description', 'sourceLanguage', 'targetLanguage'];
        const missingFields = requiredFields.filter((field) => !(newProject as any)[field]);
        if (missingFields.length > 0) {
          setError(`Missing required fields: ${missingFields.join(', ')}`);
          return;
        }

        // Validate if files are selected
        if (newProject.videoFiles.length === 0) {
          setError('Please select at least one video file');
          return;
        }

        // Initialize upload status for all files
        const initialStatus: Record<string, 'pending' | 'uploading' | 'success' | 'error'> = {};
        newProject.videoFiles.forEach((file) => {
          initialStatus[file.name] = 'pending';
        });
        setUploadStatus(initialStatus);

        // Upload files in parallel with concurrency limit
        const concurrencyLimit = 3;
        const files = [...newProject.videoFiles];
        const uploadPromises: Promise<any>[] = [];

        const uploadFile = async (file: File, index: number) => {
          try {
            const formData = new FormData();
            formData.append('video', file);
            formData.append('title', newProject.title);
            formData.append('description', newProject.description);
            formData.append('sourceLanguage', newProject.sourceLanguage);
            formData.append('targetLanguage', newProject.targetLanguage);
            formData.append(
              'metadata',
              JSON.stringify({
                currentFile: {
                  isFirst: index === 0,
                  isLast: index === newProject.videoFiles.length - 1,
                  index,
                },
                collections: newProject.videoFiles.map((f) =>
                  f.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_')
                ),
                filePaths: newProject.videoFiles.map((f) => f.name),
              })
            );

            const response = await axios.post('/api/admin/projects', formData);

            if (response.data.skipped) {
              console.log(`File ${file.name} skipped:`, response.data.message);
              skipCount++;
              return { status: 'skipped', data: response.data };
            }

            console.log(`Uploaded file ${index + 1}/${newProject.videoFiles.length}:`, file.name);
            successCount++;
            return { status: 'success', data: response.data };
          } catch (err: any) {
            console.error(`Error uploading file ${file.name}:`, {
              error: err,
              response: err.response?.data,
              status: err.response?.status,
              details: err.response?.data?.details,
              errorType: err.response?.data?.errorType,
              mongoError: err.response?.data?.mongoError,
              r2Error: err.response?.data?.r2Error
            });
            errorCount++;
            return { status: 'error', error: err.message };
          }
        };

        // Process files with concurrency
        while (files.length > 0 || uploadPromises.length > 0) {
          while (files.length > 0 && uploadPromises.length < concurrencyLimit) {
            const file = files.shift();
            if (file) {
              const index = newProject.videoFiles.indexOf(file);
              uploadPromises.push(uploadFile(file, index));
            }
          }

          if (uploadPromises.length > 0) {
            await Promise.all(uploadPromises);
            uploadPromises.length = 0;
          }
        }

        const totalDuration = (Date.now() - startTime) / 1000;
        console.log(`[${getTimeStamp()}] All files processed in ${totalDuration.toFixed(1)}s`);

        // Show final status
        let statusMessage = `Upload complete:\n`;
        if (successCount > 0) statusMessage += `✓ ${successCount} files uploaded successfully\n`;
        if (skipCount > 0) statusMessage += `⚠ ${skipCount} files skipped (already exist)\n`;
        if (errorCount > 0) statusMessage += `✗ ${errorCount} files failed to upload\n`;

        setSuccess(statusMessage);

        if (successCount > 0 || skipCount > 0) {
          setIsCreating(false);
          setNewProject({
            title: '',
            description: '',
            sourceLanguage: '',
            targetLanguage: '',
            status: 'pending',
            videoFiles: [],
          });
          if (typeof refetchProjects === 'function') {
            await refetchProjects();
          }
          notify(`Project "${newProject.title}" created successfully.`);
        }

        setTimeout(() => setSuccess(''), 5000);
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to create project';
        setError(errorMessage);
        notify('Failed to create project', 'error');
        setTimeout(() => setError(''), 5000);
      }
    },
    [newProject, refetchProjects, notify]
  );

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
  const handleAssignUsers = async () => {
    try {
      if (!selectedProject) return;
      await axios.post(`/api/admin/projects/${selectedProject._id}/assign`, {
        usernames: selectedUsernames,
      });
      if (typeof refetchProjects === 'function') {
        await refetchProjects();
      }
      setIsAssigning(false);
      setSelectedUsernames([]);
      setSelectedProject(null);
      notify('Users assigned successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to assign users');
      setTimeout(() => setError(''), 3000);
    }
  };

  // ------------------------------
  //  REMOVE USER FROM PROJECT
  // ------------------------------
  const handleRemoveUser = async (projectId: string, username: string) => {
    try {
      await axios.delete(`/api/admin/projects/${projectId}/assign`, {
        data: { usernames: [username] },
      });
      if (refetchProjects) {
        await refetchProjects();
      }
      notify('User removed successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to remove user');
      setTimeout(() => setError(''), 3000);
    }
  };

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
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    activeTab === 'projects'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Projects
                </button>
                <button
                  onClick={() => setActiveTab('users')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    activeTab === 'users'
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
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
          </div>

          {activeTab === 'projects' && (
            <div className="flex items-center space-x-4 w-full sm:w-auto">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as ProjectStatus | 'all')}
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
                onChange={(e) => setSortBy(e.target.value as 'title' | 'date' | 'status')}
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
                className={`bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow duration-200 ${
                  viewMode === 'list' ? 'p-4' : 'p-6'
                }`}
              >
                <div
                  className={`${
                    viewMode === 'list' ? 'flex items-center justify-between' : 'space-y-4'
                  }`}
                >
                  <div className={viewMode === 'list' ? 'flex-1' : ''}>
                    <div className="flex justify-between items-start">
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {project.title}
                      </h2>
                      <div className="flex items-center space-x-2">
                        <div className="relative">
                          <button
                            onClick={() => {
                              // Toggle the "options menu" for THIS project
                              // If it's the same selected, reset it. Otherwise set it.
                              setSelectedProject((prev) =>
                                prev && prev._id === project._id ? null : project
                              );
                            }}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300"
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>
                          {/* Options dropdown */}
                          {selectedProject?._id === project._id && (
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg z-10 border dark:border-gray-700">
                              <div className="py-1">
                                <button
                                  onClick={() => router.push(`/admin/project/${project._id}`)}
                                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
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
                        </div>

                        {/* Episodes Button */}
                        <div className="mt-6">
                          <button
                            onClick={() => {
                              setSelectedProject(project);
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
                {filteredUsers.map((user) => (
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
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
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
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleUserActive(user._id, !user.isActive)}
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.isActive
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
                                      className={`ml-2 text-xs ${
                                        uploadProgress[file.name].phase === 'success'
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
                                      className={`h-2 rounded-full transition-all duration-300 ${
                                        uploadProgress[file.name].phase === 'success'
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
                                            ? `${
                                                (uploadProgress[file.name].loaded /
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Assign Users to {selectedProject.title}
            </h2>
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Currently Assigned
              </h3>
              <div className="flex flex-wrap gap-2">
                {selectedProject.assignedTo.map((user) => (
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
                ))}
                {selectedProject.assignedTo.length === 0 && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    No users assigned
                  </span>
                )}
              </div>
            </div>
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Available Users
              </h3>
              <div className="max-h-60 overflow-y-auto border dark:border-gray-700 rounded-lg">
                {users
                  .filter(
                    (user) =>
                      user.isActive &&
                      !selectedProject.assignedTo.some(
                        (assigned) => assigned.username === user.username
                      )
                  )
                  .map((user) => (
                    <label
                      key={user._id.toString()}
                      className="flex items-center px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUsernames.includes(user.username)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUsernames((prev) => [...prev, user.username]);
                          } else {
                            setSelectedUsernames((prev) =>
                              prev.filter((name) => name !== user.username)
                            );
                          }
                        }}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                      />
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {user.username}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {user.email} • {user.role} • Last login:{' '}
                          {user.lastLogin
                            ? new Date(user.lastLogin).toLocaleDateString()
                            : 'Never'}
                        </div>
                      </div>
                    </label>
                  ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsAssigning(false);
                  setSelectedProject(null);
                  setSelectedUsernames([]);
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
                Assign Selected Users
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
      {isEpisodesModalOpen && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[999]">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full relative">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Episodes for: <span className="italic">{selectedProject.title}</span>
            </h2>

            <button
              onClick={() => setIsEpisodesModalOpen(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span className="text-lg">×</span>
            </button>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {selectedProject.episodes && selectedProject.episodes.length > 0 ? (
                selectedProject.episodes.map((episode) => (
                  <div
                    // Make sure to convert ObjectId to a string if needed
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
                          setSelectedEpisode(episode);
                          setIsEpisodeDetailsOpen(true);
                        }}
                        className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() =>
                          router.push(`/admin/project/${selectedProject._id}/episodes/${episode.name}`)
                        }
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

      {/* --------------------------------------------- */}
      {/* MODAL: INDIVIDUAL EPISODE DETAILS            */}
      {/* --------------------------------------------- */}
      {isEpisodeDetailsOpen && selectedEpisode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full relative">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Episode Details
            </h2>
            <button
              onClick={() => {
                setSelectedEpisode(null);
                setIsEpisodeDetailsOpen(false);
              }}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span className="text-lg">×</span>
            </button>

            {/* Render your EpisodeView here. Adjust styling as needed. */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <EpisodeView episode={selectedEpisode} />
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

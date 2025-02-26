import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Project, ProjectStatus, AssignedUser, Episode } from '@/types/project';
import { Plus, Users, Trash2 } from 'lucide-react';
import { ProjectState, initialProjectState, projectStateActions } from '../state/projectState';
import { TimeoutRefs, ProjectHandlers, formatBytes, getTimeStamp } from '../utils/adminTypes';
import { useNotifyAdmin } from '@/hooks/useNotifyAdmin';
import { getSocketClient } from '@/lib/socket';
import { toast } from 'react-hot-toast';
import { ObjectId } from 'mongodb';
import { Project as BaseProject, Episode as BaseEpisode } from '@/types/project';

// Helper function to convert ObjectId to string
const ensureStringId = (id: string | ObjectId | undefined): string => {
  if (!id) return '';
  return typeof id === 'object' ? (id as ObjectId).toString() : id;
};

// Helper function to convert BaseProject to Project
const convertToProject = (baseProject: BaseProject): Project => {
  const convertedProject = {
    ...baseProject,
    _id: ensureStringId(baseProject._id),
    assignedTo: baseProject.assignedTo.map(user => ({
      _id: ensureStringId(user._id),
      username: user.username,
      role: user.role,
      email: user.email
    })),
    episodes: baseProject.episodes.map(episode => ({
      ...episode,
      _id: ensureStringId(episode._id)
    }))
  } as Project;
  return convertedProject;
};

// Helper function to convert BaseEpisode to Episode
const convertToEpisode = (baseEpisode: BaseEpisode): Episode => {
  const convertedEpisode = {
    ...baseEpisode,
    _id: ensureStringId(baseEpisode._id)
  } as Episode;
  return convertedEpisode;
};

interface AdminViewProjectsProps {
  projects: BaseProject[];
  viewMode: 'grid' | 'list';
  filterStatus: ProjectStatus | 'all';
  sortBy: 'title' | 'date' | 'status';
  selectedProject: Project | null;
  selectedProjectForTeam: Project | null;
  selectedProjectForEpisodes: Project | null;
  isAssigning: boolean;
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onFilterChange: (status: ProjectStatus | 'all') => void;
  onSortChange: (sort: 'title' | 'date' | 'status') => void;
  onCreateProject: () => void;
  onProjectSelect: (project: Project | null) => void;
  onDeleteProject: (projectId: string) => void;
  onRemoveUser: (projectId: string, username: string) => Promise<void>;
  onAssignUsers: () => void;
  onEpisodesView: (project: Project) => void;
  notify: (message: string, type?: string) => void;
  refetchProjects: () => Promise<void>;
}

export default function AdminViewProjects({
  projects,
  viewMode,
  filterStatus,
  sortBy,
  selectedProject,
  selectedProjectForTeam,
  selectedProjectForEpisodes,
  isAssigning,
  onViewModeChange,
  onFilterChange,
  onSortChange,
  onCreateProject,
  onProjectSelect,
  onDeleteProject,
  onRemoveUser,
  onAssignUsers,
  onEpisodesView,
  notify,
  refetchProjects
}: AdminViewProjectsProps) {
  const session = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const socketRef = useRef<ReturnType<typeof getSocketClient> | null>(null);
  const projectsRef = useRef<BaseProject[]>(projects);
  const timeoutRefs = useRef<TimeoutRefs>({});

  const [state, setState] = useState<ProjectState>(initialProjectState);

  const notifyToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    toast[type](message);
  }, []);

  // Socket connection setup
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

          socket.on('projectUpdate', (updatedProject: BaseProject) => {
            projectsRef.current = projectsRef.current.map(p => 
              p._id === updatedProject._id ? updatedProject : p
            );
            refetchProjects();
          });

          socket.on('uploadProgress', (data: { 
            phase: string;
            loaded: number;
            total: number;
            message?: string;
          }) => {
            setState(prev => projectStateActions.updateUploadProgress(prev, {
              phase: data.phase as any,
              loaded: data.loaded,
              total: data.total,
              message: data.message
            }));
          });

          return () => {
            socket.off('connect');
            socket.off('projectUpdate');
            socket.off('uploadProgress');
            socket.disconnect();
          };
        }
      } catch (error) {
        console.error('Socket initialization error:', error);
        notifyToast('Failed to initialize socket connection', 'error');
      }
    };

    initializeSocket();
  }, [session.data?.user, refetchProjects, notifyToast]);

  // Project handlers
  const handleCreateProject = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const response = await axios.post('/api/admin/projects', {
        title: state.selectedProject?.title,
        description: state.selectedProject?.description,
        sourceLanguage: state.selectedProject?.sourceLanguage,
        targetLanguage: state.selectedProject?.targetLanguage
      });

      if (response.data.success) {
        notifyToast('Project created successfully');
        await refetchProjects();
        setState(prev => projectStateActions.setSelectedProject(prev, null));
      }
    } catch (error) {
      console.error('Error creating project:', error);
      notifyToast('Failed to create project', 'error');
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleUpdateProject = async (projectId: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const response = await axios.put(`/api/admin/projects/${projectId}`, {
        ...state.selectedProject,
        updatedAt: getTimeStamp()
      });

      if (response.data.success) {
        notifyToast('Project updated successfully');
        await refetchProjects();
        setState(prev => projectStateActions.setSelectedProject(prev, null));
      }
    } catch (error) {
      console.error('Error updating project:', error);
      notifyToast('Failed to update project', 'error');
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const response = await axios.delete(`/api/admin/projects/${projectId}`);
      
      if (response.data.success) {
        notifyToast('Project deleted successfully');
        await refetchProjects();
        setState(prev => projectStateActions.setSelectedProject(prev, null));
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      notifyToast('Failed to delete project', 'error');
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleAddEpisodes = useCallback(async (files: FileList) => {
    if (!state.selectedProjectForEpisodes?._id) {
      notifyToast('No project selected', 'error');
      return;
    }

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('episodes', file);
      });

      const projectId = ensureStringId(state.selectedProjectForEpisodes._id);
      await axios.post(
        `/api/admin/projects/${projectId}/episodes`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            setState(prev => projectStateActions.updateUploadProgress(prev, {
              phase: 'uploading',
              loaded: progressEvent.loaded,
              total: progressEvent.total || 0,
              message: `Uploading episode files (${Math.round((progressEvent.loaded / (progressEvent.total || 1)) * 100)}%)`
            }));
          }
        }
      );

      notifyToast('Episodes added successfully');
      await refetchProjects();
    } catch (error) {
      console.error('Error adding episodes:', error);
      notifyToast('Failed to add episodes', 'error');
    }
  }, [state.selectedProjectForEpisodes, notify, refetchProjects]);

  // Project selection handlers
  const handleProjectSelection = useCallback((project: BaseProject) => {
    const convertedProject = convertToProject(project);
    setState(prev => projectStateActions.setSelectedProject(prev, convertedProject));
  }, []);

  const handleEpisodeSelection = useCallback((episode: BaseEpisode | null) => {
    if (episode) {
      const convertedEpisode = convertToEpisode(episode);
      setState(prev => projectStateActions.setSelectedEpisode(prev, convertedEpisode));
    } else {
      setState(prev => projectStateActions.setSelectedEpisode(prev, null));
    }
  }, []);

  // View mode handlers
  const handleViewModeChange = useCallback((mode: 'grid' | 'list') => {
    setState(prev => projectStateActions.setViewMode(prev, mode));
  }, []);

  const handleSortChange = useCallback((sortBy: 'title' | 'date' | 'status') => {
    setState(prev => projectStateActions.setSortBy(prev, sortBy));
  }, []);

  const projectHandlers: ProjectHandlers = {
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    handleAssignUsers: async () => {} // Implement if needed
  };

  return (
    <>
      {/* Projects Header Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => onViewModeChange(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          >
            {viewMode === 'grid' ? 'List View' : 'Grid View'}
          </button>
          <button
            onClick={onCreateProject}
            className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Project
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-4">
          <select
            value={filterStatus}
            onChange={(e) => onFilterChange(e.target.value as ProjectStatus | 'all')}
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
            onChange={(e) => onSortChange(e.target.value as 'title' | 'date' | 'status')}
            className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          >
            <option value="date">Sort by Date</option>
            <option value="title">Sort by Title</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>
      </div>

      {/* Projects Grid/List */}
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
            : 'space-y-4'
        }
      >
        {projects.map((project: BaseProject) => (
          <div
            key={project._id}
            className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden ${
              viewMode === 'list' ? 'flex items-center justify-between p-4' : ''
            }`}
          >
            <div className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  {project.title}
                </h3>
                <div className="relative">
                  <button
                    onClick={() => onProjectSelect(project)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Users className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="mt-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {project.description}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      project.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                        : project.status === 'in-progress'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                        : project.status === 'completed'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {project.status}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onAssignUsers()}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  >
                    Assign Users
                  </button>
                  <button
                    onClick={() => onDeleteProject(project._id)}
                    className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Assigned Users */}
              {selectedProjectForTeam?._id === project._id && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Assigned Users
                  </h4>
                  <div className="space-y-2">
                    {project.assignedTo?.map((user: AssignedUser) => (
                      <div
                        key={user.username}
                        className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-2 rounded"
                      >
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {user.username} ({user.role})
                        </span>
                        <button
                          onClick={() => onRemoveUser(project._id, user.username)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Episodes Button */}
              <div className="mt-4">
                <button
                  onClick={() => onEpisodesView(project)}
                  className="w-full px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  View Episodes ({project.episodes?.length || 0})
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
} 
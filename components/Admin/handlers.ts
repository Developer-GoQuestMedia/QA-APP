import { useCallback } from 'react';
import axios from 'axios';
import { AdminViewState, UploadProgressData } from './adminViewState';
import logger from '@/lib/logger';

export const useAdminHandlers = (
  state: AdminViewState,
  setState: React.Dispatch<React.SetStateAction<AdminViewState>>,
  refetchProjects: () => Promise<void>
) => {
  const updateUploadProgress = useCallback((data: UploadProgressData) => {
    setState(prev => ({
      ...prev,
      uploadProgress: {
        ...prev.uploadProgress,
        [data.phase]: {
          phase: data.phase,
          loaded: data.loaded,
          total: data.total,
          message: data.message
        }
      }
    }));
  }, [setState]);

  const handleCreateProject = async () => {
    try {
      if (!state.selectedProject) {
        throw new Error('No project data available');
      }

      const formData = new FormData();
      formData.append('title', state.selectedProject.title);
      formData.append('description', state.selectedProject.description || '');
      formData.append('sourceLanguage', state.selectedProject.sourceLanguage || '');
      formData.append('targetLanguage', state.selectedProject.targetLanguage || '');
      formData.append('status', state.selectedProject.status);

      await axios.post('/api/admin/projects', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = progressEvent.loaded / (progressEvent.total || 0);
          updateUploadProgress({
            phase: 'uploading',
            loaded: progressEvent.loaded,
            total: progressEvent.total || 0,
            message: `Uploading project files (${Math.round(progress * 100)}%)`
          });
        }
      });

      await refetchProjects();
      setState(prev => ({ 
        ...prev,
        isCreating: false, 
        selectedProject: null,
        success: 'Project created successfully',
        error: ''
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project';
      setState(prev => ({ ...prev, error: errorMessage, success: '' }));
      logger.error('Project creation failed:', error);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await axios.delete(`/api/admin/projects/${projectId}`);
      await refetchProjects();
      setState(prev => ({ 
        ...prev,
        showDeleteConfirm: false, 
        selectedProject: null,
        success: 'Project deleted successfully',
        error: ''
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete project';
      setState(prev => ({ ...prev, error: errorMessage, success: '' }));
      logger.error('Project deletion failed:', error);
    }
  };

  const handleCreateUser = async () => {
    try {
      if (!state.selectedUser) {
        throw new Error('No user data available');
      }

      const userData = {
        username: state.selectedUser.username,
        email: state.selectedUser.email,
        password: state.selectedUser.password,
        role: state.selectedUser.role,
        isActive: state.selectedUser.isActive
      };

      await axios.post('/api/admin/users', userData);
      setState(prev => ({ 
        ...prev,
        isCreatingUser: false, 
        selectedUser: null,
        success: 'User created successfully',
        error: ''
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create user';
      setState(prev => ({ ...prev, error: errorMessage, success: '' }));
      logger.error('User creation failed:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await axios.delete(`/api/admin/users/${userId}`);
      setState(prev => ({ 
        ...prev,
        showUserDeleteConfirm: false, 
        selectedUser: null,
        success: 'User deleted successfully',
        error: ''
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete user';
      setState(prev => ({ ...prev, error: errorMessage, success: '' }));
      logger.error('User deletion failed:', error);
    }
  };

  const handleAssignUsers = async () => {
    try {
      if (!state.selectedProject?._id || state.selectedUsernames.length === 0) {
        throw new Error('No project or users selected');
      }

      await axios.post(`/api/admin/projects/${state.selectedProject._id}/assign`, {
        usernames: state.selectedUsernames
      });

      await refetchProjects();
      setState(prev => ({ 
        ...prev,
        isAssigning: false,
        selectedUsernames: [],
        success: 'Users assigned successfully',
        error: ''
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to assign users';
      setState(prev => ({ ...prev, error: errorMessage, success: '' }));
      logger.error('User assignment failed:', error);
    }
  };

  const handleAddEpisodes = async (files: FileList) => {
    try {
      if (!state.selectedProjectForEpisodes?._id) {
        throw new Error('No project selected');
      }

      const formData = new FormData();
      Array.from(files).forEach((file, index) => {
        formData.append(`episode${index}`, file);
      });

      await axios.post(
        `/api/admin/projects/${state.selectedProjectForEpisodes._id}/episodes`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const progress = progressEvent.loaded / (progressEvent.total || 0);
            updateUploadProgress({
              phase: 'uploading',
              loaded: progressEvent.loaded,
              total: progressEvent.total || 0,
              message: `Uploading episode files (${Math.round(progress * 100)}%)`
            });
          }
        }
      );

      await refetchProjects();
      setState(prev => ({ 
        ...prev,
        isEpisodesModalOpen: false,
        success: 'Episodes added successfully',
        error: ''
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add episodes';
      setState(prev => ({ ...prev, error: errorMessage, success: '' }));
      logger.error('Episode addition failed:', error);
    }
  };

  const handleUserSelection = useCallback((username: string) => {
    setState(prev => ({
      ...prev,
      selectedUsernames: prev.selectedUsernames.includes(username)
        ? prev.selectedUsernames.filter(u => u !== username)
        : [...prev.selectedUsernames, username]
    }));
  }, [setState]);

  const setAssignUserSearchTerm = useCallback((term: string) => {
    setState(prev => ({ ...prev, assignUserSearchTerm: term }));
  }, [setState]);

  return {
    updateUploadProgress,
    handleCreateProject,
    handleDeleteProject,
    handleCreateUser,
    handleDeleteUser,
    handleAssignUsers,
    handleAddEpisodes,
    handleUserSelection,
    setAssignUserSearchTerm
  };
}; 
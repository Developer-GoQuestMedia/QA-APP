import { useCallback } from 'react';
import axios from 'axios';
import { AdminViewState, UploadProgressData, stateActions } from './state/adminViewState';
import logger from '@/lib/logger';
import { io } from 'socket.io-client';
import { formatBytes, validateFile } from '@/lib/utils';

interface UploadResult {
  fileName: string;
  fileKey: string;
  collectionName: string;
}

export const useAdminHandlers = (
  state: AdminViewState,
  setState: React.Dispatch<React.SetStateAction<AdminViewState>>,
  refetchProjects: () => Promise<void>
) => {
  const MAX_RETRIES = 3;
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

  const uploadChunk = async (
    file: File,
    chunk: Blob,
    chunkIndex: number,
    uploadId: string,
    fileKey: string,
    onProgress: (loaded: number, total: number) => void
  ): Promise<{ ETag: string }> => {
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('uploadId', uploadId);
    formData.append('fileKey', fileKey);

    const response = await axios.post('/api/admin/upload/chunk', formData, {
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          onProgress(progressEvent.loaded, progressEvent.total);
        }
      }
    });

    return response.data;
  };

  const uploadFileWithRetry = async (
    file: File,
    fileId: string,
    projectId: string,
    retryCount = 0
  ): Promise<UploadResult> => {
    try {
      const fileKey = `${projectId}/${file.name}`;
      const response = await axios.post('/api/admin/upload/init', {
        fileName: file.name,
        fileKey,
        fileType: file.type
      });
      const uploadId = response.data.uploadId;

      const chunks: Blob[] = [];
      for (let start = 0; start < file.size; start += CHUNK_SIZE) {
        chunks.push(file.slice(start, start + CHUNK_SIZE));
      }

      const parts = [];
      let uploadedBytes = 0;
      const startTime = Date.now();

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkResult = await uploadChunk(
          file,
          chunk,
          i + 1,
          uploadId,
          fileKey,
          (loaded, total) => {
            const newUploadedBytes = uploadedBytes + loaded;
            const elapsedSeconds = (Date.now() - startTime) / 1000;
            const bytesPerSecond = newUploadedBytes / elapsedSeconds;
            const remainingBytes = file.size - newUploadedBytes;
            const estimatedTimeRemaining = remainingBytes / bytesPerSecond;

            setState(prev => stateActions.updateFileProgress(
              prev,
              fileId,
              newUploadedBytes / file.size,
              {
                bytesPerSecond,
                estimatedTimeRemaining,
                lastUpdateTime: Date.now(),
                totalBytesUploaded: newUploadedBytes
              }
            ));
          }
        );

        parts.push({
          PartNumber: i + 1,
          ETag: chunkResult.ETag
        });

        uploadedBytes += chunk.size;
      }

      const result = await axios.post('/api/admin/upload/complete', {
        uploadId,
        fileKey,
        parts
      });

      return result.data;
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return uploadFileWithRetry(file, fileId, projectId, retryCount + 1);
      }
      throw error;
    }
  };

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
      if (!state.selectedProject || !state.selectedProject.videoFiles?.length) {
        throw new Error('No project data or video files available');
      }

      // Validate files
      const invalidFiles = state.selectedProject.videoFiles.map(file => 
        validateFile(
          file,
          state.uploadValidation.maxFileSize,
          state.uploadValidation.allowedTypes
        )
      ).filter(result => !result.isValid);

      if (invalidFiles.length > 0) {
        throw new Error(invalidFiles[0].error);
      }

      // Calculate total size
      const totalSize = state.selectedProject.videoFiles.reduce(
        (acc, file) => acc + file.size,
        0
      );

      if (totalSize > state.uploadValidation.maxTotalSize) {
        throw new Error(
          `Total size exceeds maximum allowed (${
            formatBytes(state.uploadValidation.maxTotalSize)
          })`
        );
      }

      // Create project document
      const formData = new FormData();
      formData.append('title', state.selectedProject.title);
      formData.append('description', state.selectedProject.description || '');
      formData.append('sourceLanguage', state.selectedProject.sourceLanguage || '');
      formData.append('targetLanguage', state.selectedProject.targetLanguage || '');

      const projectResponse = await axios.post('/api/admin/projects/create', formData);
      const projectId = projectResponse.data._id;

      // Add files to upload queue
      setState(prev => stateActions.addFilesToQueue(
        prev,
        state.selectedProject!.videoFiles!
      ));

      // Connect to WebSocket for real-time progress
      const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || '', {
        transports: ['websocket']
      });

      // Upload files
      const uploadResults = [];
      for (const file of state.selectedProject.videoFiles) {
        const fileId = crypto.randomUUID();
        
        try {
          const result = await uploadFileWithRetry(file, fileId, projectId);
          uploadResults.push(result);

          setState(prev => ({
            ...prev,
            uploadQueue: {
              ...prev.uploadQueue,
              files: prev.uploadQueue.files.map(f =>
                f.id === fileId
                  ? { ...f, status: 'completed' as const }
                  : f
              )
            }
          }));
        } catch (error) {
          setState(prev => ({
            ...prev,
            uploadQueue: {
              ...prev.uploadQueue,
              files: prev.uploadQueue.files.map(f =>
                f.id === fileId
                  ? {
                      ...f,
                      status: 'error' as const,
                      error: error instanceof Error ? error.message : 'Upload failed'
                    }
                  : f
              )
            }
          }));
          throw error;
        }
      }

      // Update project with upload results
      await axios.post(`/api/admin/projects/${projectId}/update`, {
        uploadResults
      });

      socket.disconnect();
      await refetchProjects();

      setState(prev => ({
        ...prev,
        isCreating: false,
        selectedProject: null,
        uploadQueue: {
          ...prev.uploadQueue,
          files: [],
          activeUploads: 0,
          totalProgress: 0
        },
        success: 'Project created successfully'
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to create project'
      }));
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
        isAddingEpisodes: false,
        selectedProjectForEpisodes: null,
        success: 'Episodes added successfully',
        error: ''
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add episodes';
      setState(prev => ({ ...prev, error: errorMessage, success: '' }));
      logger.error('Episode addition failed:', error);
    }
  };

  return {
    updateUploadProgress,
    handleCreateProject,
    handleDeleteProject,
    handleCreateUser,
    handleDeleteUser,
    handleAssignUsers,
    handleAddEpisodes
  };
};
import React from 'react';
import { FileUploadState, UploadQueueState } from './state/adminViewState';
import { formatBytes, formatTime } from '@/lib/utils';

interface UploadProgressProps {
  uploadQueue: UploadQueueState;
  onRetry: (fileId: string) => void;
  onRemove: (fileId: string) => void;
  onPauseResume: () => void;
  onCancelAll: () => void;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({
  uploadQueue,
  onRetry,
  onRemove,
  onPauseResume,
  onCancelAll
}) => {
  const renderFileProgress = (file: FileUploadState) => {
    const speed = formatBytes(file.speedStats.bytesPerSecond) + '/s';
    const timeRemaining = formatTime(file.speedStats.estimatedTimeRemaining);
    const progressPercent = Math.round(file.progress * 100);

    return (
      <div key={file.id} className="mb-4 p-4 bg-white rounded-lg shadow">
        <div className="flex justify-between items-center mb-2">
          <span className="font-medium truncate">{file.file.name}</span>
          <span className="text-sm text-gray-500">
            {formatBytes(file.speedStats.totalBytesUploaded)} / {formatBytes(file.file.size)}
          </span>
        </div>

        <div className="relative h-2 bg-gray-200 rounded">
          <div
            className={`absolute h-full rounded ${
              file.status === 'error' ? 'bg-red-500' :
              file.status === 'completed' ? 'bg-green-500' :
              'bg-blue-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex justify-between items-center mt-2">
          <div className="text-sm text-gray-600">
            {file.status === 'uploading' && (
              <>
                <span className="mr-3">{speed}</span>
                <span>{timeRemaining} remaining</span>
              </>
            )}
            {file.status === 'error' && (
              <span className="text-red-500">{file.error}</span>
            )}
            {file.status === 'completed' && (
              <span className="text-green-500">Completed</span>
            )}
          </div>

          <div className="flex space-x-2">
            {file.status === 'error' && (
              <button
                onClick={() => onRetry(file.id)}
                className="px-3 py-1 text-sm text-white bg-blue-500 rounded hover:bg-blue-600"
              >
                Retry
              </button>
            )}
            {file.status !== 'completed' && (
              <button
                onClick={() => onRemove(file.id)}
                className="px-3 py-1 text-sm text-white bg-red-500 rounded hover:bg-red-600"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {uploadQueue.files.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Upload Progress</h3>
            <div className="flex space-x-3">
              <button
                onClick={onPauseResume}
                className={`px-4 py-2 text-sm text-white rounded ${
                  uploadQueue.isPaused
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-yellow-500 hover:bg-yellow-600'
                }`}
              >
                {uploadQueue.isPaused ? 'Resume All' : 'Pause All'}
              </button>
              <button
                onClick={onCancelAll}
                className="px-4 py-2 text-sm text-white bg-red-500 rounded hover:bg-red-600"
              >
                Cancel All
              </button>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium">Overall Progress</span>
              <span className="text-sm text-gray-500">
                {Math.round(uploadQueue.totalProgress * 100)}%
              </span>
            </div>
            <div className="relative h-2 bg-gray-200 rounded">
              <div
                className="absolute h-full bg-blue-500 rounded"
                style={{ width: `${uploadQueue.totalProgress * 100}%` }}
              />
            </div>
            <div className="flex justify-between items-center mt-2 text-sm text-gray-600">
              <span>
                Speed: {formatBytes(uploadQueue.overallSpeedStats.bytesPerSecond)}/s
              </span>
              <span>
                Time remaining: {formatTime(uploadQueue.overallSpeedStats.estimatedTimeRemaining)}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {uploadQueue.files.map(renderFileProgress)}
          </div>
        </div>
      )}
    </div>
  );
}; 
export interface Dialogue {
  _id: string;
  index: number;
  timeStart: string;
  timeEnd: string;
  character: string;
  videoUrl: string;
  dialogue: {
    original: string;
    translated: string;
    adapted: string;
  };
  emotions?: {
    primary: {
      emotion: string;
      intensity: number;
    };
    secondary?: {
      emotion: string;
      intensity: number;
    };
  };
  direction?: string;
  lipMovements?: string;
  sceneContext?: string;
  technicalNotes?: string;
  culturalNotes?: string;
  status: string;
  voiceOverUrl?: string;
  voiceOverNotes?: string;
  directorNotes?: string;
  recordingStatus?: string;
  projectId?: string;
  updatedAt?: string;
  updatedBy?: string;
} 
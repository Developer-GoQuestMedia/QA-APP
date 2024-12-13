export interface Dialogue {
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
  emotions: {
    primary: {
      emotion: string
      intensity: number
    }
    secondary: {
      emotion: string
      intensity: number
    }
  }
  direction: string
  lipMovements: number
  sceneContext: string
  technicalNotes: string
  culturalNotes: string
  status: string
  recordingStatus: string
  projectId: string
  updatedAt: string
  updatedBy: string
  voiceOverUrl: string | null
}

export interface DialogueViewProps {
  dialogues: Dialogue[]
  projectId: string
} 
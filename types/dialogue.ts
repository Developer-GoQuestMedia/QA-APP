export interface CharacterProfile {
  age?: string;
  occupation?: string;
  accents?: string[];
  otherNotes?: string;
}

export interface WordDetail {
  characterName: string;
  wordSequenceNumber: number;
  word: string;
  wordTimestamp: string;
  dialogNumber: number;
  dialogStartTimestamp: string;
  dialogEndTimestamp: string;
  dialogVocalFile?: string;
  characterProfile?: CharacterProfile;
  numberOfLipMovementsForThisWord?: number;
}

export interface DialogueText {
  original: string;
  translated: string;
  adapted: string;
}

export interface Emotions {
  primary: {
    emotion?: string;
    intensity?: number;
  };
  secondary?: {
    emotion?: string;
    intensity?: number;
  };
}

export interface Scenario {
  name?: string;
  description?: string;
  location?: string;
  timeOfDay?: string;
  otherScenarioNotes?: string;
}

export interface Dialogue {
  _id: string;
  index: number;
  timeStart: string;
  timeEnd: string;
  character: string;
  videoUrl: string;
  dialogue: DialogueText;
  emotions?: Emotions;
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
  words?: WordDetail[];
  scenario?: Scenario;
  deleteVoiceOver?: boolean;
}

export interface DialogueViewProps {
  dialogues: Dialogue[];
  projectId: string;
  episode?: {
    _id: string;
    name: string;
    status: string;
  };
  project?: {
    _id: string | ObjectId;
    title: string;
    sourceLanguage: string;
    targetLanguage: string;
    status: string;
  };
} 
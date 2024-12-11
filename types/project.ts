export interface Project {
  _id: string;
  title: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: string;
  assignedTo: Array<{
    username: string;
    role: string;
  }>;
} 
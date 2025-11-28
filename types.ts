
export interface SignageItem {
  sheet: string;
  roomNumber: string;
  roomName: string;
  signType: string;
  isADA: boolean;
  quantity: number;
  dimensions: string;
  color: string;
  material: string;
  notes: string;
  boundingBox?: number[]; // [ymin, xmin, ymax, xmax] normalized 0-1000 (Location on Plan)
  designImage?: string; // base64 data url of the sign type specification/detail
  dataSource?: 'Schedule' | 'Visual' | 'Rule'; // Origin of the item
}

export interface SignTypeDefinition {
  typeCode: string;
  category: string;
  description: string;
  dimensions?: string;
  mounting?: string;
  color?: string;
  material?: string;
  boundingBox?: number[]; // [ymin, xmin, ymax, xmax] normalized 0-1000 (Location of Detail Drawing)
  imageIndex?: number; // Index of the image containing this definition (0-based)
  designImage?: string; // base64 data url of the cropped detail
}

export interface AnalysisResult {
  takeoff: SignageItem[];
  catalog: SignTypeDefinition[];
}

export interface ProjectSettings {
  // Settings are now simplified as the Agent handles strategy automatically
  autoStrategy: boolean; 
}

export enum AppState {
  IDLE,
  UPLOADING,
  ANALYZING,
  COMPLETE,
  ERROR
}

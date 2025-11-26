export interface SignageItem {
  sheet: string;
  roomNumber: string;
  roomName: string;
  signType: string;
  isADA: boolean;
  quantity: number;
  notes: string;
}

export interface SignTypeDefinition {
  typeCode: string;
  category: string;
  description: string;
  dimensions?: string;
  mounting?: string;
}

export interface AnalysisResult {
  takeoff: SignageItem[];
  catalog: SignTypeDefinition[];
}

export interface ProjectSettings {
  ruleA_OneSignPerRoom: boolean;
  ruleB_CombinedADASigns: boolean;
  ruleC_IdentifyExits: boolean;
  ruleD_ExteriorDoorNumbers: boolean;
  ruleE_IncludeDirectionals: boolean;
  ruleF_StairSignage: boolean;
  ruleG_SlidingBarSigns: boolean;
  extractionMode: 'Page-by-Page' | 'Block-Based' | 'Clockwise-Sweep' | 'Quadrant-Sweep';
}

export enum AppState {
  IDLE,
  UPLOADING,
  ANALYZING,
  COMPLETE,
  ERROR
}

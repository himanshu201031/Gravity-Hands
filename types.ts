// Global types for libraries loaded via CDN

export interface MatterType {
  Engine: any;
  Render: any;
  Runner: any;
  World: any;
  Bodies: any;
  Body: any;
  Composite: any;
  Events: any;
  Mouse: any;
  MouseConstraint: any;
  Constraint: any;
  Query: any;
  Vector: any;
  Detector: any;
  Sleeping: any;
}

export interface MediaPipeType {
  FilesetResolver: {
    forVisionTasks: (url: string) => Promise<any>;
  };
  HandLandmarker: {
    createFromOptions: (filesetResolver: any, options: any) => Promise<any>;
    HAND_CONNECTIONS: any[];
  };
  DrawingUtils: any;
}

declare global {
  interface Window {
    Matter: MatterType;
    // MediaPipe globals are usually attached to window when using the bundle, 
    // but sometimes scoped. We will access them carefully.
    mediapipeTasksVision: any;
  }
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandResult {
  landmarks: HandLandmark[][];
  worldLandmarks: HandLandmark[][];
  handedness: any[];
}
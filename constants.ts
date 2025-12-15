
export const COLORS = {
  background: '#0a0a0a', // Slightly lighter than pure black for depth
  text: '#ffffff',
  accent: '#ccff00', // Acid Green
  accentDim: 'rgba(204, 255, 0, 0.15)',
  secondary: '#00f0ff', // Cyan for secondary elements
  block: '#111111',
  blockBorder: '#ccff00',
  handJoint: '#ffffff',
  handBone: 'rgba(255, 255, 255, 0.15)',
  glass: 'rgba(10, 10, 10, 0.6)', // For UI backgrounds
  glassBorder: 'rgba(255, 255, 255, 0.1)',
};

export const CUBE_PALETTE = [
  '#FF3B30', // Vibrant Red
  '#4CD964', // Vibrant Green
  '#007AFF', // Vibrant Blue
  '#FF9500', // Vibrant Orange
  '#5856D6', // Vibrant Purple
  '#FF2D55', // Vibrant Pink
  '#5AC8FA', // Vibrant Cyan
  '#EFEFF4', // White-ish
];

export const PHYSICS = {
  gravity: 1.2, // Slightly heavier feel
  friction: 0.5,
  restitution: 0.3, // Little more bounce
  density: 0.002,
};

export const HAND = {
  pinchThreshold: 0.06, 
  smoothing: 0.5, 
};

export const TRAIL = {
  length: 20, 
  minSpeed: 4, 
  width: 8, 
  decay: 0.9, 
};

export const CAMERA = {
  width: 1280,
  height: 720,
};

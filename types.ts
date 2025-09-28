// The raw shape of data from the user's JSON file
export interface Hotspot {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  order?: number;
}

export interface Input {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  expected: string;
}

export interface Frame {
  image: string;
  hotspots: Hotspot[];
  inputs: Input[];
}


// The processed, structured data used by the application
export enum BoxType {
  HOTSPOT = 'HOTSPOT',
  INPUT = 'INPUT',
}

interface Box {
  id: string; // Unique ID for each box
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  type: BoxType;
}

export interface HotspotBox extends Box {
  type: BoxType.HOTSPOT;
  order?: number;
}

export interface InputBox extends Box {
  type: BoxType.INPUT;
  expected: string;
}

export type FrameBox = HotspotBox | InputBox;

export interface FrameData {
  id: string; // Unique ID for each frame
  imageFileName: string;
  imageDataUrl: string;
  boxes: FrameBox[];
  originalWidth: number;
  originalHeight: number;
}

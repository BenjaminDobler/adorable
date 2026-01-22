export interface FileSystemNode {
  file?: {
    contents: string;
  };
  directory?: {
    [name: string]: FileSystemNode;
  };
}

export interface WebContainerFiles {
  [name: string]: FileSystemNode;
}

export interface GenerateResponse {
  files: WebContainerFiles;
  explanation: string;
}

export interface GenerateRequest {
  prompt: string;
  previousFiles?: WebContainerFiles;
  openFiles?: { [path: string]: string };
}

// Figma Integration Types
export interface FigmaFile {
  key: string;
  name: string;
  thumbnail_url?: string;
  last_modified: string;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: 'FRAME' | 'COMPONENT' | 'COMPONENT_SET' | 'PAGE' | 'GROUP' | 'SECTION' | 'INSTANCE' | string;
  children?: FigmaNode[];
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface FigmaPage {
  id: string;
  name: string;
  children: FigmaNode[];
}

export interface FigmaSelection {
  nodeId: string;
  nodeName: string;
  nodeType: string;
}

export interface FigmaImportPayload {
  fileKey: string;
  fileName: string;
  selection: FigmaSelection[];
  jsonStructure: any;
  imageDataUris: string[];
}

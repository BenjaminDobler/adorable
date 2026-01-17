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

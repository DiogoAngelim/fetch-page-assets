export type ExtractAssetsOptions = {
  basePath?: string;
  source?: string;
  protocol?: string;
  maxRetryAttempts?: number;
  retryDelay?: number;
  verbose?: boolean;
  saveFile?: boolean;
};

export type AssetTask = {
  parsedUrl: string;
  absoluteAssetUrl: string;
  destinationPath: string;
  fileNameGuess?: string;
  fileName?: string;
  responseData?: Buffer;
  destinationFilePath?: string;
};

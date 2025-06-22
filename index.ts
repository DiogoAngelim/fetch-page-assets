import axios, { AxiosResponse, AxiosProgressEvent } from 'axios';
import fs from 'fs';
import path from 'path';
import beautify from 'beautify';
import { decode } from 'html-entities';
import mime from 'mime';

interface Options {
  basePath?: string,
  source?: string,
  saveFile?: boolean,
  protocol?: string,
  verbose?: boolean,
  parseCss?: boolean,
  retryDelay?: number,
  maxRetryAttempts?: number,
}

interface FileOptions {
  parsedUrl: string,
  destinationPath?: string,
  fileName?: string,
  responseData?: string,
  fileNameGuess?: string,
  absoluteAssetUrl?: string,
  destinationFilePath?: string,

}

type CallbackFunction = (data: string, fileName: string) => Promise<any>;

const extractAssets = async (userInput: string, options: Options = {
  saveFile: true,
  verbose: true,
}): Promise<string> => {
  let {
    basePath,
    source,
    protocol,
    maxRetryAttempts,
    retryDelay,
    verbose,
    saveFile,
  } = options;

  source = source || '';
  protocol = protocol || 'https';
  retryDelay = retryDelay || 1000;
  basePath = basePath || process.cwd();
  maxRetryAttempts = maxRetryAttempts || 3;

  let htmlString = '';

  const logError = (message: string): void => {
    if (verbose) {
      console.error(`[Error] ${message}`);
    }
  }

  const logSuccess = (message: string): void => {
    if (verbose) {
      console.log(`[Success] ${message}`);
    }
  }

  const isDynamicProtocol = (url: string) => {
    return url.startsWith('//');
  }

  const prependHttpProtocol = (url: string): string => {
    return isDynamicProtocol(url) ? `${protocol}:${url}` : url;
  }

  const inputEndsWithSlash = () => {
    return userInput.endsWith('/');
  }

  const appendForwardSlash = (): string => {
    return inputEndsWithSlash() ? userInput : `${userInput}/`;
  }

  const isProtocolInvalid = (protocol: string): boolean => {
    return !['http:', 'https:'].includes(protocol);
  }

  const checkProtocol = (protocol: string): void => {
    if (isProtocolInvalid(protocol)) {
      throw new Error('Invalid protocol in baseUrl. Only http and https protocols are supported.');
    }
  }

  const checkHostName = (hostname: string) => {
    if (!hostname) {
      throw new Error('Invalid baseUrl. Please provide a valid URL with a hostname.');
    }
  }

  const checkUrl = (url: string): boolean => {
    const { protocol, hostname, href } = new URL(removeQueryParams(url));

    checkProtocol(protocol);
    checkHostName(hostname);

    return !!href;
  }

  const isUrlValid = (url: string): boolean => {
    try {
      return checkUrl(url);
    } catch (error) {
      logError(error);
      return false;
    }
  }

  const willFormDuplicateSlashes = (url: string): boolean => {
    return inputEndsWithSlash() && url.startsWith('/');
  }

  const isRelativeUrl = (url: string): boolean => {
    return !url.startsWith('http') && !isDynamicProtocol(url);
  }

  const processPath = (url: string): { urlLength: number, parts: string[] } => {
    return { urlLength: url.split('../').length, parts: userInput.split('/') };
  }

  const setParts = (parts: string[], urlLength: number): string => {
    let i = 0;

    while (i <= urlLength && parts.length) {
      parts.pop();
      i++;
    }

    parts.shift();

    return parts.join('/');
  }

  const formPathWithDots = (url: string): string => {
    const { urlLength, parts } = processPath(url);

    return `${protocol}://${setParts(parts, urlLength)}/${url[urlLength - 1]}`;
  }

  const joinPath = (paths: string[]): string => {
    return path.join(...paths);
  }

  const removeForwardSlash = (): void => {
    userInput.slice(0, -1);
  }

  const handleDuplicateSlashes = (url: string): void => {
    if (willFormDuplicateSlashes(url)) {
      removeForwardSlash();
    }
  }

  const parseUserInput = (url: string): string => {
    handleDuplicateSlashes(url);

    return url.includes('../') ? formPathWithDots(url) : joinPath([userInput.replace(path.basename(userInput), ''), url]);
  }

  const formAssetAbsoluteUrl = (url: string): string => {
    return isRelativeUrl(url) ? parseUserInput(url) : prependHttpProtocol(url);
  }

  const handleCssFileInput = (): void => {
    userInput = path.extname(userInput).startsWith('.css') ? userInput.replace(path.basename(userInput), '') : userInput;
  }

  const isUrl = (string: string): boolean => {
    try {
      return !!new URL(prependHttpProtocol(string));
    } catch {
      return false;
    }
  }

  const handleRelativeUrl = (parsedUrl: string): string => {
    handleDuplicateSlashes(parsedUrl);
    handleCssFileInput();

    return joinPath([userInput, parsedUrl]);
  }

  const getAssetRemotePath = (parsedUrl: string): string => {
    if (isUrl(parsedUrl)) {
      return new URL(parsedUrl).pathname;
    } else if (isRelativeUrl(parsedUrl)) {
      return handleRelativeUrl(parsedUrl);
    } else {
      return parsedUrl;
    }
  }

  const formDestinationPath = (parsedUrl: string): string => {
    return joinPath([basePath, getAssetRemotePath(prependHttpProtocol(parsedUrl))]).replace(/\/[^\/]*$/, '');
  }

  const directoryCreationCallback = (error: { message: string }, destinationPath: string): void => {
    if (error) {
      logError(`Error creating directory ${destinationPath}: ${error.message}`);
    } else {
      logSuccess(`Directory created: ${destinationPath}`);
    }
  }

  const createDirectory = (destinationPath: string): void => {
    fs.mkdir(destinationPath, { recursive: true }, (error: any): void => {
      directoryCreationCallback(error, destinationPath);
    });
  }

  const mkdirRecursive = (destinationPath: string): void => {
    createDirectory(destinationPath);
  }

  const parseFileNameFromUrl = async (absoluteUrl: string, callback: CallableFunction): Promise<void> => {
    const urlObject = new URL(absoluteUrl);
    const fileName = urlObject?.href ? urlObject.href.match(/([%2F|\/](?:.(?!%2F|\/))+$)/g) : null;
    const fileName2 = fileName?.length ? fileName[0].replace(/\/|%2F/, '') : null;
    const fileName3 = fileName2 ? fileName2.match(/^(.*?)(\.[^.]*)?$/) : null;
    const m2 = fileName2 ? fileName2.match(/([\/.\w]+)([.][\w]+)([?][\w.\/=]+)?/) : null;

    await callback(fileName2 && fileName3 && fileName3.length && m2 ? fileName3[1] + m2[2] : urlObject.pathname);
  }

  const saveHtmlFile = (fileOptions: FileOptions): void => {
    if (saveFile) {
      replaceHtmlWithRelativeUrls(fileOptions);
      fs.writeFileSync(joinPath([basePath, 'index.html']), beautify(htmlString, { format: 'html' }), 'utf8');
    }
  }

  const removeQueryParams = (url: string): string => {
    return url.split('?')[0].split('#')[0];
  }

  const formDestinationFilePath = (destinationPath: string, fileName: string): string => {
    return removeQueryParams(joinPath([destinationPath, fileName]));
  }

  function replaceHtmlWithRelativeUrls(fileOptions: FileOptions): void {
    const { parsedUrl, destinationFilePath } = fileOptions;
    const { origin } = new URL(parsedUrl);


    htmlString = htmlString.replace(origin, '').replace(parsedUrl.replace(origin, ''), destinationFilePath.replace(`${basePath.replace('../', '').replace('./', '')}/`, ''));
  }

  const splitDots = (fileName: string): string[] => {
    return fileName.split('.');
  }

  const hasExtension = (fileName: string): boolean => {
    return splitDots(fileName).length > 1;
  }

  const getExtension = (mimeType: string, fileName: string): string => {
    const components = splitDots(fileName);

    return mime.getExtension(mimeType) || components[components.length - 1];
  }

  const getHeader = (headers: string[], name: string): string => {
    return headers[name] || headers[name.toLowerCase()];
  }

  const getFileNameFromHeaders = (headers: string[]): any => {
    return (getHeader(headers, 'Content-Disposition'))?.match(/filename="(.*)"/);
  }

  const getMimeTypeFromHeaders = (headers: string[]): string => {
    return getHeader(headers, 'Content-Type');
  }

  const formFileName = (headers: any, fileNameGuess: string): string => {
    let fileName = getFileNameFromHeaders(headers);
    fileName = fileName ? fileName[1] : fileNameGuess;
    fileName = fileName?.split('?')[0];

    const mimeType = getMimeTypeFromHeaders(headers);

    return !hasExtension(fileName) && mimeType ? `${fileName}.${getExtension(mimeType, fileName)}` : fileName;
  }

  const onDownloadProgress = (progressEvent: AxiosProgressEvent): void => {
    const { loaded, total }: AxiosProgressEvent = progressEvent;
    const progress = loaded && total ? Math.round((loaded / total) * 100) : 0;

    if (!isNaN(progress)) {
      console.log(`Download progress: ${progress}%`);
    }
  }

  const getData = async (url: string, fileNameGuess: string, callback: CallbackFunction): Promise<string> => {
    const { headers, data }: AxiosResponse<any> = await axios.get<string>(decode(url), { responseType: 'arraybuffer', onDownloadProgress });

    await callback(data, formFileName(headers, fileNameGuess));

    return data;
  }

  const retry = async (url: string, retryAttempts: number): Promise<void> => {
    console.log(`Retrying asset download for ${url} (Attempt ${retryAttempts + 1}/${maxRetryAttempts})...`);

    await new Promise((resolve) => {
      setTimeout(resolve, retryDelay);
    });
  }

  const retrialError = (code: string, retryAttempts: number) => {
    return ['ERR_BAD_REQUEST', 'ENOTFOUND'].includes(code) && retryAttempts >= maxRetryAttempts - 1;
  }

  const downloadAssetWithRetry = async (url: string, fileNameGuess: string, callback: CallableFunction): Promise<void> => {
    let retryAttempts = 0;

    while (retryAttempts < maxRetryAttempts) {
      try {
        await getData(url, fileNameGuess, async (data, fileName) => data ? await callback(data, fileName) : null);

        break;
      } catch (error) {
        const { message, code } = error;

        logError(`Error downloading asset from ${url}: ${message}`);

        if (retrialError(code, retryAttempts)) {
          break;
        } else {
          await retry(url, retryAttempts);
          retryAttempts++;
        }
      }
    }
  }

  const checkForFileSaveSuccess = (destinationFilePath: string): void => {
    if (fs.existsSync(destinationFilePath)) {
      logSuccess(`Asset saved successfully to ${destinationFilePath}`);
    } else {
      logError(`Failed to save asset (${destinationFilePath}).`);
    }
  }

  const saveAsset = (fileOptions: FileOptions): void => {
    const { responseData, destinationFilePath } = fileOptions;

    try {
      fs.writeFileSync(destinationFilePath, responseData, 'utf8');

      checkForFileSaveSuccess(destinationFilePath);
    } catch (error) {
      logError(`Error saving asset to ${destinationFilePath}: ${error.message}`);
    }
  }

  const isNetworkError = (error: { code: string }): boolean => {
    return ['ECONNRESET', 'ETIMEDOUT'].includes(error.code);
  }

  const isAccessError = (error: { code: string }): boolean => {
    return ['EACCES', 'EISDIR'].includes(error.code);
  }

  const isCssFile = (fileName: string): boolean => {
    return fileName.endsWith('.css');
  }

  const processCssFile = async (fileOptions: FileOptions): Promise<void> => {
    const { absoluteAssetUrl, fileName } = fileOptions;

    if (isCssFile(fileName)) {
      await extractAssets(absoluteAssetUrl, { basePath, saveFile: false });
    }
  }

  const downloadAssetWithRetryCallback = async (fileOptions: FileOptions) => {
    saveHtmlFile(fileOptions);
    saveAsset(fileOptions);
    await processCssFile(fileOptions);
  }

  const parseFileNameFromUrlCallback = async (fileOptions: FileOptions): Promise<void> => {
    const { absoluteAssetUrl, fileNameGuess, destinationPath } = fileOptions;

    await downloadAssetWithRetry(absoluteAssetUrl, fileNameGuess,
      async (responseData: string, fileName: string) => {
        await downloadAssetWithRetryCallback({ ...fileOptions, fileName, responseData, destinationFilePath: formDestinationFilePath(destinationPath, fileName) });
      }
    );
  }

  const parseMatchError = (error: any, absoluteAssetUrl: string): void => {
    const { message } = error;

    if (isNetworkError(error)) {
      logError(`Network error occurred while downloading asset from ${absoluteAssetUrl}: ${message}.`);
    } else if (isAccessError(error)) {
      logError(`Error saving asset. Permission denied or target path is a directory.`);
    } else {
      logError(`Error downloading asset from ${absoluteAssetUrl}: ${message}.`);
    }
  }

  const processMatch = async (fileOptions: FileOptions) => {
    const { absoluteAssetUrl, destinationPath } = fileOptions;

    mkdirRecursive(destinationPath);
    await parseFileNameFromUrl(absoluteAssetUrl, async (fileNameGuess: string) => {
      await parseFileNameFromUrlCallback({ ...fileOptions, fileNameGuess });
    });
  }

  const processParsedUrl = async (parsedUrl: string): Promise<void> => {
    const absoluteAssetUrl = formAssetAbsoluteUrl(parsedUrl);

    try {
      await processMatch({
        parsedUrl,
        absoluteAssetUrl,
        destinationPath: formDestinationPath(parsedUrl)
      });
    } catch (error) {
      parseMatchError(error, absoluteAssetUrl);
    }
  }

  const processMatches = async (matches: string[]): Promise<void> => {
    for (const parsedUrl of matches) {
      await processParsedUrl(parsedUrl);
    };
  }

  const performHtmlReplacements = (): string => {
    return htmlString.replace(/srcset="(.*?)"/gi, '').replace(/sizes="(.*?)"/gi, '').replace(new RegExp(userInput, 'g'), '');
  }

  const parseUrls = (): any => {
    return [...[...htmlString.matchAll(/((<link(.*?)(rel="stylesheet"|rel='stylesheet'))(.*?)(href="|href=\')|((img|script|source)(.*?)(src="|src=\')))(.*?\..*?)("|\')/gi)].map(match => match ? match[11] : ''), ...[...htmlString.matchAll(/url\((.*?)\)/gi)].map(match => match ? match[1].replace(/\'|"/g, '') : '')].filter(url => !url.startsWith('data:'));
  }

  const isValidInput = (): boolean => {
    return typeof userInput !== 'string' || typeof basePath !== 'string';
  }

  const processUrl = async () => {
    const { data } = await axios.get(appendForwardSlash());
    htmlString = data;
    console.log('Fetching content...');
  }

  const fetchData = async (): Promise<void> => {
    try {
      await processUrl();
    } catch (error) {
      logError(`Error fetching content from url: ${error.message}`);
    }
  }

  const shouldFetchData = (): boolean => {
    return isUrl(userInput) && isUrlValid(userInput);
  }

  const modifyUserVars = () => {
    htmlString = userInput;
    userInput = source;
  }

  const processUserInput = async () => {
    if (isValidInput()) {
      logError('Invalid user input: source and basePath must be strings.');
    } else if (shouldFetchData()) {
      await fetchData();
    } else {
      modifyUserVars();
    }
  }

  const processHtmlString = async (): Promise<void> => {
    await processUserInput();
    performHtmlReplacements();
    await processMatches(parseUrls());
  }

  await processHtmlString();

  return htmlString;
}

export default extractAssets;
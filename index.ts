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
  maxRetryAttempts?: number,
  retryDelay?: number
}

export default async function extractAssets(userInput: string, options: Options = {
  basePath: process.cwd(),
  source: '',
  saveFile: true,
  protocol: 'https',
  verbose: true,
  parseCss: true,
  maxRetryAttempts: 3,
  retryDelay: 1000,
}): Promise<string> {
  function prependHttpProtocol(url: string): string {
    if (url.startsWith('//')) {
      return `${options.protocol}:${url}`;
    }

    return url;
  }

  function appendForwardSlash(userInput: string): string {
    if (!userInput.endsWith('/')) {
      return `${userInput}/`;
    }

    return userInput;
  }

  function isUrlValid(url: string): boolean {
    try {
      const baseUrlWithoutQueryOrFragment = url.split('?')[0].split('#')[0];

      const newUrl = new URL(baseUrlWithoutQueryOrFragment);

      if (newUrl.protocol !== 'http:' && newUrl.protocol !== 'https:') {
        logError(
          'Invalid protocol in baseUrl. Only http and https protocols are supported.'
        );
      }

      if (!newUrl.hostname) {
        logError(
          'Invalid baseUrl. Please provide a valid URL with a hostname.'
        );
      }

      return !!newUrl.href;
    } catch (error) {
      logError(
        'Invalid type of url. Please provide a url with a valid format.'
      );

      return false;
    }
  }

  function isValidHtmlString(htmlString: string): boolean {
    return !!(htmlString && htmlString.trim() !== '');
  }

  function isUrl(string: string): boolean {
    const newString = prependHttpProtocol(string);

    try {
      return !!new URL(newString);
    } catch {
      return false;
    }
  }

  function willFormDuplicateSlashes(userInput: string, url: string): boolean {
    return userInput?.endsWith('/') && url?.startsWith('/');
  }

  function isRelativeUrl(url: string): boolean {
    return !url.startsWith('http') && !url.startsWith('//');
  }

  function formPathWithDots(userInput: string, url: string): string {
    const newUrl = url.split('../');
    const length = newUrl.length;
    const parts = userInput.split('/');

    let i = 0;

    while (i <= length && parts.length) {
      parts.pop();
      i++;
    }

    parts.shift();
    
    return `${options.protocol}://${parts.join('/')}/${url[length - 1]}`;
  }

  function formAssetAbsoluteUrl(url: string, userInput: string): string {
    let newUserInput = userInput;

    if (isRelativeUrl(url)) {
      if (willFormDuplicateSlashes(userInput, url)) {
        newUserInput = userInput.slice(0, -1);
      }

      const fileName = path.basename(newUserInput);

      if (url.includes('../')) {
        newUserInput = newUserInput.replace(fileName, '');

        return formPathWithDots(userInput, url);
      }

      return path.join(newUserInput, url);
    }

    return prependHttpProtocol(url);
  }

  function handleDuplicateSlashes(parsedUrl: string): void {
    if (willFormDuplicateSlashes(userInput, parsedUrl)) {
      userInput = userInput.slice(0, -1);
    }
  }

  function handleCssFileInput(): void {
    if (path.extname(userInput).startsWith('.css')) {
      const fileName = path.basename(userInput);

      userInput = userInput.replace(fileName, '');
    }
  }

  function getAssetRemotePath(parsedUrl: string): string {
    if (isUrl(parsedUrl)) {
      return new URL(parsedUrl).pathname;
    } else if (isRelativeUrl(parsedUrl)) {
      handleDuplicateSlashes(parsedUrl);
      handleCssFileInput();

      return path.join(userInput, parsedUrl);
    }

    return parsedUrl;
  }

  function formDestinationPath(parsedUrl: string): string {
    const newParsedUrl = prependHttpProtocol(parsedUrl);
    const assetRemotePath = getAssetRemotePath(newParsedUrl);
    const destinationPath = path.join(options.basePath, assetRemotePath);

    return destinationPath.replace(/\/[^\/]*$/, '');
  }

  function directoryCreationCallback(error: { message: string }, destinationPath: string):void {
    if (error) {
      logError(`Error creating directory ${destinationPath}: ${error.message}`);
    } else {
      logSuccess(`Directory created: ${destinationPath}`);
    }
  }

  async function mkdirRecursive(destinationPath: string): Promise<void> {
    fs.mkdir(destinationPath, { recursive: true }, async (error: any) => {
      directoryCreationCallback(error, destinationPath);
    });
  }

  async function parseFileNameFromUrl(absoluteUrl: string, callback: CallableFunction): Promise<void> {
    const urlObject = new URL(absoluteUrl);
    const fileName =
      urlObject?.href
        ? urlObject.href.match(/([%2F|\/](?:.(?!%2F|\/))+$)/g)
        : null;
    const fileName2 =
      fileName?.length ? fileName[0].replace(/\/|%2F/, '') : null;
    const fileName3 = fileName2 ? fileName2.match(/^(.*?)(\.[^.]*)?$/) : null;
    const m2 = fileName2? fileName2.match(/([\/.\w]+)([.][\w]+)([?][\w.\/=]+)?/) : null;
    const fileName4 =
      fileName2 &&
      fileName3 &&
      fileName3.length &&
      m2
        ? fileName3[1] +
          m2[2]
        : urlObject.pathname;

    await callback(fileName4);
  }

  function saveHtmlFile(htmlString: string) {
    fs.writeFileSync(
      path.join(options.basePath, 'index.html'),
      beautify(htmlString, { format: 'html' }),
      'utf8'
    );
  }

  function formDestinationFilePath(destinationPath: string, fileName: string): string {
    const destinationFilePath = path.join(destinationPath, fileName);

    return destinationFilePath.split('?')[0].split('#')[0];
  }

  function replaceHtmlWithRelativeUrls(
    htmlString: string,
    parsedUrl: string,
    destinationPath: string,
    fileName: string
  ): string {
    const destinationFilePath = formDestinationFilePath(
      destinationPath,
      fileName
    );
    const { origin } = new URL(parsedUrl);
    const localUrl = parsedUrl.replace(origin, '');
    const relativePath = destinationFilePath.replace(
      `${options.basePath}/`,
      ''
    );

    htmlString = htmlString.replace(origin, '');

    return htmlString.replace(localUrl, relativePath);
  }

  async function downloadAssetWithRetry(url: string, fileNameGuess: string, callback: CallableFunction): Promise<void> {
    const { retryDelay, maxRetryAttempts } = options;
    let retryAttempts = 0;

    while (retryAttempts < maxRetryAttempts) {
      try {
        await getData(url, fileNameGuess, async (data, fileName) => {
          if (data) {
            await callback(data, fileName);

            return;
          }
        });

        break;
      } catch (error) {
        logError(`Error downloading asset from ${url}: ${error.message}`);

        if (error.code === 'ERR_BAD_REQUEST') {
          break;
        }

        if (retryAttempts < maxRetryAttempts - 1) {
          logProgress(
            `Retrying asset download for ${url} (Attempt ${
              retryAttempts + 1
            }/${maxRetryAttempts})...`
          );

          await new Promise((resolve) => {
            setTimeout(resolve, retryDelay);
          });

          retryAttempts++;
        } else {
          break;
        }
      }
    }
  }

  function saveAsset(destinationFilePath: string, data: string): void {
    try {
      fs.writeFileSync(destinationFilePath, data, 'utf8');

      if (fs.existsSync(destinationFilePath)) {
        logSuccess(`Asset saved successfully to ${destinationFilePath}`);
      } else {
        logError(`Failed to save asset (${destinationFilePath}).`);
      }
    } catch (error) {
      logError(
        `Error saving asset to ${destinationFilePath}: ${error.message}`
      );
    }
  }

  function isNetworkError(error: { code: string }): boolean {
    return ['ECONNRESET', 'ETIMEDOUT'].includes(error.code);
  }

  function isAccessError(error: { code: string }): boolean {
    return ['EACCES', 'EISDIR'].includes(error.code);
  }

  async function processCssFile(fileName: string, absoluteAssetUrl: string): Promise<void> {
    if (fileName.endsWith('.css')) {
      await extractAssets(absoluteAssetUrl, {
        ...options,
        basePath: options.basePath,
        saveFile: false,
      });
    }
  }

  async function processMatches(matches: string[]): Promise<any> {
    for (const parsedUrl of matches) {
      const absoluteAssetUrl = formAssetAbsoluteUrl(parsedUrl, userInput);
      const destinationPath = formDestinationPath(absoluteAssetUrl);

      try {
        await mkdirRecursive(destinationPath);
        await parseFileNameFromUrl(
          absoluteAssetUrl,
          async (fileNameGuess: string) => {
            await downloadAssetWithRetry(
              absoluteAssetUrl,
              fileNameGuess,
              async (responseData: string, fileName: string) => {
                const destinationFilePath = formDestinationFilePath(
                  destinationPath,
                  fileName
                );

                htmlString = replaceHtmlWithRelativeUrls(
                  htmlString,
                  absoluteAssetUrl,
                  destinationPath,
                  fileName
                );

                if (options.saveFile) {
                  saveHtmlFile(htmlString);
                }

                saveAsset(destinationFilePath, responseData);
                await processCssFile(fileName, absoluteAssetUrl);

              }
            );
          }
        );
        
      } catch (error) {
        if (isNetworkError(error)) {
          logError(
            `Network error occurred while downloading asset from ${absoluteAssetUrl}: ${error.message}.`
          );
        } else if (isAccessError(error)) {
          logError(
            `Error saving asset. Permission denied or target path is a directory.`
          );
        } else {
          logError(
            `Error downloading asset from ${absoluteAssetUrl}: ${error.message}.`
          );
        }
      }
    };

    return htmlString;
  }

  function performHtmlReplacements(htmlString: string, userInput: string): string {
    htmlString = htmlString.replace(/srcset="(.*?)"/gi, '');
    htmlString = htmlString.replace(/sizes="(.*?)"/gi, '');

    const regex = new RegExp(userInput, 'g');

    return htmlString.replace(regex, '');
  }

  function parseUrls(htmlString: string): any {
    let expression =
      /((<link(.*?)(rel="stylesheet"|rel='stylesheet'))(.*?)(href="|href=\')|((img|script|source)(.*?)(src="|src=\')))(.*?\..*?)("|\')/;
    let regex = new RegExp(expression, 'g');
    const htmlMatches = [...htmlString.matchAll(regex)].map((match) => {
      return match ? match[11] : '';
    });

    expression = /url\((.*?)\)/;
    regex = new RegExp(expression, 'g');

    const cssMatches = [...htmlString.matchAll(regex)];
    const cssMatchesArray = cssMatches.map((match) => {
      return match ? match[1].replace(/\'|"/g, '') : '';
    });

    return [...htmlMatches, ...cssMatchesArray].filter((url) => {
      return !url.startsWith('data:');
    });
  }

  function formFileName(headers: any, fileNameGuess: string): string {
    let fileName =
      headers['content-disposition'] || headers['Content-Disposition'];
    const match = fileName ? fileName.match(/filename="(.*)"/) : null;
    fileName = match ? match[1] : fileNameGuess;

    fileName = fileName?.split('?')[0];

    const mimeType = headers['content-type'] || headers['Content-Type'];

    if (!hasExtension(fileName) && mimeType) {
      const extension = getExtension(mimeType, fileName);

      return `${fileName}.${extension}`;
    }

    return fileName;
  }

  function hasExtension(fileName: string): boolean {
    return fileName.split('.').length > 1;
  }

  function getExtension(mimeType: string, fileName: string): string {
    const components = fileName.split('.');
    const extensionGuessing = components[components.length - 1];

    return mime.getExtension(mimeType) || extensionGuessing;
  }

  function onDownloadProgress(progressEvent: AxiosProgressEvent): void {
    const { loaded, total }: AxiosProgressEvent = progressEvent;

    const progress = loaded && total ? Math.round(
      (loaded / total) * 100
    ) : 0;

    if (!isNaN(progress)) {
      logProgress(`Download progress: ${progress}%`);
    }
  }

  type CallbackFunction = (data: string, fileName: string) => Promise<any>;

  async function getData(url: string, fileNameGuess: string, callback: CallbackFunction): Promise<string> {
    const response: AxiosResponse<any> = await axios.get<string>(decode(url), {
      responseType: 'arraybuffer',
      onDownloadProgress
    });

    const { headers, data } = response;

    const fileName = formFileName(headers, fileNameGuess);

    await callback(data, fileName);

    return data;
  }

  function logProgress(message: string): void {
    if (options.verbose === true) {
      console.log(`[Progress] ${message}`);
    }
  }

  function logSuccess(message: string): void {
    if (options.verbose === true) {
      console.log(`[Success] ${message}`);
    }
  }

  function logError(message: string): void {
    if (options.verbose === true) {
      console.error(`[Error] ${message}`);
    }
  }

  let htmlString: string = '';

  if (typeof userInput !== 'string' || typeof options.basePath !== 'string') {
    logError('Invalid user input: source and basePath must be strings.');
  }

  if (isUrl(userInput)) {
    if (isUrlValid(userInput)) {
      logProgress('Fetching content...');

      try {
        const { data }: { data: string } = await axios.get(appendForwardSlash(userInput));
        htmlString = data;

        logSuccess('Content fetched successfully');
      } catch (error) {
        logError(`Error fetching content from url: ${error.message}`);
      }
    }
  } else {
    htmlString = userInput;
    userInput = options.source;
  }

  if (isValidHtmlString(htmlString)) {
    return await processMatches(parseUrls(performHtmlReplacements(htmlString, userInput)));
  } 
  
  logError('Invalid HTML string.');

  return htmlString;
}
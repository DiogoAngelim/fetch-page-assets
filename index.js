import axios from 'axios';
import fs from 'fs';
import path from 'path';
import beautify from 'beautify';
import { decode } from 'html-entities';
import mime from 'mime';

export default async function extractAssets(userInput, options = {}) {
  let {
    basePath,
    source,
    saveFile,
    protocol,
    verbose,
    parseCss,
    maxRetryAttempts,
    retryDelay,
  } = options;

  options = {
    basePath: basePath || process.cwd(),
    source: source || '',
    saveFile: typeof saveFile !== 'undefined' ? saveFile : true,
    protocol: protocol || 'https',
    verbose: typeof verbose !== 'undefined' ? verbose : true,
    parseCss: typeof parseCss !== 'undefined' ? parseCss : true,
    maxRetryAttempts: maxRetryAttempts || 3,
    retryDelay: retryDelay || 1000,
  };

  function prependHttpProtocol(url) {
    if (url.startsWith('//')) {
      url = `${options.protocol}:${url}`;
    }

    return url;
  }

  function appendForwardSlash(userInput) {
    if (!userInput.endsWith('/')) {
      userInput = `${userInput}/`;
    }

    return userInput;
  }

  function isUrlValid(url) {
    try {
      let baseUrlWithoutQueryOrFragment = url.split('?')[0].split('#')[0];

      url = new URL(baseUrlWithoutQueryOrFragment);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        logError(
          'Invalid protocol in baseUrl. Only http and https protocols are supported.'
        );
      }

      if (!url.hostname) {
        logError(
          'Invalid baseUrl. Please provide a valid URL with a hostname.'
        );
      }

      return url.href;
    } catch (error) {
      logError(
        'Invalid type of url. Please provide a url with a valid format.'
      );
    }
  }

  function isValidHtmlString(htmlString) {
    return (
      htmlString && typeof htmlString === 'string' && htmlString.trim() !== ''
    );
  }

  function isUrl(string) {
    string = prependHttpProtocol(string);

    try {
      return !!new URL(string);
    } catch (error) {
      return false;
    }
  }

  function willFormDuplicateSlashes(userInput, url) {
    return userInput.endsWith('/') && url.startsWith('/');
  }

  function isRelativeUrl(url) {
    return !url.startsWith('http') && !url.startsWith('//');
  }

  function formPathWithDots(userInput, url) {
    url = url.split('../');
    let length = url.length;
    let parts = userInput.split('/');

    let i = 0;

    while (i < length && parts.length) {
      parts.pop();
      i++;
    }

    parts.shift();
    parts = `${options.protocol}://${parts.join('/')}/${url[length - 1]}`;

    return parts;
  }

  function formAssetAbsoluteUrl(url, userInput) {
    if (isRelativeUrl(url)) {
      if (willFormDuplicateSlashes(userInput, url)) {
        userInput = userInput.slice(0, -1);
      }

      const fileName = path.basename(userInput);

      if (url.includes('../')) {
        userInput = userInput.replace(fileName, '');

        return formPathWithDots(userInput, url);
      } else if (url.startsWith('./')) {
        url = url.substring(2);
      }

      return path.join(userInput, url);
    }

    url = prependHttpProtocol(url);

    return url;
  }

  function handleDuplicateSlashes(parsedUrl) {
    if (willFormDuplicateSlashes(userInput, parsedUrl)) {
      userInput = userInput.slice(0, -1);
    }
  }

  function handleCssFileInput() {
    if (path.extname(userInput).startsWith('.css')) {
      const fileName = path.basename(userInput);

      userInput = userInput.replace(fileName, '');
    }
  }

  function getAssetRemotePath(parsedUrl) {
    let assetRemotePath = parsedUrl;

    if (isUrl(parsedUrl)) {
      assetRemotePath = new URL(parsedUrl).pathname;
    } else if (isRelativeUrl(parsedUrl)) {
      handleDuplicateSlashes(parsedUrl);
      handleCssFileInput();

      assetRemotePath = path.join(userInput, parsedUrl);
    }

    return assetRemotePath;
  }

  function formDestinationPath(parsedUrl) {
    let destinationPath;

    parsedUrl = prependHttpProtocol(parsedUrl);

    const assetRemotePath = getAssetRemotePath(parsedUrl);

    destinationPath = path.join(options.basePath, assetRemotePath);
    destinationPath = destinationPath.replace(/\/[^\/]*$/, '');

    return destinationPath;
  }

  function directoryCreationCallback(error, destinationPath) {
    if (error) {
      logError(`Error creating directory ${destinationPath}: ${error.message}`);
    } else {
      logSuccess(`Directory created: ${destinationPath}`);
    }
  }

  async function mkdirRecursive(destinationPath) {
    fs.mkdir(destinationPath, { recursive: true }, (error) => {
      directoryCreationCallback(error, destinationPath);
    });
  }

  async function parseFileNameFromUrl(absoluteUrl, callback) {
    let urlObject = new URL(absoluteUrl);
    let fileName =
      urlObject && urlObject.href
        ? urlObject.href.match(/([%2F|\/](?:.(?!%2F|\/))+$)/g)
        : null;
    let fileName2 =
      fileName && fileName.length ? fileName[0].replace(/\/|%2F/, '') : null;
    let fileName3 = fileName2 ? fileName2.match(/^(.*?)(\.[^.]*)?$/) : null;
    let fileName4 =
      fileName2 &&
      fileName3 &&
      fileName3.length &&
      fileName2.match(/([\/.\w]+)([.][\w]+)([?][\w.\/=]+)?/)
        ? fileName3[1] +
          fileName2.match(/([\/.\w]+)([.][\w]+)([?][\w.\/=]+)?/)[2]
        : urlObject.pathname;

    callback(fileName4);
  }

  function saveHtmlFile(htmlString) {
    fs.writeFileSync(
      path.join(options.basePath, 'index.html'),
      beautify(htmlString, { format: 'html' }),
      'utf8'
    );
  }

  function formDestinationFilePath(destinationPath, fileName) {
    let destinationFilePath = path.join(destinationPath, fileName);

    return destinationFilePath.split('?')[0].split('#')[0];
  }

  function replaceHtmlWithRelativeUrls(
    htmlString,
    parsedUrl,
    destinationPath,
    fileName
  ) {
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

  async function downloadAssetWithRetry(url, fileNameGuess, callback) {
    const { retryDelay, maxRetryAttempts } = options;
    let retryAttempts = 0;

    while (retryAttempts < maxRetryAttempts) {
      try {
        await getData(url, fileNameGuess, (data, fileName) => {
          if (data) {
            callback(data, fileName);

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

  async function saveAsset(destinationFilePath, data) {
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

  function isNetworkError(error) {
    return ['ECONNRESET', 'ETIMEDOUT'].includes(error.code);
  }

  function isAccessError(error) {
    return ['EACCES', 'EISDIR'].includes(error.code);
  }

  function processCssFile(fileName, absoluteAssetUrl) {
    if (fileName.endsWith('.css')) {
      extractAssets(absoluteAssetUrl, {
        basePath: options.basePath,
        saveFile: false,
      });
    }
  }

  function processMatches(matches) {
    Promise.all(
      matches.map(async (parsedUrl) => {
        let absoluteAssetUrl = formAssetAbsoluteUrl(parsedUrl, userInput);
        const destinationPath = formDestinationPath(absoluteAssetUrl);

        try {
          await mkdirRecursive(destinationPath);
        } catch (error) {
          logError('Error processing parsed url: ' + absoluteAssetUrl, error);
        }

        try {
          parseFileNameFromUrl(absoluteAssetUrl, async (fileNameGuess) => {
            try {
              downloadAssetWithRetry(
                absoluteAssetUrl,
                fileNameGuess,
                async (responseData, fileName) => {
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
                  processCssFile(fileName, absoluteAssetUrl);
                }
              );
            } catch (error) {
              logError(error.message);
            }
          });
        } catch (error) {
          if (isNetworkError(error)) {
            logError(
              `Network error occurred while downloading asset from ${absoluteAssetUrl}: ${error.message}`
            );
          } else if (isAccessError(error)) {
            logError(
              `Error saving asset to ${destinationFilePath}: Permission denied or target path is a directory`
            );
          } else {
            logError(
              `Error downloading asset from ${absoluteAssetUrl}: ${error.message}`
            );
          }
        }

        return parsedUrl;
      })
    );
  }

  function performHtmlReplacements(htmlString, userInput) {
    htmlString = htmlString.replaceAll(/srcset="(.*?)"/gi, '');
    htmlString = htmlString.replaceAll(/sizes="(.*?)"/gi, '');

    let regex = new RegExp(userInput, 'g');

    htmlString = htmlString.replaceAll(regex, '');

    return htmlString;
  }

  function parseUrls(htmlString) {
    let expression =
      /((<link(.*?)(rel="stylesheet"|rel='stylesheet'))(.*?)(href="|href=\')|((img|script|source)(.*?)(src="|src=\')))(.*?\..*?)("|\')/;
    let regex = new RegExp(expression, 'g');
    let htmlMatches = [...htmlString.matchAll(regex)];
    htmlMatches = htmlMatches.map((match) => {
      let url = match ? match[11] : '';

      return url;
    });

    expression = /url\((.*?)\)/;
    regex = new RegExp(expression, 'g');
    let cssMatches = [...htmlString.matchAll(regex)];
    cssMatches = cssMatches.map((match) => {
      let url = match ? match[1].replaceAll(/\'|"/g, '') : '';

      return url;
    });

    let matches = [...htmlMatches, ...cssMatches];

    matches = matches.filter((url) => {
      return !url.startsWith('data:');
    });

    return matches;
  }

  function formFileName(headers, fileNameGuess) {
    let fileName =
      headers['content-disposition'] || headers['Content-Disposition'];
    const match = fileName ? fileName.match(/filename="(.*)"/) : null;
    fileName = match ? match[1] : fileNameGuess;

    fileName = fileName.split('?')[0];

    const mimeType = headers['content-type'] || headers['Content-Type'];

    if (!hasExtension(fileName)) {
      const extension = getExtension(mimeType, fileName);
      fileName = `${fileName}.${extension}`;
    }

    return fileName;
  }

  function hasExtension(fileName) {
    let components = fileName.split('.');

    return components.length > 1;
  }

  function getExtension(mimeType, fileName) {
    const components = fileName.split('.');
    const extensionGuessing = components[components.length - 1];

    return mime.getExtension(mimeType) || extensionGuessing;
  }

  function onDownloadProgress(progressEvent) {
    const progress = Math.round(
      (progressEvent.loaded / progressEvent.total) * 100
    );

    if (!isNaN(progress)) {
      logProgress(`Download progress: ${progress}%`);
    }
  }

  async function getData(url, fileNameGuess, callback) {
    const response = await axios.get(decode(url), {
      responseType: 'arraybuffer',
      onDownloadProgress,
    });

    const { headers } = response;
    const { data } = response;

    const fileName = formFileName(headers, fileNameGuess);

    callback(data, fileName);

    return data;
  }

  function isValidSource(source) {
    return (
      source &&
      typeof source === 'string' &&
      source.trim() !== '' &&
      isUrl(source)
    );
  }

  function logProgress(message) {
    if (options.verbose) {
      console.log(`[Progress] ${message}`);
    }
  }

  function logSuccess(message) {
    if (options.verbose) {
      console.log(`[Success] ${message}`);
    }
  }

  function logError(message) {
    if (options.verbose) {
      console.error(`[Error] ${message}`);
    }
  }

  let htmlString;

  if (typeof userInput !== 'string' || typeof options.basePath !== 'string') {
    logError('Invalid user input: source and basePath must be strings.');
  }

  if (isUrl(userInput)) {
    if (isUrlValid(userInput)) {
      userInput = appendForwardSlash;

      logProgress('Fetching content...');

      try {
        const { data } = await axios.get(userInput);
        htmlString = data;

        logSuccess('Content fetched successfully');
      } catch (error) {
        logError(`Error fetching content from url: ${error.message}`);
      }
    }
  } else {
    htmlString = userInput;
    userInput = options.source;

    if (isValidSource(options.source)) {
      isUrlValid(options.source);
    }
  }

  if (isValidHtmlString(htmlString)) {
    htmlString = performHtmlReplacements(htmlString, userInput);

    const urls = parseUrls(htmlString);

    processMatches(urls);
  } else {
    logError('Invalid HTML string.');
  }

  return htmlString;
}

extractAssets('https://valueci.com/', {
  basePath: '/Users/diogoangelim/test4',
});

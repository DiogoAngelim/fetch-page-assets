import axios from 'axios';
import fs from 'fs';
import path from 'path';
import beautify from 'beautify';
import { decode } from 'html-entities';
import mime from 'mime';

export default async function extractAssets(
  userInput,
  basePath = process.cwd(),
  source = '',
  saveFile = true
) {
  function prependHttpProtocol(url) {
    if (url.startsWith('//')) {
      return `https:${url}`;
    }

    return url;
  }

  function isUrlValid(url) {
    url = prependHttpProtocol(url);

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
    parts = 'https://' + parts.join('/') + '/' + url[length - 1];

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
      }

      return path.join(userInput, url);
    }

    return url;
  }

  function formDestinationPath(parsedUrl, basePath) {
    let destinationPath;

    parsedUrl = prependHttpProtocol(parsedUrl);

    let assetRemotePath = parsedUrl;

    if (isUrl(parsedUrl)) {
      assetRemotePath = new URL(parsedUrl).pathname;
    } else if (isRelativeUrl(parsedUrl)) {
      if (willFormDuplicateSlashes(userInput, parsedUrl)) {
        userInput = userInput.slice(0, -1);
      }

      if (path.extname(userInput).startsWith('.css')) {
        const fileName = path.basename(userInput);

        userInput = userInput.replace(fileName, '');
      }

      assetRemotePath = path.join(userInput, parsedUrl);
    }

    destinationPath = path.join(basePath, assetRemotePath);
    destinationPath = destinationPath.replace(/\/[^\/]*$/, '');

    return destinationPath;
  }

  async function mkdirRecursive(destinationPath) {
    fs.mkdir(destinationPath, { recursive: true }, (error, result) => {
      if (error) {
        logError(
          `Error creating directory ${destinationPath}: ${error.message}`
        );
      } else {
        logSuccess(`Directory created: ${destinationPath}`);
      }
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

  function saveHtmlFile(htmlString, basePath) {
    fs.writeFileSync(
      path.join(basePath, 'index.html'),
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
    const relativePath = destinationFilePath.replace(`${basePath}/`, '');

    htmlString = htmlString.replace(origin, '');

    return htmlString.replace(localUrl, relativePath);
  }

  async function downloadAssetWithRetry(url, fileNameGuess, callback) {
    let retryAttempts = 0;
    const maxRetryAttempts = 3;
    const retryDelay = 1000;

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
          logError(`Failed to download asset from ${url}.`);

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

  async function processCssFile(fileName, absoluteAssetUrl) {
    if (fileName.endsWith('.css')) {
      await extractAssets(absoluteAssetUrl, basePath, '', false);
    }
  }

  async function processMatches(matches) {
    matches.map(async (parsedUrl) => {
      let absoluteAssetUrl = formAssetAbsoluteUrl(parsedUrl, userInput);
      const destinationPath = formDestinationPath(absoluteAssetUrl, basePath);

      try {
        await mkdirRecursive(destinationPath);
      } catch (error) {
        logError('Error processing parsed url: ' + absoluteAssetUrl, error);
      }

      try {
        await parseFileNameFromUrl(absoluteAssetUrl, async (fileNameGuess) => {
          try {
            await downloadAssetWithRetry(
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

                if (saveFile) {
                  saveHtmlFile(htmlString, basePath);
                }

                await saveAsset(destinationFilePath, responseData);
                await processCssFile(fileName, absoluteAssetUrl);
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
    });
  }

  function performHtmlReplacements(htmlString, userInput) {
    htmlString = htmlString.replaceAll(/srcset="(.*?)"/g, '');
    htmlString = htmlString.replaceAll(/srcSet="(.*?)"/g, '');
    htmlString = htmlString.replaceAll(/sizes="(.*?)"/g, '');

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
    console.log(`[Progress] ${message}`);
  }

  function logSuccess(message) {
    console.log(`[Success] ${message}`);
  }

  function logError(message) {
    console.error(`[Error] ${message}`);
  }

  let response;
  let htmlString;

  if (typeof userInput !== 'string' || typeof basePath !== 'string') {
    logError('Invalid user input: source and basePath must be strings.');
  }

  if (isUrl(userInput)) {
    if (isUrlValid(userInput)) {
      const url = userInput;

      try {
        logProgress('Fetching HTML content...');

        response = await axios.get(url);
        htmlString = response.data;

        logSuccess('HTML content fetched successfully');
      } catch (error) {
        logError(`Error fetching HTML content from url: ${error.message}`);
      }
    }
  } else {
    htmlString = userInput;
    userInput = source;

    if (isValidSource(source)) {
      isUrlValid(source);
    }
  }

  if (isValidHtmlString(htmlString)) {
    htmlString = performHtmlReplacements(htmlString, userInput);

    const urls = parseUrls(htmlString);

    await processMatches(urls);
  } else {
    logError('Invalid HTML string.');
  }

  return htmlString;
}

await extractAssets(
  `
<main class="min-h-full bg-cover bg-top sm:bg-top" style="background-image: url('https://images.unsplash.com/photo-1545972154-9bb223aac798?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&ixlib=rb-1.2.1&auto=format&fit=crop&w=3050&q=80&exp=8&con=-15&sat=-75')">
  <div class="max-w-7xl mx-auto px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8 lg:py-48">
    <p class="text-sm font-semibold text-black text-opacity-50 uppercase tracking-wide">404 error</p>
    <h1 class="mt-2 text-4xl font-extrabold text-white tracking-tight sm:text-5xl">Uh oh! I think you’re lost.</h1>
    <p class="mt-2 text-lg font-medium text-black text-opacity-50">It looks like the page you’re looking for doesn't exist.</p>
    <div class="mt-6">
      <a href="#" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-black text-opacity-75 bg-white bg-opacity-75 sm:bg-opacity-25 sm:hover:bg-opacity-50"> Go back home </a>
    </div>
  </div>
</main>

`,
  '/Users/diogoangelim/test'
);

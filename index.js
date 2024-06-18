import axios from 'axios';
import fs from 'fs';
import path from 'path';
import beautify from 'beautify';
import { decode } from 'html-entities';
import mime from 'mime';
const extractAssets = async (userInput, options = {
    saveFile: true,
    verbose: true,
}) => {
    let { basePath, source, protocol, maxRetryAttempts, retryDelay, verbose, saveFile, } = options;
    source = source || '';
    protocol = protocol || 'https';
    retryDelay = retryDelay || 1000;
    basePath = basePath || process.cwd();
    maxRetryAttempts = maxRetryAttempts || 3;
    let htmlString = '';
    const logMessage = (message, func, type) => {
        if (verbose) {
            console[func](`${type} ${message}`);
        }
    };
    const isDynamicProtocol = (url) => {
        return url.startsWith('//');
    };
    const prependHttpProtocol = (url) => {
        return isDynamicProtocol(url) ? `${protocol}:${url}` : url;
    };
    const inputEndsWithSlash = () => {
        return userInput.endsWith('/');
    };
    const appendForwardSlash = () => {
        return inputEndsWithSlash() ? userInput : `${userInput}/`;
    };
    const isProtocolInvalid = (protocol) => {
        return !['http', 'https'].includes(protocol);
    };
    const checkProtocol = (protocol) => {
        if (isProtocolInvalid(protocol)) {
            throw new Error('Invalid protocol in baseUrl. Only http and https protocols are supported.');
        }
    };
    const checkHostName = (hostname) => {
        if (!hostname) {
            throw new Error('Invalid baseUrl. Please provide a valid URL with a hostname.');
        }
    };
    const checkUrl = (url) => {
        const { protocol, hostname, href } = new URL(removeQueryParams(url));
        checkProtocol(protocol);
        checkHostName(hostname);
        return !!href;
    };
    const isUrlValid = (url) => {
        try {
            return checkUrl(url);
        }
        catch (error) {
            logMessage(error, 'error', 'Error');
            return false;
        }
    };
    const willFormDuplicateSlashes = (url) => {
        return inputEndsWithSlash() && url.startsWith('/');
    };
    const isRelativeUrl = (url) => {
        return !url.startsWith('http') && !isDynamicProtocol(url);
    };
    const processPath = (url) => {
        return { urlLength: url.split('../').length, parts: userInput.split('/') };
    };
    const setParts = (parts, urlLength) => {
        let i = 0;
        while (i <= urlLength && parts.length) {
            parts.pop();
            i++;
        }
        parts.shift();
        return parts.join('/');
    };
    const formPathWithDots = (url) => {
        const { urlLength, parts } = processPath(url);
        return `${protocol}://${setParts(parts, urlLength)}/${url[urlLength - 1]}`;
    };
    const joinPath = (paths) => {
        return path.join(...paths);
    };
    const removeForwardSlash = () => {
        userInput.slice(0, -1);
    };
    const handleDuplicateSlashes = (url) => {
        if (willFormDuplicateSlashes(url)) {
            removeForwardSlash();
        }
    };
    const parseUserInput = (url) => {
        handleDuplicateSlashes(url);
        return url.includes('../') ? formPathWithDots(url) : joinPath([userInput.replace(path.basename(userInput), ''), url]);
    };
    const formAssetAbsoluteUrl = (url) => {
        return isRelativeUrl(url) ? parseUserInput(url) : prependHttpProtocol(url);
    };
    const handleCssFileInput = () => {
        userInput = path.extname(userInput).startsWith('.css') ? userInput.replace(path.basename(userInput), '') : userInput;
    };
    const isUrl = (string) => {
        try {
            return !!new URL(prependHttpProtocol(string));
        }
        catch {
            return false;
        }
    };
    const handleRelativeUrl = (parsedUrl) => {
        handleDuplicateSlashes(parsedUrl);
        handleCssFileInput();
        return joinPath([userInput, parsedUrl]);
    };
    const getAssetRemotePath = (parsedUrl) => {
        if (isUrl(parsedUrl)) {
            return new URL(parsedUrl).pathname;
        }
        else if (isRelativeUrl(parsedUrl)) {
            return handleRelativeUrl(parsedUrl);
        }
        else {
            return parsedUrl;
        }
    };
    const formDestinationPath = (parsedUrl) => {
        return joinPath([basePath, getAssetRemotePath(prependHttpProtocol(parsedUrl))]).replace(/\/[^\/]*$/, '');
    };
    const directoryCreationCallback = (error, destinationPath) => {
        if (error) {
            logMessage(`Error creating directory ${destinationPath}: ${error.message}`, 'error', 'Error');
        }
        else {
            logMessage(`Directory created: ${destinationPath}`, 'log', 'Success');
        }
    };
    const createDirectory = (destinationPath) => {
        fs.mkdir(destinationPath, { recursive: true }, (error) => {
            directoryCreationCallback(error, destinationPath);
        });
    };
    const mkdirRecursive = (destinationPath) => {
        createDirectory(destinationPath);
    };
    const parseFileNameFromUrl = async (absoluteUrl, callback) => {
        const urlObject = new URL(absoluteUrl);
        const fileName = urlObject?.href ? urlObject.href.match(/([%2F|\/](?:.(?!%2F|\/))+$)/g) : null;
        const fileName2 = fileName?.length ? fileName[0].replace(/\/|%2F/, '') : null;
        const fileName3 = fileName2 ? fileName2.match(/^(.*?)(\.[^.]*)?$/) : null;
        const m2 = fileName2 ? fileName2.match(/([\/.\w]+)([.][\w]+)([?][\w.\/=]+)?/) : null;
        await callback(fileName2 && fileName3 && fileName3.length && m2 ? fileName3[1] + m2[2] : urlObject.pathname);
    };
    const saveHtmlFile = (fileOptions) => {
        if (saveFile) {
            replaceHtmlWithRelativeUrls(fileOptions);
            fs.writeFileSync(joinPath([basePath, 'index.html']), beautify(htmlString, { format: 'html' }), 'utf8');
        }
    };
    const removeQueryParams = (url) => {
        return url.split('?')[0].split('#')[0];
    };
    const formDestinationFilePath = (destinationPath, fileName) => {
        return removeQueryParams(joinPath([destinationPath, fileName]));
    };
    function replaceHtmlWithRelativeUrls(fileOptions) {
        const { parsedUrl, destinationFilePath } = fileOptions;
        const { origin } = new URL(parsedUrl);
        htmlString = htmlString.replace(origin, '').replace(parsedUrl.replace(origin, ''), destinationFilePath.replace(`${basePath.replace('../', '').replace('./', '')}/`, ''));
    }
    const splitDots = (fileName) => {
        return fileName.split('.');
    };
    const hasExtension = (fileName) => {
        return splitDots(fileName).length > 1;
    };
    const getExtension = (mimeType, fileName) => {
        const components = splitDots(fileName);
        return mime.getExtension(mimeType) || components[components.length - 1];
    };
    const getHeader = (headers, name) => {
        return headers[name] || headers[name.toLowerCase()];
    };
    const getFileNameFromHeaders = (headers) => {
        return (getHeader(headers, 'Content-Disposition'))?.match(/filename="(.*)"/);
    };
    const getMimeTypeFromHeaders = (headers) => {
        return getHeader(headers, 'Content-Type');
    };
    const formFileName = (headers, fileNameGuess) => {
        let fileName = getFileNameFromHeaders(headers);
        fileName = fileName ? fileName[1] : fileNameGuess;
        fileName = fileName?.split('?')[0];
        const mimeType = getMimeTypeFromHeaders(headers);
        return !hasExtension(fileName) && mimeType ? `${fileName}.${getExtension(mimeType, fileName)}` : fileName;
    };
    const onDownloadProgress = (progressEvent) => {
        const { loaded, total } = progressEvent;
        const progress = loaded && total ? Math.round((loaded / total) * 100) : 0;
        if (!isNaN(progress)) {
            logMessage(`Download progress: ${progress}%`, 'log', 'Progress');
        }
    };
    const getData = async (url, fileNameGuess, callback) => {
        const { headers, data } = await axios.get(decode(url), { responseType: 'arraybuffer', onDownloadProgress });
        await callback(data, formFileName(headers, fileNameGuess));
        return data;
    };
    const retry = async (url, retryAttempts) => {
        logMessage(`Retrying asset download for ${url} (Attempt ${retryAttempts + 1}/${maxRetryAttempts})...`, 'log', 'Progress');
        await new Promise((resolve) => {
            setTimeout(resolve, retryDelay);
        });
    };
    const retrialError = (code, retryAttempts) => {
        return ['ERR_BAD_REQUEST', 'ENOTFOUND'].includes(code) && retryAttempts >= maxRetryAttempts - 1;
    };
    const downloadAssetWithRetry = async (url, fileNameGuess, callback) => {
        let retryAttempts = 0;
        while (retryAttempts < maxRetryAttempts) {
            try {
                await getData(url, fileNameGuess, async (data, fileName) => data ? await callback(data, fileName) : null);
                break;
            }
            catch (error) {
                const { message, code } = error;
                logMessage(`Error downloading asset from ${url}: ${message}`, 'error', 'Error');
                if (retrialError(code, retryAttempts)) {
                    break;
                }
                else {
                    await retry(url, retryAttempts);
                    retryAttempts++;
                }
            }
        }
    };
    const checkForFileSaveSuccess = (destinationFilePath) => {
        if (fs.existsSync(destinationFilePath)) {
            logMessage(`Asset saved successfully to ${destinationFilePath}`, 'log', 'Success');
        }
        else {
            logMessage(`Failed to save asset (${destinationFilePath}).`, 'error', 'Error');
        }
    };
    const saveAsset = (fileOptions) => {
        const { responseData, destinationFilePath } = fileOptions;
        try {
            fs.writeFileSync(destinationFilePath, responseData, 'utf8');
            checkForFileSaveSuccess(destinationFilePath);
        }
        catch (error) {
            logMessage(`Error saving asset to ${destinationFilePath}: ${error.message}`, 'error', 'Error');
        }
    };
    const isNetworkError = (error) => {
        return ['ECONNRESET', 'ETIMEDOUT'].includes(error.code);
    };
    const isAccessError = (error) => {
        return ['EACCES', 'EISDIR'].includes(error.code);
    };
    const isCssFile = (fileName) => {
        return fileName.endsWith('.css');
    };
    const processCssFile = async (fileOptions) => {
        const { absoluteAssetUrl, fileName } = fileOptions;
        if (isCssFile(fileName)) {
            await extractAssets(absoluteAssetUrl, { basePath, saveFile: false });
        }
    };
    const downloadAssetWithRetryCallback = async (fileOptions) => {
        saveHtmlFile(fileOptions);
        saveAsset(fileOptions);
        await processCssFile(fileOptions);
    };
    const parseFileNameFromUrlCallback = async (fileOptions) => {
        const { absoluteAssetUrl, fileNameGuess, destinationPath } = fileOptions;
        await downloadAssetWithRetry(absoluteAssetUrl, fileNameGuess, async (responseData, fileName) => {
            await downloadAssetWithRetryCallback({ ...fileOptions, fileName, responseData, destinationFilePath: formDestinationFilePath(destinationPath, fileName) });
        });
    };
    const parseMatchError = (error, absoluteAssetUrl) => {
        const { message } = error;
        if (isNetworkError(error)) {
            logMessage(`Network error occurred while downloading asset from ${absoluteAssetUrl}: ${message}.`, 'error', 'Error');
        }
        else if (isAccessError(error)) {
            logMessage(`Error saving asset. Permission denied or target path is a directory.`, 'error', 'Error');
        }
        else {
            logMessage(`Error downloading asset from ${absoluteAssetUrl}: ${message}.`, 'error', 'Error');
        }
    };
    const processMatch = async (fileOptions) => {
        const { absoluteAssetUrl, destinationPath } = fileOptions;
        mkdirRecursive(destinationPath);
        await parseFileNameFromUrl(absoluteAssetUrl, async (fileNameGuess) => {
            await parseFileNameFromUrlCallback({ ...fileOptions, fileNameGuess });
        });
    };
    const processParsedUrl = async (parsedUrl) => {
        const absoluteAssetUrl = formAssetAbsoluteUrl(parsedUrl);
        try {
            await processMatch({
                parsedUrl,
                absoluteAssetUrl,
                destinationPath: formDestinationPath(parsedUrl)
            });
        }
        catch (error) {
            parseMatchError(error, absoluteAssetUrl);
        }
    };
    const processMatches = async (matches) => {
        for (const parsedUrl of matches) {
            await processParsedUrl(parsedUrl);
        }
        ;
    };
    const performHtmlReplacements = () => {
        return htmlString.replace(/srcset="(.*?)"/gi, '').replace(/sizes="(.*?)"/gi, '').replace(new RegExp(userInput, 'g'), '');
    };
    const parseUrls = () => {
        return [...[...htmlString.matchAll(/((<link(.*?)(rel="stylesheet"|rel='stylesheet'))(.*?)(href="|href=\')|((img|script|source)(.*?)(src="|src=\')))(.*?\..*?)("|\')/gi)].map(match => match ? match[11] : ''), ...[...htmlString.matchAll(/url\((.*?)\)/gi)].map(match => match ? match[1].replace(/\'|"/g, '') : '')].filter(url => !url.startsWith('data:'));
    };
    const isValidInput = () => {
        return typeof userInput !== 'string' || typeof basePath !== 'string';
    };
    const processUrl = async () => {
        const { data } = await axios.get(appendForwardSlash());
        htmlString = data;
        logMessage('Fetching content...', 'log', 'Progress');
    };
    const fetchData = async () => {
        try {
            await processUrl();
        }
        catch (error) {
            logMessage(`Error fetching content from url: ${error.message}`, 'log', 'Error');
        }
    };
    const shouldFetchData = () => {
        return isUrl(userInput) && isUrlValid(userInput);
    };
    const modifyUserVars = () => {
        htmlString = userInput;
        userInput = source;
    };
    const processUserInput = async () => {
        if (isValidInput()) {
            logMessage('Invalid user input: source and basePath must be strings.', 'log', 'Error');
        }
        else if (shouldFetchData()) {
            await fetchData();
        }
        else {
            modifyUserVars();
        }
    };
    const processHtmlString = async () => {
        await processUserInput();
        performHtmlReplacements();
        await processMatches(parseUrls());
    };
    await processHtmlString();
    return htmlString;
};
export default extractAssets;

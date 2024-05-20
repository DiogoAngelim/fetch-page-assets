import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import fs from 'fs';
import mockFs from 'mock-fs';
import extractAssets from '../index.js';

describe('extractAssets', () => {
  let axiosMock;
  const mockHtmlContent = `
    <html>
      <head>
        <link rel="stylesheet" href="styles.css">
      </head>
      <body>
        <img src="image.jpg" />
        <script src="script.js"></script>
      </body>
    </html>
  `;
  const basePath = '/Users/diogoangelim/tests';

  beforeEach(() => {
    axiosMock = new MockAdapter(axios);
    mockFs({
      '/Users/diogoangelim/tests': {},
    });
  });

  afterEach(() => {
    axiosMock.restore();
    mockFs.restore();
  });

  it('should fetch HTML content from a URL and process assets', async () => {
    const url = 'https://google.com';
    axiosMock.onGet(url).reply(200, mockHtmlContent);
    axiosMock.onGet(/styles\.css/).reply(200, 'body { color: red; }');
    axiosMock.onGet(/image\.jpg/).reply(200, Buffer.from('image content'));
    axiosMock.onGet(/script\.js/).reply(200, 'console.log("Hello world");');

    const result = await extractAssets(url, '', basePath);

    expect(result).toContain('href="styles.css"');
    expect(result).toContain('src="image.jpg"');
    expect(result).toContain('src="script.js"');
    expect(fs.existsSync(`${basePath}/styles.css`)).toBe(true);
    expect(fs.existsSync(`${basePath}/image.jpg`)).toBe(true);
    expect(fs.existsSync(`${basePath}/script.js`)).toBe(true);
  });

  it('should process HTML content provided directly as a string', async () => {
    axiosMock.onGet(/styles\.css/).reply(200, 'body { color: red; }');
    axiosMock.onGet(/image\.jpg/).reply(200, Buffer.from('image content'));
    axiosMock.onGet(/script\.js/).reply(200, 'console.log("Hello world");');

    const result = await extractAssets(
      mockHtmlContent,
      'https://google.com',
      basePath
    );

    expect(result).toContain('href="styles.css"');
    expect(result).toContain('src="image.jpg"');
    expect(result).toContain('src="script.js"');
    expect(fs.existsSync(`${basePath}/styles.css`)).toBe(true);
    expect(fs.existsSync(`${basePath}/image.jpg`)).toBe(true);
    expect(fs.existsSync(`${basePath}/script.js`)).toBe(true);
  });

  it('should throw an error for invalid input types', async () => {
    await expect(extractAssets(123, '', basePath)).rejects.toThrow(TypeError);
    await expect(extractAssets(mockHtmlContent, 123, basePath)).rejects.toThrow(
      TypeError
    );
  });

  it('should throw an error for invalid URLs', async () => {
    await expect(extractAssets('invalid-url', '', basePath)).rejects.toThrow(
      'Invalid type of url'
    );
  });

  it('should handle network errors gracefully', async () => {
    const url = 'https://google.com';
    axiosMock.onGet(url).networkError();

    await expect(extractAssets(url, '', basePath)).rejects.toThrow(
      'Network Error'
    );
  });
});

## Fetch Page Assets

### Overview

The extractAssets function extracts assets (such as images, stylesheets, and scripts) from a given URL or HTML string and saves them to a specified directory. Unlike tools like `wget`, this function can handle more complex URLs, including those with filenames in query strings.

### Installation

Ensure you have Node.js installed on your machine. Then, you can install the required dependencies using npm:

```bash
npm install
```

### Usage

```JavaScript
// Import the library
import extractAssets from 'fetch-page-assets';

// Option 1: Pass an html string, the destination folder on your computer, and the source URL
const html = extractAssets('<img src="/img/logo.png"/>', '/Users/diogoangelim/my-folder', 'https://example.com');

// Option 2: Pass the source URL and the destination folder on your computer
const html = extractAssets('https://example.com', '/Users/diogoangelim/my-folder');
```

The extractAssets function takes three parameters:

**input**: A URL or an HTML string.
**basePath**: The local directory where the assets and modified HTML will be saved.
**source**: The base URL (only required if input is an HTML string).

### License

This project is licensed under the MIT License.

### How to Contribute

Contributions are welcome! To contribute, follow these steps:

1. Fork the repository.
2. Create a new branch (git checkout -b feature-branch).
3. Make your changes.
4. Commit your changes (git commit -am 'Add new feature').
5. Push to the branch (git push origin feature-branch).
6. Open a Pull Request.

For any questions or suggestions, feel free to open an issue in the repository.

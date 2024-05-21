## Fetch Page Assets

### Overview

The extractAssets function extracts assets (such as images, fonts, stylesheets, and scripts) from a given URL or HTML string and saves them to a specified directory, while keeping the same folder structure. Unlike tools like `wget`, this function can handle more complex URLs, including those with query strings.

### Installation

Ensure you have Node.js installed on your machine. Then, you can install the required dependencies using npm:

```bash
npm install fetch-page-assets
```

### Usage

The extractAssets function takes two parameters:

**input**: Can be either a URL or an HTML string.

**options**: An optional object with arguments that allow you to further customize the behavior. See below for more details.

| Name             | Description                                                                                                                            | Type    | Default           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------- |
| basePath         | Defines the local directory where the program will save assets to.                                                                     | String  | Current Directory |
| source           | If an HTML string is provided instead of a URL as an input, define a source url where relative paths will resolve to.                  | String  | none              |
| saveFile         | Optionally, save the modified HTML to the root folder, given by the basePath option.                                                   | Boolean | true              |
| protocol         | If a protocol is not present, this option will let you choose whether to use http or https.                                            | String  | https             |
| parseCss         | This option is may help if you want to parse any urls from parsed css files. Useful if the source contains background images or fonts. | Boolean | true              |
| maxRetryAttempts | Defines how many attempts the program should retry in case of network errors.                                                          | Int     | 3                 |
| retryDelay       | Defines how long the program will halt in milliseconds in case of network errors.                                                      | Int     | 1000              |
| verbose          | If sets to false, this option will silent the logs.                                                                                    | Boolean | true              |

```JavaScript
// Import the library.
import extractAssets from 'fetch-page-assets';

// Option 1: Pass an HTML string with any options as an object parameter.
const html = extractAssets('<img src="https://google.com/img/logo.png"/>', {});

console.log(html);
// Outputs '<img src="img/logo.png"/>'


// Option 2: Pass the source URL as the only argument.
extractAssets('https://example.com');
```

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

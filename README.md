# docsify-to-pdf

[English](README.md)

> The remote repository version of docsify-to-pdf is no longer compatible. Please use the local repository version.

## Local Repository Usage

### 1. Build Link

Download the current code to your local machine, then install dependencies.

```sh
# Download code
git clone https://github.com/ningg/docsify-to-pdf.git
cd docsify-to-pdf
# Install dependencies
npm install
# Build link
npm link
```

### 2. Use Link

In other projects where you want to use docsify-to-pdf (e.g., `/path/to/your/other/project`), execute:

```sh
cd /path/to/your/other/project
npm link docsify-to-pdf
```

And add a `.docsifytopdfrc.js` file in the directory with the following content:

```js
module.exports = {
    // Required: Specify array of table of contents file paths
    contents: ["_sidebar.md"],
    
    // Required: PDF output path
    pathToPublic: "pdf/LLM_30_Essential_Lectures_AI.pdf",
    
    // Optional: PDF options (Puppeteer configuration)
    // https://pptr.dev/api/puppeteer.pdfoptions
    pdfOptions: {
      format: "A4",
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm"
      },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span>title</span>',  
      footerTemplate: '<div style="font-size: 10px; text-align: center; width: 100%;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
    },

    // Required: Chrome browser executable file path
    chromeExecutablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    
    // Optional: Whether to remove temporary files
    removeTemp: true,
    
    // Optional: Media type emulation (print or screen)
    emulateMedia: "screen",
    
    // Optional: Static files path
    pathToStatic: "static",
    
    // Optional: Main Markdown filename
    mainMdFilename: "README.md",
    
    // Optional: docsify entry point path
    pathToDocsifyEntryPoint: ".",
    
    // Optional: Page break configuration
    pageBreak: {
      // Whether to enable page breaks
      enabled: true,
      // Page break style: 'div' or 'css'
      type: 'div',
      // Custom page break HTML (used when type is 'div')
      html: '<div style="page-break-after: always;"></div>',
      // Custom CSS styles (used when type is 'css')
      css: `
        .markdown-section h1, .markdown-section h2, .markdown-section h3 {
          page-break-before: always;
        }
        .markdown-section h1:first-child, .markdown-section h2:first-child, .markdown-section h3:first-child {
          page-break-before: avoid;
        }
        .markdown-section {
          page-break-inside: avoid;
        }
        .markdown-section h1, .markdown-section h2, .markdown-section h3 {
          break-before: page;
        }
        .markdown-section h1:first-child, .markdown-section h2:first-child, .markdown-section h3:first-child {
          break-before: avoid;
        }
      `
    }
  };
```

Then add a script in the `package.json` file in the directory:

```json
{
    "scripts": {
      "convert": "node_modules/.bin/docsify-to-pdf"
    }
}
```

Finally, execute in the current directory:

```sh
npm run convert
```

## Contributing

- Fork it!
- Create your feature branch: `git checkout -b my-new-feature`
- Commit your changes: `git commit -am 'Add some feature'`
- Push to the branch: `git push origin my-new-feature`
- Submit a pull request

Your pull requests and issues are welcome!

Base on docsify-to-pdf
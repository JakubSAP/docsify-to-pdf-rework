/**
 * @fileoverview PDF rendering engine using Puppeteer.
 * This module automates a headless Chrome browser to navigate to a Docsify-served
 * HTML page, process document anchors via a sandbox script, and print the result
 * to a PDF file with custom styling and page breaks.
 */

const path = require("path");
const puppeteer = require("puppeteer");
const logger = require("./logger.js");
const fs = require("fs");
const runSandboxScript = require("./run-sandbox-script.js");
const util = require("util");

const [readFile, writeFile, exists] = [fs.readFile, fs.writeFile, fs.exists].map(fn => util.promisify(fn),);

/**
 * Internal helper to perform the actual browser automation and PDF export.
 * * @async
 * @param {Object[]} anchors - Array of anchor objects used to resolve links within the browser context.
 * @param {Object} options - Configuration for the rendering process.
 * @param {string} options.mainMdFilename - Name of the main Markdown file.
 * @param {string} options.pathToStatic - Directory path where static assets and the main MD file are located.
 * @param {string} options.pathToPublic - Destination path for the generated PDF file.
 * @param {Object} options.pdfOptions - Native Puppeteer PDF options (format, margin, etc.).
 * @param {number} options.docsifyRendererPort - The port where the Docsify server is running.
 * @param {string} options.emulateMedia - Media type to emulate (e.g., 'print' or 'screen').
 * @param {Object} options.pageBreak - CSS configuration for page breaks.
 * @param {string} options.chromeExecutablePath - Absolute path to the Chromium/Chrome binary.
 * @param {string} options.pathToDocsifyEntryPoint - Root path of the Docsify project.
 * @returns {Promise<void>} Resolves when the browser is closed and the PDF is saved.
 */
const renderPdf = async (anchors, {
    mainMdFilename,
    pathToStatic,
    pathToPublic,
    pdfOptions,
    docsifyRendererPort,
    emulateMedia,
    pageBreak,
    chromeExecutablePath,
    pathToDocsifyEntryPoint
}) => {
    const browser = await puppeteer.launch({
        defaultViewport: {
            width: 1200, height: 1000,
        }, executablePath: chromeExecutablePath,
    });
    try {
        const mainMdFilenameWithoutExt = path.parse(mainMdFilename).name;
        // Construct the URL pointing to the Docsify route for the merged document
        const docsifyUrl = `http://localhost:${docsifyRendererPort}/#/${pathToStatic}/${mainMdFilenameWithoutExt}`;
        const page = await browser.newPage();

        // Wait for the network to be idle to ensure Docsify has finished rendering the Markdown
        await page.goto(docsifyUrl, {waitUntil: "networkidle0"});

        // Execute a sandbox script within the browser to fix anchors and navigation
        const renderProcessingErrors = await runSandboxScript(page, anchors, {
            mainMdFilenameWithoutExt, pathToStatic,
        });

        if (renderProcessingErrors.length) logger.warn("anchors processing errors", renderProcessingErrors);

        await page.emulateMediaType(emulateMedia);

        // Inject custom CSS for page breaks if configured
        if (pageBreak && pageBreak.enabled && pageBreak.type === 'css') {
            await page.addStyleTag({
                content: pageBreak.css || `
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
            });
        }

        // Generate the PDF file at the specified public path
        await page.pdf({
            ...pdfOptions, path: path.resolve(pathToPublic),
        });

        // return await browser.close();
    } catch (e) {
        // await browser.close();
        throw e;
    }
};

/**
 * Initializes the HTML to PDF conversion utility.
 * * @param {Object} config - Configuration object containing paths, port, and browser settings.
 * @param {boolean} config.removeTemp - Whether to clean up temporary files after completion.
 * @returns {function(Object[]): Promise<void>} An async function that accepts anchors and starts the PDF rendering.
 */
const htmlToPdf = ({
                       mainMdFilename,
                       pathToStatic,
                       pathToPublic,
                       pdfOptions,
                       removeTemp,
                       docsifyRendererPort,
                       emulateMedia,
                       pageBreak,
                       chromeExecutablePath,
                       pathToDocsifyEntryPoint
                   }) =>
  /**
   * Executes the PDF rendering process.
   * * @async
   * @param {Object[]} anchors - Navigation anchors generated in previous pipeline steps.
   * @returns {Promise<void>}
   */
  async (anchors) => {
      const {closeProcess} = require("./utils.js")({pathToStatic, removeTemp});
      try {
          return await renderPdf(anchors, {
              mainMdFilename,
              pathToStatic,
              pathToPublic,
              pdfOptions,
              docsifyRendererPort,
              emulateMedia,
              pageBreak,
              chromeExecutablePath,
              pathToDocsifyEntryPoint
          });
      } catch (err) {
          logger.err("puppeteer renderer error:", err);
          // Force process exit on critical failure
          // await closeProcess(1);
      }
  };

/**
 * Exports the initialized htmlToPdf function.
 * * @param {Object} config - The global tool configuration.
 * @returns {Object} An object containing the htmlToPdf method.
 */
module.exports = config => ({
    htmlToPdf: htmlToPdf(config),
});
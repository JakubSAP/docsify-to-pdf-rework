/**
 Copyright (c) 2026 SAP SE or an SAP affiliate company. All rights reserved.
 **/
/**
 * @fileoverview Merges linked Markdown files into a single master document and resolves image paths.
 * This module is designed for Docsify projects to prepare content for PDF generation by
 * flattening the file structure and maintaining internal navigation via anchors.
 */

const fs = require("fs");
const util = require("util");
const path = require("path");
const logger = require("./logger.js");
const {exists} = require("docsify-cli/lib/util");
const beautifyImages = require("./beautify-image-paths.js");

const [readFile, writeFile] = [fs.readFile, fs.writeFile].map(fn => util.promisify(fn));

/**
 * Searches for a file by name within a directory tree, excluding 'node_modules'.
 * * @param {string} dir - The starting directory path.
 * @param {string} fileName - The name of the file to locate.
 * @returns {string|null} The absolute path to the found file, or null if not found.
 */
const findFileRecursive = (dir, fileName) => {
    if (dir.includes('node_modules')) return null;
    const files = fs.readdirSync(dir, {withFileTypes: true});
    for (const file of files) {
        const res = path.resolve(dir, file.name);
        if (file.isDirectory()) {
            const found = findFileRecursive(res, fileName);
            if (found) return found;
        } else if (file.name === fileName) {
            return res;
        }
    }
    return null;
};

/**
 * Initializes the PDF link creator with project-specific paths.
 * * @param {Object} config - Configuration object.
 * @param {string} config.pathToDocsifyEntryPoint - Absolute path to the Docsify root folder.
 * @param {string} config.pathToStatic - Path to the directory where the output files are stored.
 * @param {string} config.mainMdFilename - The name of the main combined Markdown file.
 * @returns {function(): Promise<Object[]>} An asynchronous function that processes the document.
 */
const createPdfLinks = ({pathToDocsifyEntryPoint, pathToStatic, mainMdFilename}) =>
  /**
   * Merges linked .md files into the main file, fixes image paths, and generates an anchor map.
   * * @async
   * @returns {Promise<Object[]>} A promise resolving to an array of anchor objects containing file paths and header text.
   */
  async () => {

      logger.info("Creating PDF links");

      const absoluteStaticPath = path.resolve(pathToDocsifyEntryPoint, pathToStatic);
      const mainFilePath = path.resolve(absoluteStaticPath, mainMdFilename);
      const mainFileContent = await readFile(mainFilePath, 'utf8');
      const mainLines = mainFileContent.split(/\r?\n/);

      // Regex for standard Markdown links and Docsify specific ID links
      const mdLinksRegex = /\[.*?\]\(\s*(.*?\.md(?:\s+?':.*?')?)\s*\)/g;
      const idLinksRegex = /\[.*?\]\(\s*([^)\s]+\?id=[^)\s]+)\s*\)/g;

      // Process standard Markdown links
      const mdLinks = [...mainFileContent.matchAll(mdLinksRegex)]
      .filter(match => !match[1].startsWith("http"))
      .map(match => {
          const cleanPath = match[1].split("'")[0].trim();
          return {fullMatch: match[0], cleanPath: cleanPath};
      });

      const idLinks = [...mainFileContent.matchAll(idLinksRegex)].filter(match => !match[1].startsWith("http"));
      const anchors = [];

      logger.info(`Links to markdown files: ${JSON.stringify(mdLinks, null, 2)}`);
      logger.info(`Links to # refrences in markdown files: ${JSON.stringify(idLinks, null, 2)}`);

      // First Loop: Merging content from linked .md files
      for (const link of mdLinks) {
          let filePath = path.resolve(pathToDocsifyEntryPoint, link.cleanPath);
          if (!exists(filePath)) {
              logger.info(`Searching for file ${path.basename(filePath)} recursively`);
              const fileNameOnly = path.basename(link.cleanPath);
              filePath = findFileRecursive(pathToDocsifyEntryPoint, fileNameOnly);
          }

          if (exists(filePath)) {
              logger.success(`${filePath} found !!!`);
              let fileContent = await readFile(filePath, "utf-8");
              if (checkForPng(fileContent)) {
                  logger.info("Found photo inside file");
                  fileContent = beautifyImages({pathToDocsifyEntryPoint, pathToStatic})(fileContent, filePath);
              }

              const lines = fileContent.split(/\r?\n/);
              const firstContentfulLine = lines.find(line => line.trim().length > 0);

              // If the file starts with a header and is not an ':include', treat it as a navigation anchor
              if (firstContentfulLine && firstContentfulLine.includes('#') && !link.fullMatch.includes(":include")) {
                  logger.info(`Found anchor: ${firstContentfulLine.trim()}`);
                  logger.info(`For file: ${link.cleanPath}`);
                  anchors.push({
                      file: link.cleanPath,
                      anchorText: firstContentfulLine.trim()
                  });
              } else {

                  logger.info("Could not find anchor in file. Injecting into main markdown file");
                  // Otherwise, replace the link in the main file with the actual file content
                  if (fileContent) {
                      for (let i = 0; i < mainLines.length; i++) {
                          if (mainLines[i].includes(link.fullMatch)) {
                              mainLines[i] = mainLines[i].replace(link.fullMatch, fileContent.trim());
                          }
                      }
                  }
              }
          } else {
              logger.warn(`File does not exist: ${filePath}`);
          }
      }

      // Save initial merge results
      await writeFile(mainFilePath, mainLines.join('\n'));

      // Second Loop: Resolving Docsify internal ID links (?id=anchor)
      for (const link of idLinks) {
          const extractedFilePath = link[1].split("?")[0] + ".md";
          const fileName = extractedFilePath.split("/").pop();
          const extractedFileAnchor = link[1].split("?id=")[1];
          let filePath = path.resolve(pathToDocsifyEntryPoint, extractedFilePath);

          if (!exists(filePath)) {
              logger.info(`Searching for file ${path.basename(filePath)} recursively`);
              filePath = findFileRecursive(pathToDocsifyEntryPoint, fileName);
          }

          if (exists(filePath)) {
              let fileContent = await readFile(filePath, "utf-8");

              // Fix image paths within these linked sections
              if (checkForPng(fileContent)) {
                  logger.info("Found photo inside file");
                  fileContent = beautifyImages({pathToDocsifyEntryPoint, pathToStatic})(fileContent, filePath);
              }

              // Normalize anchor text for comparison with headers in the main document
              const fileAnchor = extractedFileAnchor.split('-').join(' ');
              const anchorLine = mainLines.find(line => {
                  const normalizedLine = line.toLowerCase().replace(/[^a-z0-9#]/g, '');
                  const normalizedAnchor = fileAnchor.toLowerCase().replace(/[^a-z0-9]/g, '');
                  return normalizedLine.includes(normalizedAnchor) && normalizedLine.startsWith("#");
              });

              if (anchorLine) {
                  logger.info(`Found anchorLine: ${anchorLine.trim()}`);
                  logger.info(`For file: ${link[1]}`);
                  anchors.push({
                      file: link[1],
                      anchorText: anchorLine.trim()
                  });
              }
          }
      }
      await writeFile(mainFilePath, mainLines.join('\n'));
      return anchors;
  };

/**
 * Scans content to check if it contains any references to .png files.
 * * @param {string} fileContent - The string content to scan.
 * @returns {boolean} True if '.png' is found in any line.
 */
const checkForPng = (fileContent) => {
    const lines = fileContent.split(/\r?\n/);
    for (const line of lines) {
        if (line.includes(".png")) return true;
    }
    return false;
}

/**
 * Exports the PDF link creation utility.
 * * @param {Object} config - Configuration settings.
 * @returns {Object} Initialized createPdfLinks function.
 */
module.exports = config => ({
    createPdfLinks: createPdfLinks(config),
});
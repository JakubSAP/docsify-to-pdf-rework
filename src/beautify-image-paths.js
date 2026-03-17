/**
 * @fileoverview Normalizes image paths within Markdown files.
 * This module transforms relative image links so they remain valid when partial
 * Markdown files are included or merged into a main documentation file.
 */

const path = require("path");
const markdownLinkExtractor = require("markdown-link-extractor");
const isUrl = require("is-url");
const logger = require("./logger.js");

/**
 * Checks if a given file path points to an image file based on its extension.
 * * @param {string} filePath - The file path or name to verify.
 * @returns {boolean} True if the extension is a supported image format (.jpg, .png, .gif, .svg, .jpeg).
 */
const isImg = filePath => {
    const extName = path.parse(filePath).ext;
    return [".jpg", ".png", ".gif", ".svg", ".jpeg"].includes(extName.toLowerCase());
};

/**
 * Initializes the image path beautifier with project configuration.
 *
 * @param {Object} config - Configuration object.
 * @param {string} config.pathToDocsifyEntryPoint - The absolute path to the Docsify root directory.
 * @param {string} config.pathToStatic - The relative path from the entry point to the target output directory (where main.md lives).
 * @returns {function(string, string): string} A processor function that accepts (content, filePath).
 */
module.exports = ({pathToDocsifyEntryPoint, pathToStatic}) =>
  /**
   * Processes Markdown content by updating image paths to be relative to the target main folder.
   *
   * @param {string} content - The raw Markdown content to be processed.
   * @param {string} filePath - The absolute path to the specific Markdown file currently being read.
   * @returns {string} The transformed Markdown content with corrected image paths.
   */
    (content, filePath) => {
      let markdown = content;

      // The absolute path of the directory where the final document (main.md) is located
      const mainMdFolder = path.resolve(pathToDocsifyEntryPoint, pathToStatic);

      // The absolute directory path of the current partial file being processed
      const currentFileDir = path.dirname(filePath);

      markdownLinkExtractor(content)
      .filter(link => !isUrl(link))
      .filter(isImg)
      .map(link => {
          logger.info(`link: ${link}`);
          // Resolve the image's actual location on the local disk
          const absoluteImgPath = path.resolve(currentFileDir, link);
          logger.info(`absolute: ${absoluteImgPath}`);
          // Calculate the relative path from the final main.md folder to the image file
          let relativeToMain = path.relative(mainMdFolder, absoluteImgPath);

          // Ensure the path starts with './' if it is a relative path not starting with '..'
          // This prevents links like 'localizedLabels.md' and forces './localizedLabels.md'

          if (!relativeToMain.startsWith('.')) {
              relativeToMain = `./${relativeToMain}`;
          }
          logger.info(`relative: ${relativeToMain}`);
          return {
              origin: link,
              processed: relativeToMain
          };
      })
      .forEach(({origin, processed}) => {
          // Escape special characters in the original path to safely use it in a Regular Expression
          const safeOrigin = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          // Globally replace all occurrences of the original path with the new relative path
          markdown = markdown.replace(new RegExp(safeOrigin, 'g'), processed);
      });

      return markdown;
  };
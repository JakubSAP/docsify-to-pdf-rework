/**
 * @fileoverview Merges a collection of Markdown files into a single master file.
 * This module facilitates document assembly by reading a list of file paths,
 * correcting their internal image links, wrapping sections in identifiable containers,
 * and optionally inserting page breaks for PDF formatting.
 */

const fs = require("fs");
const util = require("util");
const path = require("path");
const logger = require("./logger.js");
const beautifyImages = require("./beautify-image-paths.js");

// Promisifying filesystem methods for cleaner async/await syntax
const [readFile, writeFile, exists] = [fs.readFile, fs.writeFile, fs.exists].map(fn => util.promisify(fn),);

/**
 * Initializes the Markdown combiner with project and output configurations.
 * * @param {Object} config - The configuration object.
 * @param {string|string[]} config.contents - The source reference used for error reporting (usually the sidebar file).
 * @param {string} config.pathToStatic - The relative directory where the combined file will be stored.
 * @param {string} config.mainMdFilename - The name of the final combined Markdown file.
 * @param {string} config.pathToDocsifyEntryPoint - The absolute path to the project root directory.
 * @param {Object} config.pageBreak - Configuration for page separation.
 * @param {boolean} config.pageBreak.enabled - Whether to insert custom separators between files.
 * @param {string} config.pageBreak.type - The type of separator (e.g., 'div').
 * @param {string} config.pageBreak.html - Custom HTML string for page breaks.
 * @returns {function(string[]): Promise<string>} An async function that takes a list of file paths and returns the final file path.
 */
const combineMarkdowns = ({contents, pathToStatic, mainMdFilename, pathToDocsifyEntryPoint, pageBreak}) =>
  /**
   * Reads, processes, and joins multiple Markdown files into one.
   * * @async
   * @param {string[]} links - An array of absolute file paths to be combined.
   * @throws {Error} Throws an error if any file in the list does not exist on disk.
   * @returns {Promise<string>} A promise resolving to the absolute path of the generated master file.
   */
  async links => {
      try {
          // Read all files in the roadmap and verify existence
          const files = await Promise.all(await links.map(async filename => {
              const fileExist = await exists(filename);

              if (fileExist) {
                  const content = await readFile(filename, {
                      encoding: "utf8",
                  });

                  return {
                      content, name: filename,
                  };
              }

              throw new Error(`file ${filename} is not exist, but listed in ${contents}`);
          }),);

          const resultFilePath = path.resolve(pathToDocsifyEntryPoint, pathToStatic, mainMdFilename);

          try {
              // Determine the separator between files based on pageBreak settings
              const separator = pageBreak && pageBreak.enabled && pageBreak.type === 'div'
                ? (pageBreak.html || "\n\n<div style='page-break-after: always;'></div>\n\n")
                : "\n\n\n\n";

              const content = files
              .map(({content, name}) => {
                  const fileName = path.basename(name);
                  // Correct image paths within each file so they point to the right location from the output file's perspective
                  const beautifiedContent = beautifyImages({pathToDocsifyEntryPoint, pathToStatic})(content, name);

                  // Wrap content in a div with an ID for internal anchor navigation
                  return `\n\n<div id="${fileName}"></div>\n\n${beautifiedContent}`;
              })
              .join(separator);

              await writeFile(resultFilePath, content);
          } catch (e) {
              logger.err(e);
              throw e;
          }

          return resultFilePath;
      } catch (err) {
          logger.err("combineMarkdowns", err);
          throw err;
      }
  };

/**
 * Exports the combineMarkdowns utility.
 * * @param {Object} config - The configuration object for paths and formatting.
 * @returns {Object} An object containing the initialized combineMarkdowns function.
 */
module.exports = config => ({
    combineMarkdowns: combineMarkdowns(config),
});
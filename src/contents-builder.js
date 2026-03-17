/**
 * @fileoverview Extracts a flat list of absolute file paths from Docsify sidebar files.
 * This module parses Markdown links within sidebars to build a sequence (roadmap)
 * of documents to be processed or merged.
 */

const fs = require("fs");
const util = require("util");
const path = require("path");
const markdownLinkExtractor = require("markdown-link-extractor");
const isUrl = require("is-url");
const {flatten} = require("lodash");

const [readFile] = [fs.readFile].map(fn => util.promisify(fn));

/**
 * Initializes the roadmap creator with the provided sidebar configuration.
 *
 * @param {Object} config - Configuration object.
 * @param {string|string[]} config.contents - A single path or an array of paths to sidebar Markdown files (e.g., '_sidebar.md').
 * @returns {function(): Promise<string[]>} An asynchronous function that, when executed, returns the roadmap.
 */
const createRoadMap = ({contents}) =>
  /**
   * Parses the sidebar files and returns a flattened array of absolute paths to local Markdown files.
   *
   * @async
   * @returns {Promise<string[]>} A promise resolving to an array of absolute system paths to the documents.
   */
  async () => {
      let contentsPaths = Array.isArray(contents) ? contents : [contents];

      // Map sidebar filenames to their directory and absolute file paths
      const sidebarFilePaths = contentsPaths.map(sidebarFileName => {
          const a = path.dirname(path.resolve(sidebarFileName));
          const b = path.resolve(sidebarFileName);
          return {dir: a, filePath: b};
      });

      // Read all sidebar files in parallel to optimize performance
      const sidebarFileContents = await Promise.all(sidebarFilePaths.map(async ({dir, filePath}) => ({
          dir, file: await readFile(filePath, {encoding: "utf8"}),
      })),);

      /**
       * Internal extraction logic:
       * 1. Extracts all links from the sidebar content.
       * 2. Filters out anchor links (containing '#').
       * 3. Filters out external URLs.
       * 4. Filters out directories (ensuring only files are targeted).
       * 5. Resolves relative links to absolute system paths.
       */
      const contentsArray = sidebarFileContents.map(({file, dir}) => markdownLinkExtractor(file)
        .filter(link => !String(link).includes("#"))
        .filter(link => !isUrl(link) && !(fs.lstatSync(path.resolve(dir, link)).isDirectory()))
        .map(link => path.resolve(dir, link)),
      );

      // Flatten the array of arrays into a single list of paths
      return await flatten(contentsArray);
  };

/**
 * Exports the roadmap creation tool.
 * * @param {Object} config - Configuration object containing the 'contents' property.
 * @returns {Object} An object containing the initialized createRoadMap function.
 */
module.exports = config => ({
    createRoadMap: createRoadMap(config),
});
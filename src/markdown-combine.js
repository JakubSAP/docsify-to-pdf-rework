const fs = require("fs");
const util = require("util");
const path = require("path");
const logger = require("./logger.js");
const beautifyImages = require("./beautify-image-paths.js");

const [readFile, writeFile, exists] = [fs.readFile, fs.writeFile, fs.exists].map(fn =>
  util.promisify(fn),
);

const combineMarkdowns = ({ contents, pathToStatic, mainMdFilename, pathToDocsifyEntryPoint, pageBreak }) => async links => {
  try {
    const files = await Promise.all(
      await links.map(async filename => {
        const fileExist = await exists(filename);

        if (fileExist) {
          const content = await readFile(filename, {
            encoding: "utf8",
          });

          return {
            content,
            name: filename,
          };
        }

        throw new Error(`file ${filename} is not exist, but listed in ${contents}`);
      }),
    );
      const resultFilePath = path.resolve(pathToDocsifyEntryPoint, pathToStatic, mainMdFilename);

    try {
      // 根据配置决定是否添加分页符
      const separator = pageBreak && pageBreak.enabled && pageBreak.type === 'div' 
        ? (pageBreak.html || "\n\n<div style='page-break-after: always;'></div>\n\n")
        : "\n\n\n\n";

        const content = files
            .map(({ content, name }) => {
                const fileName = path.basename(name);
                const beautifiedContent = beautifyImages({ pathToDocsifyEntryPoint, pathToStatic })(content, name);
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

module.exports = config => ({
  combineMarkdowns: combineMarkdowns(config),
});

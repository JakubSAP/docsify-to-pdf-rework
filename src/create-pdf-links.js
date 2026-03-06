const fs = require("fs");
const util = require("util");
const path = require("path");
const markdownLinkExtractor = require("markdown-link-extractor");
const isUrl = require("is-url");
const { flatten } = require("lodash");
const logger = require("./logger.js");
const {exists} = require("docsify-cli/lib/util");

const [readFile] = [fs.readFile].map(fn => util.promisify(fn));

const findFileRecursive = (dir, fileName) => {
    if (dir.includes('node_modules')) return null;
    const files = fs.readdirSync(dir, { withFileTypes: true });

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

const createPdfLinks = ({ pathToDocsifyEntryPoint, pathToStatic, mainMdFilename }) => async () => {

    const absoluteStaticPath = path.resolve(pathToDocsifyEntryPoint, pathToStatic);
    const mainFilePath = path.resolve(absoluteStaticPath, mainMdFilename);
    const mainFileContent = await readFile(mainFilePath, 'utf8');
    const regex = /\[.*?\]\(\s*(.*?\.md)\s*\)/g;
    let links = [...mainFileContent.matchAll(regex)].map(match => match[1]);
    links = links.filter(link => !link.startsWith("http"));
    logger.info("tutaj");
    logger.info(links);
    links = new Set(links);
    const anchors = [];
    for (const fileName of links) {
        let filePath = path.resolve(pathToDocsifyEntryPoint,fileName);
        logger.info(`szukanie 1: ${filePath}`);
        if(!exists(filePath)){
            const fileNameOnly = path.basename(fileName);
            filePath = findFileRecursive(pathToDocsifyEntryPoint, fileNameOnly);
            logger.info(`szukanie 2: ${filePath}`);
        }
        if(exists(filePath)){
            logger.info(`znaleziono: ${filePath}`);
            const fileContent = await readFile(filePath, "utf-8");
            const lines = fileContent.split(/\r?\n/);
            const firstContentfulLine = lines.find(line => line.trim().length > 0);
            const shortFileName = fileName.split("/").pop();
            if (firstContentfulLine) {
                anchors.push({
                    file: shortFileName,
                    anchorText: firstContentfulLine.trim()
                });
            }
        }else{
            logger.warn(`File does not exist: ${filePath}`);
        }
    }
    const anchorsMap = Object.fromEntries(
        anchors.map(item => [item.file, item.anchorText])
    );

    return anchorsMap;
};

module.exports = config => ({
    createPdfLinks: createPdfLinks(config),
});

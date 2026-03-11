const fs = require("fs");
const util = require("util");
const path = require("path");
const logger = require("./logger.js");
const {exists} = require("docsify-cli/lib/util");
const beautifyImages = require("./beautify-image-paths.js");

const [readFile, writeFile] = [fs.readFile, fs.writeFile].map(fn => util.promisify(fn));

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

const createPdfLinks = ({pathToDocsifyEntryPoint, pathToStatic, mainMdFilename}) => async () => {

    const absoluteStaticPath = path.resolve(pathToDocsifyEntryPoint, pathToStatic);
    const mainFilePath = path.resolve(absoluteStaticPath, mainMdFilename);
    const mainFileContent = await readFile(mainFilePath, 'utf8');
    const mainLines = mainFileContent.split(/\r?\n/);
    const regex = /\[.*?\]\(\s*(.*?\.md(?:\s+?':.*?')?)\s*\)/g;
    const idLinksRegex = /\[.*?\]\(\s*([^)\s]+\?id=[^)\s]+)\s*\)/g;
    const links = [...mainFileContent.matchAll(regex)]
    .filter(match => !match[1].startsWith("http"))
    .map(match => {
        const cleanPath = match[1].split("'")[0].trim();
        return {
            fullMatch: match[0], cleanPath: cleanPath
        };
    });
    const links2 = [...mainFileContent.matchAll(idLinksRegex)].filter(match => !match[1].startsWith("http"));
    const anchors = [];
    for (const link of links) {
        let filePath = path.resolve(pathToDocsifyEntryPoint, link.cleanPath);
        if (!exists(filePath)) {
            const fileNameOnly = path.basename(link.cleanPath);
            filePath = findFileRecursive(pathToDocsifyEntryPoint, fileNameOnly);
        }
        if (exists(filePath)) {
            const fileContent = await readFile(filePath, "utf-8");
            const containsPng = checkForPng(fileContent);
            if (containsPng) {
                const content = beautifyImages({pathToDocsifyEntryPoint, pathToStatic})(fileContent, filePath);
                await writeFile(filePath, content);
            }
            const lines = fileContent.split(/\r?\n/);
            const firstContentfulLine = lines.find(line => line.trim().length > 0);
            if (firstContentfulLine && firstContentfulLine.includes('#') && !link.fullMatch.includes(":include")) {
                anchors.push({
                    file: link.cleanPath, anchorText: firstContentfulLine.trim()
                });
            } else {
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
    await writeFile(mainFilePath, mainLines.join('\n'));
    for (link of links2) {
        const extractedFilePath = link[1].split("?")[0] + ".md";
        const fileName = extractedFilePath.split("/").pop();
        const extractedFileAnchor = link[1].split("?id=")[1];
        let filePath = path.resolve(pathToDocsifyEntryPoint, extractedFilePath)
        const fileContent = await readFile(filePath, "utf-8");
        const containsPng = checkForPng(fileContent);
        if (containsPng) {
            const content = beautifyImages({pathToDocsifyEntryPoint, pathToStatic})(fileContent, filePath);
            await writeFile(filePath, content);
        }
        if (!exists(filePath)) {
            filePath = findFileRecursive(pathToDocsifyEntryPoint, fileName)
        }
        if (exists(filePath)) {
            const fileAnchor = extractedFileAnchor
            .split('-')
            .join(' ');
            const anchorLine = mainLines.find(line => {
                const normalizedLine = line.toLowerCase().replace(/[^a-z0-9#]/g, '');
                const normalizedAnchor = fileAnchor.toLowerCase().replace(/[^a-z0-9]/g, '');
                return normalizedLine.includes(normalizedAnchor) && normalizedLine.startsWith("#");
            });
            anchors.push({
                file: link[1], anchorText: anchorLine.trim()
            });
        }
    }

    await writeFile(mainFilePath, mainLines.join('\n'));
    return anchors;
};

const checkForPng = (fileContent) => {
    const lines = fileContent.split(/\r?\n/);
    for (line of lines) {
        if (line.includes(".png")) return true;
    }
    return false;
}
module.exports = config => ({
    createPdfLinks: createPdfLinks(config),
});

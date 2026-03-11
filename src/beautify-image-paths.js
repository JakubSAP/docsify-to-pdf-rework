const path = require("path");
const markdownLinkExtractor = require("markdown-link-extractor");
const isUrl = require("is-url");

const isImg = filePath => {
    const extName = path.parse(filePath).ext;
    return [".jpg", ".png", ".gif", ".svg", ".jpeg"].includes(extName.toLowerCase());
};

module.exports = ({pathToDocsifyEntryPoint, pathToStatic}) => (content, filePath) => {
    let markdown = content;

    const mainMdFolder = path.resolve(pathToDocsifyEntryPoint, pathToStatic);

    const currentFileDir = path.dirname(filePath);

    markdownLinkExtractor(content)
    .filter(link => !isUrl(link))
    .filter(isImg)
    .map(link => {
        const absoluteImgPath = path.resolve(currentFileDir, link);
        const relativeToMain = path.relative(mainMdFolder, absoluteImgPath);
        return {
            origin: link,
            processed: relativeToMain
        };
    })
    .forEach(({origin, processed}) => {
        const safeOrigin = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        markdown = markdown.replace(new RegExp(safeOrigin, 'g'), processed);
    });

    return markdown;
};
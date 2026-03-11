const path = require("path");
const puppeteer = require("puppeteer");
const logger = require("./logger.js");
const fs = require("fs");
const runSandboxScript = require("./run-sandbox-script.js");
const util = require("util");

const [readFile, writeFile, exists] = [fs.readFile, fs.writeFile, fs.exists].map(fn => util.promisify(fn),);

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
        const docsifyUrl = `http://localhost:${docsifyRendererPort}/#/${pathToStatic}/${mainMdFilenameWithoutExt}`;
        const page = await browser.newPage();
        await page.goto(docsifyUrl, {waitUntil: "networkidle0"});

        const renderProcessingErrors = await runSandboxScript(page, anchors, {
            mainMdFilenameWithoutExt, pathToStatic,
        });

        if (renderProcessingErrors.length) logger.warn("anchors processing errors", renderProcessingErrors);

        await page.emulateMediaType(emulateMedia);
        // 根据配置添加分页符样式
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

        await page.pdf({
            ...pdfOptions, path: path.resolve(pathToPublic),
        });

        // return await browser.close();
    } catch (e) {
        // await browser.close();
        throw e;
    }
};

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
                   }) => async (anchors) => {
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
        await closeProcess(1);
    }
};

module.exports = config => ({
    htmlToPdf: htmlToPdf(config),
});

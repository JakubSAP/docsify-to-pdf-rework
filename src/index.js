/**
 * @fileoverview Main orchestrator for the Docsify-to-PDF conversion pipeline.
 * This module manages the lifecycle of the build process, including configuration
 * merging, environment setup, content aggregation, and PDF rendering.
 */

const path = require("path");
const {merge} = require("lodash");
const logger = require("./logger.js");
const getFreePorts = require("./free-port.js");

/**
 * Default configuration settings for the PDF generation process.
 * These values are used if specific settings are not provided in the incoming config.
 */
const defaultConfig = {
    pathToStatic: "static",           // Directory for intermediate static files
    mainMdFilename: "main.md",       // Name of the combined master Markdown file
    removeTemp: true,                 // Whether to delete temporary files after completion
    contents: "docs/_sidebar.md",     // Source file(s) defining the document structure
    pathToPublic: "./pdf/readme.pdf", // Output destination for the final PDF
    pdfOptions: {format: "A4"},      // Puppeteer-specific PDF export settings
    emulateMedia: "print",            // CSS media type to emulate during rendering
    pathToDocsifyEntryPoint: ".",    // Root directory of the Docsify project
};

/**
 * Executes the full documentation-to-PDF workflow.
 * * The process follows these steps:
 * 1. Port allocation and configuration merging.
 * 2. Environment cleanup and preparation.
 * 3. Generation of a roadmap based on sidebar/content files.
 * 4. Merging multiple Markdown files into one master document.
 * 5. Resolving internal links and generating navigation anchors.
 * 6. Starting a local Docsify server instance.
 * 7. Rendering the document to PDF via a headless browser.
 * 8. Cleanup and process termination.
 *
 * @async
 * @param {Object} incomingConfig - User-provided configuration to override defaults.
 * @returns {Promise<void>} Resolves when the PDF has been successfully generated.
 */
const run = async incomingConfig => {
    // Dynamically find available ports for the internal Docsify server
    const [docsifyRendererPort, docsifyLiveReloadPort] = await getFreePorts();
    const preBuildedConfig = merge(defaultConfig, incomingConfig);

    logger.info("Build with settings:");
    console.log(JSON.stringify(preBuildedConfig, null, 2));
    console.log("\n");

    const config = merge(preBuildedConfig, {
        docsifyRendererPort, docsifyLiveReloadPort,
    });

    // Initialize sub-modules with the merged configuration
    const {combineMarkdowns} = require("./markdown-combine.js")(config);
    const {closeProcess, prepareEnv, cleanUp} = require("./utils.js")(config);
    const {createRoadMap} = require("./contents-builder.js")(config);
    const {runDocsifyRenderer} = require("./docsify-server.js")(config);
    const {htmlToPdf} = require("./render.js")(config);
    const {createPdfLinks} = require("./create-pdf-links")(config);

    try {
        // Step 1: Clean and prepare the workspace
        await cleanUp();
        await prepareEnv();

        // Step 2: Build the list of files to be included
        const roadMap = await createRoadMap();

        // Step 3: Combine all Markdown files into a single source
        await combineMarkdowns(roadMap);

        // Step 4: Fix links and collect anchor points for navigation
        const anchors = await createPdfLinks()

        // Step 5: Start the local web server to host the documentation
        runDocsifyRenderer();

        // Step 6: Trigger Puppeteer to capture the page and save as PDF
        await htmlToPdf(anchors);

        logger.success(path.resolve(config.pathToPublic));
    } catch (error) {
        logger.err("run error", error);
    } finally {
        // Ensure the process exits cleanly (closes server and browser)
        // closeProcess(0);
    }
};

module.exports = run;
/**
 * @fileoverview Client-side sandbox script for DOM manipulation and link fixing.
 * This module is injected into the Puppeteer page to sanitize the UI, fix internal
 * Markdown navigation, and resolve URL-encoded anchor tags for PDF compatibility.
 */

/**
 * Executes a series of DOM transformations within the browser page.
 * * @async
 * @param {import('puppeteer').Page} page - The Puppeteer page instance.
 * @param {Object[]} anchors - Array of anchor objects (file paths and header text).
 * @param {Object} config - Configuration object.
 * @param {string} config.mainMdFilenameWithoutExt - The base name of the main MD file.
 * @param {string} config.pathToStatic - Path to the static assets directory.
 * @returns {Promise<Object[]>} A promise resolving to an array of processing errors encountered in the browser.
 */
module.exports = async (page, anchors, {mainMdFilenameWithoutExt, pathToStatic}) => {
    // Inject Lodash into the browser context to assist with collection manipulation
    await page.addScriptTag({
        url: "https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.11/lodash.min.js",
    });
    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);
    });
    return page.evaluate(({mainMdFilenameWithoutExt, pathToStatic, anchors}) => {
        const errors = [];

        /**
         * Repairs internal Markdown links by converting file-based paths into anchor IDs.
         * * This function scans the document for links starting with `#/`, matches them
         * against a provided `anchors` array, and transforms them into valid HTML
         * fragment identifiers (e.g., changing `#/docs/setup.md` to `#setup`).
         * * @function fixMarkdownLinks
         * @returns {void}
         */
        const fixMarkdownLinks = () => {
            /**
             * Normalizes a file path by removing the .md extension and leading path symbols.
             * @param {string} p - The raw path string.
             * @returns {string} The cleaned, normalized path.
             */
            const normalizePath = (p) => {
                if (!p) return "";
                return p
                // 1. Remove '.md' only if it is at the very end of the string ($)
                .replace(/\.md$/, '')
                // 2. Remove any combination of './', '/', or '.' from the start (^) of the string
                // The '+' ensures it catches multiple levels like '../../'
                .replace(/^(\.\/|\/|\.)+/, '');
            };

            const normalizedAnchors = anchors.map(a => ({
                ...a,
                cleanFile: normalizePath(a.file)
            }));

            const linkElements = [...document.querySelectorAll('a')].filter(link => {
                const href = link.getAttribute('href');
                return href && href.startsWith("#/");
            });

            console.log(`Normalized Anchors: ${normalizedAnchors.length}`);
            console.log(`Internal Links found: ${linkElements.length}`);

            for (const link of linkElements) {
                const rawHref = link.getAttribute('href').slice(2);
                const cleanHrefPath = normalizePath(rawHref);

                const foundAnchor = normalizedAnchors.find(a => a.cleanFile === cleanHrefPath);

                if (foundAnchor) {
                    const rawText = foundAnchor.anchorText;

                    // Generate a URL-friendly slug from the heading text
                    const targetId = rawText
                    .toLowerCase()
                    .replace(/^#+\s*/, '')      // Remove Markdown header symbols
                    .trim()                     // Remove surrounding whitespace
                    .replace(/[^\w\s-]/g, '')   // Strip special characters
                    .replace(/\s+/g, '-');      // Convert spaces to hyphens

                    link.href = '#' + targetId;

                    // Internal links shouldn't open in a new tab
                    link.removeAttribute('target');

                    console.log(`Fixed: ${cleanHrefPath} -> #${targetId}`);
                } else {
                    console.warn(`No anchor found for: ${cleanHrefPath}`);
                }
            }
        };

        /**
         * Cleans up the Docsify UI for a "Print" layout.
         * Removes sidebars, navbars, and toggles; forces tabs and details to be expanded.
         */
        const makeDocsifyPrettyPrintable = () => {
            // Remove UI elements that shouldn't appear in a PDF
            const nav = document.querySelector("nav");
            if (nav) nav.remove();

            const aside = document.querySelector("aside.sidebar");
            if (aside) aside.remove();

            const button = document.querySelector("button.sidebar-toggle");
            if (button) button.remove();

            // Expand all collapsible elements
            const details = document.querySelectorAll("details");
            if (details) {
                details.forEach(d => d.open = true);
            }

            // Show content of all tabs
            const tabContents = document.querySelectorAll(".docsify-tabs__tab");
            tabContents.forEach(content => {
                content.classList.add("docsify-tabs__tab--active");
            });

            // Reset content positioning for standard document flow
            document.querySelector("section.content").style = `
                position: static;
                padding-top: 0;
            `;
        };

        /**
         * Generates a random alphanumeric string for safe ID mapping.
         * @param {number} length - Desired string length.
         * @returns {string}
         */
        function randomString(length) {
            let text = "";
            const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
            for (var i = 0; i < length; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
            return text;
        }

        /**
         * Handles "unsafe" IDs (containing special characters or encodings) by
         * remapping them to safe, randomly generated IDs.
         */
        const setSafeTagToHref = (anchorNodes, unsafeTag) => {
            const safeId = randomString(10);
            anchorNodes.forEach(node => { node.href = `#${safeId}`; });

            try {
                // Decode and sanitize the original Docsify header ID
                const headerId = decodeURIComponent(unsafeTag).replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, "");
                const anchorTarget = document.querySelector(`#${headerId}`);
                if (anchorTarget) anchorTarget.id = safeId;
            } catch (e) {
                errors.push({
                    processingAnchor: decodeURIComponent(unsafeTag),
                    error: e.message,
                    stack: e.stack,
                });
            }
        };

        const processSafeInternalLinks = links => {
            links.forEach(({node, id}) => (node.href = `#${id}`));
        };

        const processUnSafeInternalLinks = unsafeInternalLinks => {
            _.chain(unsafeInternalLinks)
            .groupBy("id")
            .transform((result, value, key) => {
                result[key] = value.map(({node}) => node);
            }, {})
            .forOwn(setSafeTagToHref)
            .value();
        };

        /**
         * Locates all internal Docsify links within the merged document.
         */
        const extractInternalLinks = () => {
            const allInternalLinks = [...document.querySelectorAll(`[href*="#/${pathToStatic}/${mainMdFilenameWithoutExt}?id="]`)].map(node => {
                const [, id] = node.href.split("id=");
                return {node, id};
            });

            return allInternalLinks.reduce(([safe, unsafe], elem) =>
                elem.id === window.decodeURIComponent(elem.id)
                  ? [[...safe, elem], unsafe]
                  : [safe, [...unsafe, elem]],
              [[], []]
            );
        };

        const processAnchors = () => {
            const [safeInternalLinks, unsafeInternalLinks] = extractInternalLinks();
            processSafeInternalLinks(safeInternalLinks);
            processUnSafeInternalLinks(unsafeInternalLinks);
        };

        /**
         * Orchestrates the browser-side processing.
         */
        const main = () => {
            processAnchors();
            fixMarkdownLinks();
            makeDocsifyPrettyPrintable();
        };

        main();

        return errors;
    }, {mainMdFilenameWithoutExt, pathToStatic, anchors});
};
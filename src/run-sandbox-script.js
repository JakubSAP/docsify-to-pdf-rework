module.exports = async (page, anchors, {mainMdFilenameWithoutExt, pathToStatic}) => {
    await page.addScriptTag({
        url: "https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.11/lodash.min.js",
    });

    page.on('console', msg => console.log('PRZEGLĄDARKA:', msg.text()));
    return page.evaluate(({mainMdFilenameWithoutExt, pathToStatic, anchors}) => {

        const errors = [];
        const fixMarkdownLinks = () => {
            const links = [...document.querySelectorAll('a')].filter(link => {
                const href = link.getAttribute('href');
                return href && href.startsWith("#/");
            })
            anchors = anchors.map(element => {
                if (element.file.includes(".md")) {
                    element.file = element.file.replace(".md", "");
                }
                return element;
            });
            let counter = 0;
            for (link of links) {
                const href = link.getAttribute('href').slice(2);
                if (href) {
                    const foundAnchor = anchors.find(a => a.file === href);
                    if (foundAnchor) {
                        counter++;
                        const rawText = foundAnchor.anchorText;
                        const targetId = rawText
                        .toLowerCase()
                        .replace(/^#+\s*/, '')
                        .trim()
                        .replace(/[^\w\s-]/g, '')
                        .replace(/\s+/g, '-');
                        link.href = '#' + targetId;
                        link.removeAttribute('target');
                    }
                }
            }
        }
        const makeDocsifyPrettyPrintable = () => {
            const nav = document.querySelector("nav");
            if (nav) nav.remove();

            const aside = document.querySelector("aside.sidebar");
            if (aside) aside.remove();

            const button = document.querySelector("button.sidebar-toggle");
            if (button) button.remove();

            const details = document.querySelectorAll("details");
            if (details) {
                details.forEach(details => details.open = true);
            }
            const tabContents = document.querySelectorAll(".docsify-tabs__tab");
            tabContents.forEach(content => {
                content.classList.add("docsify-tabs__tab--active")
            });
            document.querySelector("section.content").style = `
          position: static;
          padding-top: 0;
        `;
        };

        const isSafeTag = tag => tag === window.decodeURIComponent(tag);

        function randomString(length) {
            let text = "";
            const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

            for (var i = 0; i < length; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));

            return text;
        }

        const setSafeTagToHref = (anchorNodes, unsafeTag) => {
            const safeId = randomString(10);

            anchorNodes.forEach(node => {
                node.href = `#${safeId}`;
            });

            try {
                const headerId = decodeURIComponent(unsafeTag).replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, "");
                const anchorTarget = document.querySelector(`#${headerId}`);

                anchorTarget.id = safeId;
            } catch (e) {
                errors.push({
                    processingAnchor: decodeURIComponent(unsafeTag), error: e.message, stack: e.stack,
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

        const extractInternalLinks = () => {
            const allInternalLinks = [...document.querySelectorAll(`[href*="#/${pathToStatic}/${mainMdFilenameWithoutExt}?id="]`,),].map(node => {
                const [, id] = node.href.split("id=");
                return {node, id};
            });

            const [safeInternalLinks, unsafeInternalLinks] = allInternalLinks.reduce(([safe, unsafe], elem) => isSafeTag(elem.id) ? [[...safe, elem], unsafe] : [safe, [...unsafe, elem]], [[], []],);

            return [safeInternalLinks, unsafeInternalLinks];
        };

        const processAnchors = () => {
            const [safeInternalLinks, unsafeInternalLinks] = extractInternalLinks();

            processSafeInternalLinks(safeInternalLinks);
            processUnSafeInternalLinks(unsafeInternalLinks);
        };

        const main = () => {
            processAnchors();
            fixMarkdownLinks();
            makeDocsifyPrettyPrintable();
        };

        main();

        return errors;
    }, {mainMdFilenameWithoutExt, pathToStatic, anchors},);
};

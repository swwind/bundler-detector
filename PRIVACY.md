# Privacy Policy — Web Stack Detector

Web Stack Detector does not collect, store, or transmit any user data.

## What the extension does

When you visit a page, the extension reads that page's own HTML, DOM and
script files (only the ones the page already links to) to detect which
frontend framework, UI library and bundler it was built with. This analysis
happens entirely inside your browser.

## What is stored

The most recent detection result for each open tab is cached locally using
the browser's extension storage API (`chrome.storage` / `browser.storage`),
purely so the popup can show it instantly without rescanning. This data
never leaves your device, is not accessible to the developer, and is
cleared when the tab closes.

## What is sent externally

Nothing. The extension makes no network requests to any server controlled
by the developer or any third party. The only network activity is fetching
the scripts already linked by the page you are viewing, which happens
locally in your browser exactly as it would if you opened DevTools yourself.

## Contact

Questions about this policy: open an issue at
https://github.com/swwind/web-stack-detector/issues

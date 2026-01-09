import params from '@params';

class PostPreview {
    constructor(configuration) {
        this.configuration = configuration;

        /** @type {HTMLElement|null} */
        this.excludeRootNode = null;

        /** @type {boolean} */
        this.excludeSelectorResolved = false;

        /** @type {any|null} */
        this.activeTippyInstance = null;

        /** @type {HTMLAnchorElement|null} */
        this.activeAnchorElement = null;

        /** @type {number} */
        this._defaultTippyDurationShow = 120;

        /** @type {number} */
        this._defaultTippyDurationHide = 110;

        this.fileExtensionRegex =
            /\.(?:png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|mp4|webm|mp3|wav|ogg|flac|pdf|zip|rar|7z|tar|gz|bz2|xz|dmg|exe|msi|apk|ipa|docx?|xlsx?|pptx?|csv|json|xml|yml|yaml|toml|map)$/i;

        this.assetPathRegex =
            /^\/(?:images|img|css|js|fonts|font|assets|static|files)\//i;

        this.htmlExtensionRegex = /\.html?$/i;
    }

    static fromParams() {
        return new PostPreview({
            enable: Boolean(params.enable),
            debug: Boolean(params.debug),
            mobileBp: Number(params.mobileBp || 900),
            disableOnHome: params.disableOnHome !== false,
            excludeSelector: String(params.excludeSelector || ''),
            showDelay: Number(params.showDelay || 120),
            hideDelay: Number(params.hideDelay || 220),
            maxBytes: Number(params.maxBytes || 1200000),
        });
    }

    static boot() {
        const instance = PostPreview.fromParams();
        try {
            instance.init();
        } catch (_) {
        }
    }

    log(...argumentsList) {
        // if (!this.configuration.debug) return;
        // eslint-disable-next-line no-console
        console.log('[post-preview]', ...argumentsList);
    }

    init() {
        this.guardEnvironment();
        this.bindHoverDelegation();
        this.bindThemeSynchronization();
        this.bindScrollHideRules();
    }

    guardEnvironment() {
        if (!this.configuration.enable) throw 0;
        if (window.top !== window.self) throw 0;

        const matchMediaFn = window.matchMedia ? window.matchMedia.bind(window) : null;
        const isMobileLike =
            (window.innerWidth <= this.configuration.mobileBp) ||
            (matchMediaFn && matchMediaFn('(hover: none)').matches) ||
            (matchMediaFn && matchMediaFn('(pointer: coarse)').matches);

        if (isMobileLike) throw 0;
        if (!window.tippy) throw 0;

        if (this.configuration.disableOnHome) {
            const normalizedPathname = (String(window.location.pathname || '/').replace(/\/+$/, '') || '/');
            const isHome =
                normalizedPathname === '/' ||
                /^\/[a-z]{2}(?:-[a-z]{2})?$/i.test(normalizedPathname);

            if (isHome) throw 0;
        }
    }

    getIsDarkTheme() {
        if (typeof window.fixit?.isDark === 'boolean') return window.fixit.isDark;

        const declaredTheme = document.documentElement.getAttribute('data-theme');
        if (declaredTheme) return declaredTheme === 'dark';

        return document.documentElement.classList.contains('dark');
    }

    applyThemeToAllOpenPreviews(isDarkTheme) {
        document.querySelectorAll('.pp-box').forEach((previewBox) => {
            previewBox.classList.toggle('pp--dark', Boolean(isDarkTheme));
        });
    }

    bindThemeSynchronization() {
        this.applyThemeToAllOpenPreviews(this.getIsDarkTheme());

        if (typeof window.fixit?.switchThemeEventSet === 'object') {
            window.fixit.switchThemeEventSet.add((isDarkTheme) => {
                this.applyThemeToAllOpenPreviews(isDarkTheme);
            });
            return;
        }

        new MutationObserver(() => {
            this.applyThemeToAllOpenPreviews(this.getIsDarkTheme());
        }).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'data-theme', 'style'],
        });
    }

    bindHoverDelegation() {
        document.addEventListener(
            'mouseover',
            (mouseEvent) => {
                const anchorElement = mouseEvent.target?.closest?.('a[href]');
                if (!anchorElement) return;
                if (!this.isEligibleAnchor(anchorElement)) return;

                this.mountPreviewForAnchor(anchorElement);
            },
            {passive: true}
        );
    }

    bindScrollHideRules() {
        const hideActiveInstant = () => {
            const instance = this.activeTippyInstance;
            if (!instance) return;
            if (!instance.state?.isShown) return;

            // hide instantly (no animation) just for this hide
            try {
                instance.setProps({duration: [0, 0]});
            } catch {
            }

            try {
                instance.hide();
            } catch {
            }

            queueMicrotask(() => {
                try {
                    instance.setProps({duration: [this._defaultTippyDurationShow, this._defaultTippyDurationHide]});
                } catch {
                }
            });
        };

        const isEventInsideActivePopover = (eventTarget) => {
            const instance = this.activeTippyInstance;
            if (!instance || !instance.state?.isShown) return false;

            const popper = instance.popper;
            if (!popper) return false;

            return Boolean(eventTarget && popper.contains(eventTarget));
        };

        // Capture scroll events from any scrollable element.
        // Scroll doesn't bubble, but it *is* capturable.
        document.addEventListener(
            'scroll',
            (e) => {
                if (!this.activeTippyInstance || !this.activeTippyInstance.state?.isShown) return;

                // if scroll happens inside preview => keep it open
                if (isEventInsideActivePopover(e.target)) return;

                // otherwise => hide immediately
                hideActiveInstant();
            },
            true
        );

        // Wheel is useful when user "tries to scroll" outside (even if page can't scroll further).
        window.addEventListener(
            'wheel',
            (e) => {
                if (!this.activeTippyInstance || !this.activeTippyInstance.state?.isShown) return;

                if (isEventInsideActivePopover(e.target)) return;

                // if user scrolls on the anchor itself, treat it as "outside" (hide)
                // to avoid sticky previews while page moves
                hideActiveInstant();
            },
            {passive: true, capture: true}
        );
    }

    isEligibleAnchor(anchorElement) {
        if (!anchorElement.closest('main')) return false;
        if (anchorElement.closest('header,footer,.tippy-popper')) return false;
        if (this.isBlockedByExcludeSelector(anchorElement)) return false;

        const rawHref = (anchorElement.getAttribute('href') || '').trim();
        if (!rawHref) return false;
        if (rawHref[0] === '#') return false;
        if (/^(mailto:|tel:|javascript:)/i.test(rawHref)) return false;
        if (anchorElement.hasAttribute('download')) return false;

        let resolvedUrl;
        try {
            resolvedUrl = new URL(anchorElement.href, window.location.href);
        } catch {
            return false;
        }

        if (resolvedUrl.origin !== window.location.origin) return false;

        const pathname = resolvedUrl.pathname || '/';
        if (this.assetPathRegex.test(pathname)) return false;
        if (pathname.includes('/favicon.')) return false;
        if (this.fileExtensionRegex.test(pathname)) return false;

        const lastPathSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
        const lastDotIndex = lastPathSegment.lastIndexOf('.');
        if (lastDotIndex !== -1 && !this.htmlExtensionRegex.test(lastPathSegment)) return false;

        return true;
    }

    isBlockedByExcludeSelector(anchorElement) {
        if (!this.configuration.excludeSelector) return false;

        if (!this.excludeSelectorResolved) {
            this.excludeRootNode = document.querySelector(this.configuration.excludeSelector);
            this.excludeSelectorResolved = true;
        }

        return this.excludeRootNode ? this.excludeRootNode.contains(anchorElement) : false;
    }

    createPreviewUI() {
        const previewBox = document.createElement('div');
        previewBox.className = 'pp-box';
        previewBox.classList.toggle('pp--dark', this.getIsDarkTheme());

        const headerElement = document.createElement('div');
        headerElement.className = 'pp-head';

        const breadcrumbPathElement = document.createElement('div');
        breadcrumbPathElement.className = 'pp-path';

        const hostLinkElement = document.createElement('a');
        hostLinkElement.className = 'pp-url';
        hostLinkElement.target = '_blank';
        hostLinkElement.rel = 'noopener';

        const closeButtonElement = document.createElement('button');
        closeButtonElement.className = 'pp-close';
        closeButtonElement.type = 'button';
        // closeButtonElement.textContent = '×';
        closeButtonElement.innerHTML = `<svg class="pp-close__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"> <path d="M6 6L18 18M18 6L6 18"></path></svg>`;

        const bodyElement = document.createElement('div');
        bodyElement.className = 'pp-body';

        const documentContainerElement = document.createElement('div');
        documentContainerElement.className = 'pp-doc';

        const innerContainerElement = document.createElement('div');
        innerContainerElement.className = 'pp-doc__inner';

        documentContainerElement.appendChild(innerContainerElement);
        bodyElement.appendChild(documentContainerElement);
        headerElement.append(breadcrumbPathElement, hostLinkElement, closeButtonElement);
        previewBox.append(headerElement, bodyElement);

        return {
            previewBox,
            breadcrumbPathElement,
            hostLinkElement,
            closeButtonElement,
            innerContainerElement,
        };
    }

    renderBreadcrumbPath(breadcrumbPathElement, href) {
        breadcrumbPathElement.textContent = '';

        let resolvedUrl;
        try {
            resolvedUrl = new URL(href, window.location.href);
        } catch {
            resolvedUrl = null;
        }

        const pathname = resolvedUrl?.pathname || '/';
        const segments = pathname.split('/').filter(Boolean);

        const appendSeparator = () => {
            const separatorElement = document.createElement('span');
            separatorElement.className = 'pp-sep';
            separatorElement.textContent = '/';
            breadcrumbPathElement.appendChild(separatorElement);
        };

        const appendSegment = (segmentLabel, segmentUrl) => {
            const segmentLinkElement = document.createElement('a');
            segmentLinkElement.className = 'pp-seg';
            segmentLinkElement.href = segmentUrl;
            segmentLinkElement.target = '_blank';
            segmentLinkElement.rel = 'noopener';

            const segmentChipElement = document.createElement('span');
            segmentChipElement.className = 'pp-seg__chip';
            segmentChipElement.textContent = segmentLabel;

            segmentLinkElement.appendChild(segmentChipElement);
            breadcrumbPathElement.appendChild(segmentLinkElement);
        };

        let accumulatedPath = '';
        for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
            if (segmentIndex > 0) appendSeparator();
            accumulatedPath += '/' + segments[segmentIndex];
            appendSegment(segments[segmentIndex], window.location.origin + accumulatedPath + '/');
        }
    }

    mountPreviewForAnchor(anchorElement) {
        if (anchorElement._postPreviewTippyInstance) return;

        const ui = this.createPreviewUI();

        const tippyInstance = window.tippy(anchorElement, {
            trigger: 'manual',
            interactive: true,
            hideOnClick: false,
            placement: 'bottom-start',
            animation: 'shift-away',
            theme: 'pp',
            arrow: false,
            inertia: true,
            duration: [this._defaultTippyDurationShow, this._defaultTippyDurationHide],
            maxWidth: 'none',
            appendTo: document.body,
            popperOptions: {
                modifiers: {
                    offset: {offset: '0,8'},
                    preventOverflow: {boundariesElement: 'viewport', padding: 8},
                    flip: {enabled: false},
                },
            },
            content: ui.previewBox,

            onShow: (instance) => {
                if (this.activeTippyInstance && this.activeTippyInstance !== instance) {
                    try {
                        this.activeTippyInstance.hide();
                    } catch {
                    }
                }
                this.activeTippyInstance = instance;
                this.activeAnchorElement = anchorElement;

                const href = anchorElement.href;

                this.renderBreadcrumbPath(ui.breadcrumbPathElement, href);

                const parsedUrl = new URL(href, window.location.href);
                ui.hostLinkElement.href = href;
                ui.hostLinkElement.textContent = parsedUrl.host;

                ui.closeButtonElement.onclick = (clickEvent) => {
                    clickEvent.preventDefault();
                    clickEvent.stopPropagation();
                    try {
                        instance.hide();
                    } catch {
                    }
                };

                this.abortAnchorRequest(anchorElement);

                anchorElement._ppReqSeq = (anchorElement._ppReqSeq || 0) + 1;
                const seq = anchorElement._ppReqSeq;

                const abortController = new AbortController();
                anchorElement._ppAbortController = abortController;

                this.loadPreviewHtml(href, abortController.signal)
                    .then((previewHtml) => {
                        if (!previewHtml) return;
                        ui.innerContainerElement.innerHTML = previewHtml;
                        queueMicrotask(() => instance.popperInstance?.update?.());
                    })
                    .catch((error) => {
                        ui.innerContainerElement.textContent = 'Failed to load preview.';
                        this.log('load failed', {href, error});
                        queueMicrotask(() => instance.popperInstance?.update?.());
                    });
            },

            onHidden: () => {
                this.abortAnchorRequest(anchorElement);
                if (this.activeTippyInstance === tippyInstance) {
                    this.activeTippyInstance = null;
                    this.activeAnchorElement = null;
                }
            },
        });

        anchorElement._postPreviewTippyInstance = tippyInstance;
        this.attachHoverBehavior(anchorElement, tippyInstance);
    }

    attachHoverBehavior(anchorElement, tippyInstance) {
        let isOverAnchor = false;
        let isOverPopover = false;

        let showTimeoutId = 0;
        let hideTimeoutId = 0;

        const scheduleHide = () => {
            if (hideTimeoutId) window.clearTimeout(hideTimeoutId);

            hideTimeoutId = window.setTimeout(() => {
                if (isOverAnchor || isOverPopover) return;
                try {
                    tippyInstance.hide();
                } catch {
                }
            }, this.configuration.hideDelay);
        };

        anchorElement.addEventListener(
            'mouseenter',
            () => {
                isOverAnchor = true;

                if (hideTimeoutId) {
                    window.clearTimeout(hideTimeoutId);
                    hideTimeoutId = 0;
                }

                if (showTimeoutId) window.clearTimeout(showTimeoutId);
                showTimeoutId = window.setTimeout(() => {
                    if (!isOverAnchor) return;
                    try {
                        tippyInstance.show();
                    } catch {
                    }
                }, this.configuration.showDelay);
            },
            {passive: true}
        );

        anchorElement.addEventListener(
            'mouseleave',
            () => {
                isOverAnchor = false;

                if (showTimeoutId) {
                    window.clearTimeout(showTimeoutId);
                    showTimeoutId = 0;
                }

                scheduleHide();
            },
            {passive: true}
        );

        const originalShow = tippyInstance.show.bind(tippyInstance);
        tippyInstance.show = () => {
            originalShow();

            queueMicrotask(() => {
                const popoverElement = tippyInstance.popper;
                if (!popoverElement || popoverElement._postPreviewHoverHooked) return;

                popoverElement._postPreviewHoverHooked = true;

                popoverElement.addEventListener(
                    'mouseenter',
                    () => {
                        isOverPopover = true;
                        if (hideTimeoutId) {
                            window.clearTimeout(hideTimeoutId);
                            hideTimeoutId = 0;
                        }
                    },
                    {passive: true}
                );

                popoverElement.addEventListener(
                    'mouseleave',
                    () => {
                        isOverPopover = false;
                        scheduleHide();
                    },
                    {passive: true}
                );
            });
        };
    }

    abortAnchorRequest(anchorElement) {
        const controller = anchorElement._ppAbortController;
        if (!controller) return;

        anchorElement._ppAbortController = null;

        try {
            controller.abort();
        } catch {
        }
    }

    async loadPreviewHtml(href, abortSignal) {
        const response = await fetch(href, {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: abortSignal,
            headers: {Accept: 'text/html'},
        });

        if (!response.ok) return null;

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength && contentLength > this.configuration.maxBytes) return null;

        const rawHtml = await response.text();
        if (this.configuration.maxBytes && rawHtml.length > this.configuration.maxBytes) return null;

        return this.extractPreviewHtml(rawHtml, href) || null;
    }

    extractPreviewHtml(html, href) {
        const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
        const baseUrl = new URL(href, window.location.href);

        const mainContentElement =
            parsedDocument.querySelector('main article.page.single') ||
            parsedDocument.querySelector('div.page.archive') ||
            parsedDocument.querySelector('main article') ||
            parsedDocument.querySelector('article.page.single') ||
            parsedDocument.querySelector('article') ||
            parsedDocument.querySelector('main');

        if (!mainContentElement) return '';

        const clonedRoot = mainContentElement.cloneNode(true);

        clonedRoot
            .querySelectorAll('script,style,link[rel="stylesheet"],iframe,object,embed')
            .forEach((node) => node.remove());

        clonedRoot
            .querySelectorAll('#comments,.comment,.comments,.giscus,.utterances,meting-js,.meting,.aplayer,.aplayer-fixed')
            .forEach((node) => node.remove());

        const makeAbsoluteAttribute = (element, attributeName) => {
            const attributeValue = element.getAttribute(attributeName);
            if (!attributeValue) return;

            const trimmedValue = attributeValue.trim();
            if (!trimmedValue) return;
            if (trimmedValue[0] === '#') return;
            if (/^(data:|mailto:|tel:|javascript:)/i.test(trimmedValue)) return;

            try {
                element.setAttribute(attributeName, new URL(trimmedValue, baseUrl).href);
            } catch {
            }
        };

        clonedRoot.querySelectorAll('a[href]').forEach((anchor) => {
            makeAbsoluteAttribute(anchor, 'href');
            anchor.target = '_blank';
            anchor.rel = 'noopener';
        });

        clonedRoot.querySelectorAll('img').forEach((img) => {
            const dataSource =
                img.getAttribute('data-src') ||
                img.getAttribute('data-original') ||
                img.getAttribute('data-lazy-src');

            const src = img.getAttribute('src');
            if ((!src || src === '') && dataSource) img.setAttribute('src', dataSource);

            makeAbsoluteAttribute(img, 'src');
            makeAbsoluteAttribute(img, 'data-src');

            img.loading = 'lazy';
            img.decoding = 'async';
        });

        const idPrefix = 'pp-' + this.hash32(baseUrl.pathname) + '-';
        const oldToNewIdMap = new Map();

        clonedRoot.querySelectorAll('[id]').forEach((elementWithId) => {
            const oldId = elementWithId.id;
            if (!oldId) return;

            const newId = idPrefix + oldId;
            oldToNewIdMap.set(oldId, newId);
            elementWithId.id = newId;
        });

        clonedRoot.querySelectorAll('a[href^="#"]').forEach((hashAnchor) => {
            const oldTargetId = hashAnchor.getAttribute('href').slice(1);
            const newTargetId = oldToNewIdMap.get(oldTargetId);
            if (newTargetId) hashAnchor.setAttribute('href', '#' + newTargetId);
        });

        clonedRoot.querySelectorAll('label[for]').forEach((label) => {
            const oldFor = label.getAttribute('for');
            const newFor = oldToNewIdMap.get(oldFor);
            if (newFor) label.setAttribute('for', newFor);
        });

        return clonedRoot.outerHTML;
    }

    hash32(input) {
        const s = String(input || '');
        let hash = 2166136261;

        for (let index = 0; index < s.length; index++) {
            hash ^= s.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }

        return (hash >>> 0).toString(16);
    }
}

if (document.readyState === 'complete') {
    PostPreview.boot();
} else {
    window.addEventListener('load', () => PostPreview.boot(), {once: true});
}

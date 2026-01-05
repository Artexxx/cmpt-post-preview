import params from '@params';

/**
 * Tippy.js based internal page previews
 * @description Minimal hover popover with iframe, internal pages only
 */
const POST_PREVIEW = {
    init: function () {
        this.setParameters();
        this.guard();
        this.bindEvent();
        this.log("init", {pathname: this.pathname, config: this.cfg});
    },

    setParameters: function () {
        this.window = window;
        this.document = document;

        this.cfg = {
            enable: !!params.enable,
            debug: !!params.debug,
            mobileBp: Number(params.mobileBp || 900),
            disableOnHome: params.disableOnHome !== false,
            excludeSelector: String(params.excludeSelector || ""),
            showDelay: Number(params.showDelay || 120),
            hideDelay: Number(params.hideDelay || 220),
            cropTopPx: Number(params.cropTopPx || 100),
        };

        this.pathname = "/";
        try { this.pathname = this.window.location.pathname || "/"; } catch {}

        this.instances = new WeakMap();
        this.active = null;

        this.excludeNode = null;
        this.excludeChecked = false;

        this.FILE_EXT_RE = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|mp4|webm|mp3|wav|ogg|flac|pdf|zip|rar|7z|tar|gz|bz2|xz|dmg|exe|msi|apk|ipa|docx?|xlsx?|pptx?|csv|json|xml|yml|yaml|toml|map)$/i;
        this.ASSET_PATH_RE = /^\/(?:images|img|css|js|fonts|font|assets|static|files)\//i;
        this.HTML_EXT_RE = /\.html?$/i;
    },

    log: function () {
        if (!this.cfg.debug) return;
        console.log.apply(console, ["[post-preview]"].concat([].slice.call(arguments)));
    },

    guard: function () {
        if (!this.cfg.enable) throw new Error("disabled");

        if (this.window.top !== this.window.self) {
            this.log("disabled: iframe");
            throw new Error("iframe");
        }

        const mm = this.window.matchMedia ? this.window.matchMedia.bind(this.window) : null;
        const isMobileLike =
            (this.window.innerWidth <= this.cfg.mobileBp) ||
            (mm && mm("(hover: none)").matches) ||
            (mm && mm("(pointer: coarse)").matches);

        if (isMobileLike) {
            this.log("disabled: mobile/touch");
            throw new Error("mobile");
        }

        if (!this.window.tippy) {
            this.log("disabled: tippy not found");
            throw new Error("tippy");
        }

        if (this.cfg.disableOnHome) {
            const norm = (String(this.pathname).replace(/\/+$/, "") || "/");
            const isHome = (norm === "/") || /^\/[a-z]{2}(?:-[a-z]{2})?$/i.test(norm);
            if (isHome) {
                this.log("disabled: home");
                throw new Error("home");
            }
        }
    },

    bindEvent: function () {
        const self = this;

        this.document.addEventListener("mouseover", function (e) {
            const t = e.target;
            if (!t) return;

            const a = t.closest ? t.closest("a[href]") : null;
            if (!a) return;

            if (!self.isEligibleLink(a)) return;

            self.getOrCreate(a);
        }, {passive: true});
    },

    isBlockedByExclude: function (a) {
        if (!this.cfg.excludeSelector) return false;

        if (!this.excludeChecked) {
            this.excludeNode = this.document.querySelector(this.cfg.excludeSelector);
            this.excludeChecked = true;
        }
        return this.excludeNode ? this.excludeNode.contains(a) : false;
    },

    toURL: function (href) {
        try {
            return new URL(href, this.window.location.href);
        } catch {
            return null;
        }
    },

    prettyUrl: function (href) {
        try {
            const u = new URL(href, this.window.location.href);
            return (u.host + u.pathname + u.search + u.hash).replace(/\/$/, "");
        } catch {
            return String(href || "");
        }
    },

    isEligibleLink: function (a) {
        if (!a.closest("main")) return false;
        if (a.closest("header, nav, footer")) return false;
        if (a.closest(".tippy-popper")) return false;
        if (this.isBlockedByExclude(a)) return false;

        const raw = (a.getAttribute("href") || "").trim();
        if (!raw) return false;
        if (raw[0] === "#") return false;
        if (raw.indexOf("mailto:") === 0 || raw.indexOf("tel:") === 0 || raw.indexOf("javascript:") === 0) return false;
        if (a.hasAttribute("download")) return false;

        const u = this.toURL(a.href);
        if (!u) return false;
        if (u.origin !== this.window.location.origin) return false;

        const path = u.pathname || "/";
        if (this.ASSET_PATH_RE.test(path)) return false;
        if (path.indexOf("/favicon.") !== -1) return false;
        if (this.FILE_EXT_RE.test(path)) return false;

        const last = path.slice(path.lastIndexOf("/") + 1);
        const dot = last.lastIndexOf(".");
        if (dot !== -1 && !this.HTML_EXT_RE.test(last)) return false;

        return true;
    },

    setSandboxForInternal: function (iframe) {
        iframe.setAttribute(
            "sandbox",
            "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
        );
    },

    createUI: function () {
        const box = this.document.createElement("div");
        box.className = "pp-box";

        const head = this.document.createElement("div");
        head.className = "pp-head";

        const urlA = this.document.createElement("a");
        urlA.className = "pp-url";
        urlA.target = "_blank";
        urlA.rel = "noopener";

        const close = this.document.createElement("button");
        close.className = "pp-close";
        close.type = "button";
        close.textContent = "×";
        close.title = "Close";

        const body = this.document.createElement("div");
        body.className = "pp-body";

        const load = this.document.createElement("div");
        load.className = "pp-load";
        load.innerHTML = '<div class="pp-spin"></div>';

        head.append(urlA, close);
        body.append(load);
        box.append(head, body);

        return {box: box, urlA: urlA, close: close, body: body, load: load};
    },

    getOrCreate: function (a) {
        let inst = this.instances.get(a);
        if (inst) return inst;

        const self = this;
        const ui = this.createUI();

        inst = this.window.tippy(a, {
            trigger: "manual",
            interactive: true,
            hideOnClick: false,
            placement: "bottom-start",
            animation: "shift-away",
            theme: "pp",
            arrow: false,
            inertia: true,
            duration: [120, 110],
            maxWidth: "none",
            appendTo: this.document.body,
            popperOptions: {
                modifiers: {
                    offset: {offset: "0,8"},
                    preventOverflow: {boundariesElement: "viewport", padding: 8},
                    flip: {enabled: false}
                }
            },
            content: ui.box,

            onShow: function (instance) {
                if (self.active && self.active !== instance) {
                    try {
                        self.active.hide();
                    } catch {
                    }
                }
                self.active = instance;

                const href = a.href;
                ui.urlA.href = href;
                ui.urlA.textContent = self.prettyUrl(href);

                ui.close.onclick = function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        instance.hide();
                    } catch {
                    }
                };

                ui.load.hidden = false;

                ui.body.querySelectorAll("iframe").forEach(function (f) {
                    try {
                        f.src = "about:blank";
                    } catch {
                    }
                    f.remove();
                });

                const iframe = self.document.createElement("iframe");
                iframe.className = "pp-frame";
                iframe.referrerPolicy = "no-referrer";
                self.setSandboxForInternal(iframe);

                iframe.addEventListener("load", function () {
                    ui.load.hidden = true;
                    if (instance.popperInstance && instance.popperInstance.update) instance.popperInstance.update();
                }, {once: true});

                iframe.src = href;
                ui.body.appendChild(iframe);

                if (instance.popperInstance && instance.popperInstance.update) instance.popperInstance.update();
            },

            onHidden: function (instance) {
                ui.body.querySelectorAll("iframe").forEach(function (f) {
                    try {
                        f.src = "about:blank";
                    } catch {
                    }
                    f.remove();
                });
                ui.load.hidden = true;
                if (self.active === instance) self.active = null;
            }
        });

        this.attachHover(a, inst);
        this.instances.set(a, inst);
        return inst;
    },

    attachHover: function (a, inst) {
        const self = this;

        let overRef = false;
        let overPop = false;
        let showT = 0;
        let hideT = 0;

        function scheduleHide() {
            if (hideT) self.window.clearTimeout(hideT);
            hideT = self.window.setTimeout(function () {
                if (overRef || overPop) return;
                try {
                    inst.hide();
                } catch {
                }
            }, self.cfg.hideDelay);
        }

        a.addEventListener("mouseenter", function () {
            overRef = true;
            if (hideT) {
                self.window.clearTimeout(hideT);
                hideT = 0;
            }
            if (showT) self.window.clearTimeout(showT);
            showT = self.window.setTimeout(function () {
                if (!overRef) return;
                try {
                    inst.show();
                } catch {
                }
            }, self.cfg.showDelay);
        }, {passive: true});

        a.addEventListener("mouseleave", function () {
            overRef = false;
            if (showT) {
                self.window.clearTimeout(showT);
                showT = 0;
            }
            scheduleHide();
        }, {passive: true});

        const origShow = inst.show.bind(inst);
        inst.show = function () {
            origShow();
            queueMicrotask(function () {
                const pop = inst.popper;
                if (!pop || pop._ppHooked) return;
                pop._ppHooked = true;

                pop.addEventListener("mouseenter", function () {
                    overPop = true;
                    if (hideT) {
                        self.window.clearTimeout(hideT);
                        hideT = 0;
                    }
                }, {passive: true});

                pop.addEventListener("mouseleave", function () {
                    overPop = false;
                    scheduleHide();
                }, {passive: true});
            });
        };
    }
};

function boot() {
    try {
        POST_PREVIEW.init();
    } catch (e) {
    }
}

if (document.readyState === "complete") boot();
else window.addEventListener("load", boot, {once: true});

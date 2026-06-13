/* ============================================================
   Da'am CMS — Visual Page Editor (window.PageEditor)
   "اضغط على أي نص لتعديله، وعلى أي صورة لاستبدالها"
   Loads a page into an iframe, lets a non-technical editor
   change text/images with a rich toolbar, then saves the
   cleaned HTML back through the CMS storage layer.
   ============================================================ */
(function () {
    'use strict';

    var ui = {};            // injected: toast(msg,kind), loading(on,text)
    var state = {
        path: null,         // e.g. 'v2/about.html'
        dir: null,          // e.g. 'v2'  or 'v2/en'
        changes: 0,
        savedRange: null
    };

    var TEXT_SEL = 'h1,h2,h3,h4,h5,h6,p,li,span,a,strong,em,b,blockquote,figcaption,td,th,button,label';
    var SKIP_ZONES = '#newsGrid,#teamGrid';

    function $(id) { return document.getElementById(id); }
    function frame() { return $('pedFrame'); }
    function fdoc() { return frame().contentDocument; }

    /* ---------- path helpers ---------- */
    function relFromDir(dir, rootRel) {
        var rr = rootRel.replace(/^\//, '').split('/');
        var dd = dir ? dir.split('/') : [];
        while (dd.length && rr.length && dd[0] === rr[0]) { dd.shift(); rr.shift(); }
        var ups = [];
        for (var i = 0; i < dd.length; i++) ups.push('..');
        return ups.concat(rr).join('/');
    }

    /* ---------- open / load ---------- */
    function open(path, label) {
        state.path = path;
        state.dir = path.indexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/')) : '';
        state.changes = 0;
        updateCount();
        $('pedTitle').textContent = label || path;
        $('pageEditor').classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        ui.loading(true, 'جارٍ تحميل الصفحة...');
        CMS.loadText(path).then(function (raw) {
            if (raw == null) throw new Error('الصفحة غير موجودة');
            // 1) disable page scripts so the editor sees the original markup
            raw = raw.replace(/<script\b/gi, '<script type="text/cms-off" data-cms-inert');
            // 2) make relative assets resolve from the page's real directory
            var baseHref = CMS.siteURL + '/' + (state.dir ? state.dir + '/' : '');
            raw = raw.replace(/<head([^>]*)>/i, '<head$1><base href="' + baseHref + '" data-cms-base>');
            frame().srcdoc = raw;
            frame().onload = function () { wireFrame(); ui.loading(false); };
        }).catch(function (e) {
            ui.loading(false);
            ui.toast('تعذّر فتح الصفحة: ' + e.message, 'bad');
            close();
        });
    }

    function close() {
        $('pageEditor').classList.add('hidden');
        frame().srcdoc = '';
        document.body.style.overflow = '';
    }

    /* ---------- wire editing inside the iframe ---------- */
    function wireFrame() {
        var doc = fdoc();
        if (!doc) return;

        var style = doc.createElement('style');
        style.id = 'cms-style';
        style.textContent =
            '.reveal{opacity:1!important;transform:none!important}' +
            'body.cms-edit ' + TEXT_SEL.split(',').map(function (s) { return s + ':hover'; }).join(',body.cms-edit ') +
            '{outline:2px dashed rgba(0,74,173,.55);outline-offset:2px;cursor:text}' +
            'body.cms-edit img:hover{outline:3px dashed rgba(255,174,0,.9);outline-offset:2px;cursor:pointer}' +
            '[contenteditable="true"]{outline:2px solid #ffae00!important;outline-offset:2px;min-width:10px}' +
            /* section tools */
            'body.cms-edit>section{position:relative}' +
            'body.cms-edit>section:hover{outline:2px solid rgba(0,74,173,.25);outline-offset:-2px}' +
            '.cms-sec-ctl{position:absolute;top:10px;inset-inline-start:10px;display:flex;gap:6px;z-index:9999;opacity:0;transition:.15s;background:rgba(11,31,58,.95);padding:7px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.25)}' +
            'body.cms-edit>section:hover>.cms-sec-ctl{opacity:1}' +
            '.cms-sec-ctl button{width:34px;height:34px;border:none;border-radius:8px;background:#fff;color:#0b1f3a;cursor:pointer;font-size:.85rem;display:inline-flex;align-items:center;justify-content:center}' +
            '.cms-sec-ctl button:hover{background:#ffae00}' +
            '.cms-sec-ctl button[data-del]:hover{background:#e53e3e;color:#fff}';
        doc.head.appendChild(style);
        doc.body.classList.add('cms-edit');

        try { doc.execCommand('styleWithCSS', false, true); } catch (e) { }

        // block navigation & submits while editing
        doc.addEventListener('submit', function (e) { e.preventDefault(); }, true);
        doc.addEventListener('click', function (e) {
            var a = e.target.closest && e.target.closest('a');
            if (a) e.preventDefault();
            handleClick(e);
        }, true);

        doc.addEventListener('input', function () { state.changes++; updateCount(); });
        ['keyup', 'mouseup'].forEach(function (ev) {
            doc.addEventListener(ev, function () {
                var s = doc.getSelection && doc.getSelection();
                if (s && s.rangeCount) state.savedRange = s.getRangeAt(0);
            });
        });

        injectSectionTools();
    }

    /* ---------- section tools (add / delete / reorder / duplicate) ---------- */
    function topSections(doc) {
        return Array.prototype.filter.call(doc.body.children, function (el) { return el.tagName === 'SECTION'; });
    }
    function injectSectionTools() {
        var doc = fdoc(); if (!doc || !doc.body) return;
        doc.querySelectorAll('[data-cms-ctl]').forEach(function (e) { e.remove(); });
        topSections(doc).forEach(function (sec) {
            var bar = doc.createElement('div');
            bar.setAttribute('data-cms-ctl', '1');
            bar.className = 'cms-sec-ctl';
            bar.setAttribute('contenteditable', 'false');
            bar.innerHTML =
                '<button data-up title="نقل لأعلى"><i class="fas fa-arrow-up"></i></button>'
                + '<button data-down title="نقل لأسفل"><i class="fas fa-arrow-down"></i></button>'
                + '<button data-dup title="نسخ القسم"><i class="fas fa-copy"></i></button>'
                + '<button data-del title="حذف القسم"><i class="fas fa-trash"></i></button>';
            bar.addEventListener('click', function (e) {
                var b = e.target.closest('button'); if (!b) return;
                e.preventDefault(); e.stopPropagation();
                var win = frame().contentWindow;
                if (b.hasAttribute('data-up')) {
                    var pv = sec.previousElementSibling;
                    while (pv && pv.tagName !== 'SECTION') pv = pv.previousElementSibling;
                    if (pv) sec.parentNode.insertBefore(sec, pv);
                } else if (b.hasAttribute('data-down')) {
                    var nx = sec.nextElementSibling;
                    while (nx && nx.tagName !== 'SECTION') nx = nx.nextElementSibling;
                    if (nx) sec.parentNode.insertBefore(nx, sec);
                } else if (b.hasAttribute('data-dup')) {
                    var clone = sec.cloneNode(true);
                    clone.querySelectorAll('[data-cms-ctl]').forEach(function (x) { x.remove(); });
                    sec.parentNode.insertBefore(clone, sec.nextSibling);
                } else if (b.hasAttribute('data-del')) {
                    if (!win.confirm('حذف هذا القسم بالكامل؟')) return;
                    sec.remove();
                }
                state.changes++; updateCount();
                injectSectionTools();
            });
            sec.appendChild(bar);
        });
    }

    function relImg(rootRel) { return relFromDir(state.dir, rootRel); }
    function sectionTemplate(kind, en) {
        var img = relImg('/assets/images/hero_team_egypt.png');
        var t = {
            ar: { sub: 'عنوان فرعي', title: 'عنوان القسم', desc: 'اكتب وصف القسم هنا...', c: 'عنوان البطاقة', cd: 'وصف مختصر للبطاقة.', cta: 'انضم إلينا', join: 'participate.html' },
            en: { sub: 'Subtitle', title: 'Section title', desc: 'Write your section description here...', c: 'Card title', cd: 'A short card description.', cta: 'Join Us', join: 'participate.html' }
        }[en ? 'en' : 'ar'];
        if (kind === 'text')
            return '<section class="section"><div class="container"><div class="section-head"><span class="eyebrow">' + t.sub + '</span><h2>' + t.title + '</h2><p>' + t.desc + '</p></div></div></section>';
        if (kind === 'split')
            return '<section class="section bg-soft"><div class="container grid-2"><div class="split-img"><img src="' + img + '" alt=""></div><div class="split-text"><span class="eyebrow">' + t.sub + '</span><h2>' + t.title + '</h2><p>' + t.desc + '</p></div></div></section>';
        if (kind === 'cards') {
            var card = '<div class="feature-card"><div class="feature-icon"><i class="fas fa-star"></i></div><h3>' + t.c + '</h3><p>' + t.cd + '</p></div>';
            return '<section class="section"><div class="container"><div class="section-head"><span class="eyebrow">' + t.sub + '</span><h2>' + t.title + '</h2></div><div class="grid-3">' + card + card.replace('green', '') + card + '</div></div></section>';
        }
        if (kind === 'cta')
            return '<section class="section"><div class="container"><div class="cta-band"><h2>' + t.title + '</h2><p>' + t.desc + '</p><a href="' + t.join + '" class="btn btn-accent btn-lg">' + t.cta + '</a></div></div></section>';
        return '';
    }
    function addSection(kind) {
        var doc = fdoc(); if (!doc) return;
        var lang = (doc.documentElement.getAttribute('lang') || 'ar').toLowerCase();
        var en = lang.indexOf('en') === 0;
        var holder = doc.createElement('div');
        holder.innerHTML = sectionTemplate(kind, en).trim();
        var sec = holder.firstElementChild; if (!sec) return;
        var footer = doc.querySelector('body > footer');
        doc.body.insertBefore(sec, footer || null);
        state.changes++; updateCount();
        injectSectionTools();
        sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ui.toast(en ? 'تمت إضافة القسم — اضغط على نصوصه وصوره لتعديلها' : 'تمت إضافة القسم — اضغط على نصوصه وصوره لتعديلها', 'ok');
    }

    function handleClick(e) {
        var doc = fdoc();
        var t = e.target;

        if (t.closest && t.closest('[data-cms-ctl]')) return;  // section control buttons

        if (t.closest && t.closest(SKIP_ZONES)) {
            ui.toast('هذا القسم يُدار من تبويب «الأخبار» أو «الفريق» في اللوحة', '');
            return;
        }

        // image → replace
        if (t.tagName === 'IMG') {
            e.preventDefault();
            replaceImage(t);
            return;
        }

        // text → make editable
        var el = t.closest ? t.closest(TEXT_SEL) : null;
        if (!el) {
            // allow leaf divs (no block children) like stat labels
            var d = t.closest ? t.closest('div') : null;
            if (d && !d.querySelector('div,section,ul,ol,img,h1,h2,h3,h4,h5,h6,p,form,iframe')) el = d;
        }
        if (el && !el.isContentEditable) {
            el.setAttribute('contenteditable', 'true');
            el.focus();
        }
    }

    /* ---------- images ---------- */
    function replaceImage(img) {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = function () {
            var file = inp.files[0];
            if (!file) return;
            ui.loading(true, 'جارٍ رفع الصورة...');
            Promise.all([CMS.uploadImage(file), CMS.fileToDataURL(file)]).then(function (r) {
                var rootRel = r[0], dataURL = r[1];
                img.src = dataURL; // instant preview
                img.setAttribute('data-cms-newsrc', relFromDir(state.dir, rootRel));
                state.changes++; updateCount();
                ui.loading(false);
                ui.toast('تم استبدال الصورة ✓ اضغط «حفظ ونشر» لتطبيقها', 'ok');
            }).catch(function (err) {
                ui.loading(false);
                ui.toast('فشل رفع الصورة: ' + err.message, 'bad');
            });
        };
        inp.click();
    }

    function insertImageAtCursor() {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = function () {
            var file = inp.files[0];
            if (!file) return;
            ui.loading(true, 'جارٍ رفع الصورة...');
            Promise.all([CMS.uploadImage(file), CMS.fileToDataURL(file)]).then(function (r) {
                var rootRel = r[0], dataURL = r[1];
                restoreSel();
                fdoc().execCommand('insertImage', false, dataURL);
                // tag the inserted image so save() swaps in the real path
                var imgs = fdoc().querySelectorAll('img[src^="data:"]:not([data-cms-newsrc])');
                imgs.forEach(function (im) {
                    im.setAttribute('data-cms-newsrc', relFromDir(state.dir, rootRel));
                    im.style.maxWidth = '100%'; im.style.borderRadius = '12px';
                });
                state.changes++; updateCount();
                ui.loading(false);
            }).catch(function (err) { ui.loading(false); ui.toast('فشل رفع الصورة', 'bad'); });
        };
        inp.click();
    }

    /* ---------- toolbar ---------- */
    function restoreSel() {
        var doc = fdoc();
        frame().contentWindow.focus();
        if (state.savedRange) {
            var s = doc.getSelection();
            s.removeAllRanges(); s.addRange(state.savedRange);
        }
    }
    function exec(cmd, val) {
        restoreSel();
        try { fdoc().execCommand('styleWithCSS', false, true); } catch (e) { }
        fdoc().execCommand(cmd, false, val || null);
        state.changes++; updateCount();
    }

    function buildToolbar() {
        var bar = $('pedToolbar');
        bar.innerHTML =
            '<button data-cmd="undo" title="تراجع"><i class="fas fa-rotate-right"></i></button>'
            + '<button data-cmd="redo" title="إعادة"><i class="fas fa-rotate-left"></i></button>'
            + '<span class="sep"></span>'
            + '<button data-cmd="bold" title="عريض"><i class="fas fa-bold"></i></button>'
            + '<button data-cmd="italic" title="مائل"><i class="fas fa-italic"></i></button>'
            + '<button data-cmd="underline" title="تسطير"><i class="fas fa-underline"></i></button>'
            + '<span class="sep"></span>'
            + '<select data-size title="حجم الخط"><option value="">حجم الخط</option><option value="2">صغير</option><option value="3">عادي</option><option value="4">متوسط</option><option value="5">كبير</option><option value="6">ضخم</option></select>'
            + '<label class="color" title="لون النص"><i class="fas fa-font"></i><input type="color" data-fore value="#004aad"></label>'
            + '<label class="color" title="لون التظليل"><i class="fas fa-highlighter"></i><input type="color" data-hi value="#ffae00"></label>'
            + '<span class="sep"></span>'
            + '<button data-cmd="justifyRight" title="محاذاة يمين"><i class="fas fa-align-right"></i></button>'
            + '<button data-cmd="justifyCenter" title="توسيط"><i class="fas fa-align-center"></i></button>'
            + '<button data-cmd="justifyLeft" title="محاذاة يسار"><i class="fas fa-align-left"></i></button>'
            + '<span class="sep"></span>'
            + '<button data-cmd="insertUnorderedList" title="قائمة نقاط"><i class="fas fa-list-ul"></i></button>'
            + '<button data-link title="إضافة رابط"><i class="fas fa-link"></i></button>'
            + '<button data-imgins title="إدراج صورة"><i class="fas fa-image"></i></button>'
            + '<button data-cmd="removeFormat" title="مسح التنسيق"><i class="fas fa-eraser"></i></button>'
            + '<span class="sep"></span>'
            + '<select data-addsec title="إضافة قسم جديد"><option value="">➕ إضافة قسم</option><option value="text">قسم نصي</option><option value="split">صورة + نص</option><option value="cards">ثلاث بطاقات</option><option value="cta">شريط دعوة (CTA)</option></select>';

        bar.addEventListener('mousedown', function (e) {
            var b = e.target.closest('button');
            if (!b) return;
            e.preventDefault();
            if (b.hasAttribute('data-cmd')) exec(b.getAttribute('data-cmd'));
            else if (b.hasAttribute('data-link')) { var u = prompt('أدخل الرابط:'); if (u) exec('createLink', u); }
            else if (b.hasAttribute('data-imgins')) insertImageAtCursor();
        });
        bar.querySelector('[data-size]').addEventListener('change', function () {
            if (this.value) exec('fontSize', this.value);
            this.selectedIndex = 0;
        });
        bar.querySelector('[data-fore]').addEventListener('input', function () { exec('foreColor', this.value); });
        bar.querySelector('[data-hi]').addEventListener('input', function () { exec('hiliteColor', this.value); });
        bar.querySelector('[data-addsec]').addEventListener('change', function () {
            if (this.value) addSection(this.value);
            this.selectedIndex = 0;
        });
    }

    /* ---------- save ---------- */
    function serialize() {
        var doc = fdoc();
        var clone = doc.documentElement.cloneNode(true);

        // restore original scripts
        clone.querySelectorAll('script[data-cms-inert]').forEach(function (s) {
            s.removeAttribute('type'); s.removeAttribute('data-cms-inert');
        });
        // drop editor artifacts
        var b = clone.querySelector('base[data-cms-base]'); if (b) b.remove();
        var st = clone.querySelector('#cms-style'); if (st) st.remove();
        clone.querySelectorAll('[data-cms-ctl]').forEach(function (el) { el.remove(); });  // section tool bars
        clone.querySelectorAll('[contenteditable]').forEach(function (el) { el.removeAttribute('contenteditable'); });
        var body = clone.querySelector('body'); if (body) body.classList.remove('cms-edit');
        if (body && body.getAttribute('class') === '') body.removeAttribute('class');
        // swap uploaded images to their real relative paths
        clone.querySelectorAll('img[data-cms-newsrc]').forEach(function (im) {
            im.setAttribute('src', im.getAttribute('data-cms-newsrc'));
            im.removeAttribute('data-cms-newsrc');
        });
        return '<!DOCTYPE html>\n' + clone.outerHTML;
    }

    function save() {
        if (!state.path) return;
        ui.loading(true, 'جارٍ حفظ الصفحة ونشرها...');
        CMS.saveText(state.path, serialize(), 'Admin: edit ' + state.path).then(function () {
            ui.loading(false);
            state.changes = 0; updateCount();
            ui.toast('تم الحفظ ✓ ' + CMS.publishDelayNote, 'ok');
        }).catch(function (e) {
            ui.loading(false);
            ui.toast('فشل الحفظ: ' + e.message, 'bad');
        });
    }

    function updateCount() {
        $('pedCount').textContent = state.changes ? (state.changes + ' تعديل') : 'لا تعديلات';
    }

    /* ---------- public ---------- */
    window.PageEditor = {
        init: function (helpers) {
            ui = helpers;
            buildToolbar();
            $('pedBack').addEventListener('click', function () {
                if (state.changes && !confirm('لديك تعديلات غير محفوظة، هل تريد الخروج بدون حفظ؟')) return;
                close();
            });
            $('pedSave').addEventListener('click', save);
        },
        open: open
    };
})();

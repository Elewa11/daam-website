/* ============================================================
   Da'am CMS — Storage layer (window.CMS)
   The panel is fully standalone: it lives on its own link and
   can even be hosted on a different domain from the website.

   Two interchangeable backends behind one API:
     • github : saves via GitHub Contents API   (current hosting)
     • php    : saves via api.php on the site's server (future)
   ============================================================ */
(function () {
    'use strict';

    var CONFIG = {
        owner: 'Elewa11', repo: 'daam-website', branch: 'main',
        password: 'admin123',
        // NOTE: no access token is stored in this file. On GitHub hosting the
        // editor's personal access token is kept ONLY in their own browser
        // (localStorage 'cms_gh_token'); it is never published to the site.

        // Absolute URL of the live site root (where /assets and /v2 live).
        // Leave '' for auto-detection; can also be overridden via
        // localStorage.setItem('cms_site_url', 'https://example.com')
        SITE_URL: '',

        // URL of api.php when the panel is hosted on a DIFFERENT domain
        // than the website (otherwise auto: 'api.php' next to the panel).
        // Override via localStorage.setItem('cms_api_url', '...')
        API_URL: ''
    };

    /* ---------- mode + site URL detection ---------- */
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

    var MODE = lsGet('cms_mode') || (location.hostname.indexOf('github.io') !== -1 ? 'github' : 'php');

    function detectSiteURL() {
        var forced = lsGet('cms_site_url') || CONFIG.SITE_URL;
        if (forced) return forced.replace(/\/+$/, '');
        if (location.hostname.indexOf('github.io') !== -1) {
            // https://<user>.github.io/<repo>/panel/ → site root = origin + /<repo>
            return location.origin + '/' + CONFIG.repo;
        }
        // panel served from <siteroot>/panel/… → site root is one level up
        var p = location.pathname;
        var i = p.indexOf('/panel/');
        if (i === -1) i = p.lastIndexOf('/');
        return (location.origin + p.slice(0, i)).replace(/\/+$/, '');
    }
    var SITE_URL = detectSiteURL();

    var API = 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo;
    var PHP_URL = lsGet('cms_api_url') || CONFIG.API_URL || 'api.php';

    var token = lsGet('cms_gh_token');   // github PAT — kept only in this browser
    var pwdMem = null;                   // php (sent with every request)
    var onAuthErr = function () { };     // called when the GitHub token is rejected (401)

    function authLost() {
        token = null;
        try { localStorage.removeItem('cms_gh_token'); } catch (e) { }
        try { onAuthErr(); } catch (e) { }
    }

    /* ---------- shared utils ---------- */
    function b64encode(str) {
        var u = new TextEncoder().encode(str), bin = '';
        for (var i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
        return btoa(bin);
    }
    function b64decodeUtf8(b64) {
        var bin = atob((b64 || '').replace(/\s/g, '')), u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return new TextDecoder('utf-8').decode(u);
    }
    function fileToDataURL(file) {
        return new Promise(function (res, rej) {
            var r = new FileReader();
            r.onload = function () { res(r.result); };
            r.onerror = rej; r.readAsDataURL(file);
        });
    }
    function safeName(name) { return (name || 'img').replace(/[^a-zA-Z0-9._-]/g, '_'); }

    /* ---------- GitHub backend ---------- */
    var GH = {
        requiresToken: true,
        hasToken: function () { return !!token; },
        setToken: function (t) {
            token = (t || '').trim();
            try { localStorage.setItem('cms_gh_token', token); } catch (e) { }
        },
        clearToken: function () {
            token = null;
            try { localStorage.removeItem('cms_gh_token'); } catch (e) { }
        },
        login: function (pwd) {
            if (pwd !== CONFIG.password) return Promise.resolve({ ok: false, reason: 'password' });
            if (!token) return Promise.resolve({ ok: false, reason: 'token' });
            // verify the stored token still works
            return fetch(API, { headers: { 'Authorization': 'token ' + token } })
                .then(function (r) { return r.ok ? { ok: true } : { ok: false, reason: 'token' }; })
                .catch(function () { return { ok: false, reason: 'token' }; });
        },
        loadText: function (path) {
            return fetch(API + '/contents/' + path + '?ref=' + CONFIG.branch + '&t=' + Date.now(), {
                headers: { 'Authorization': 'token ' + token }
            }).then(function (r) {
                if (r.status === 401) { authLost(); throw new Error('انتهت صلاحية مفتاح الوصول — يرجى إدخاله من جديد'); }
                if (r.status === 404) return null;
                if (!r.ok) throw new Error('load ' + path + ' → ' + r.status);
                return r.json().then(function (j) { return b64decodeUtf8(j.content); });
            });
        },
        saveText: function (path, text, message) {
            return fetch(API + '/contents/' + path + '?ref=' + CONFIG.branch + '&t=' + Date.now(), {
                headers: { 'Authorization': 'token ' + token }
            }).then(function (r) { return r.ok ? r.json() : null; }).then(function (cur) {
                var body = { message: message || ('Admin: update ' + path), content: b64encode(text), branch: CONFIG.branch };
                if (cur && cur.sha) body.sha = cur.sha;
                return fetch(API + '/contents/' + path, {
                    method: 'PUT',
                    headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            }).then(function (r) {
                if (r.status === 401) { authLost(); throw new Error('انتهت صلاحية مفتاح الوصول — يرجى إدخاله من جديد'); }
                if (!r.ok) return r.text().then(function (t) { throw new Error(t); });
                return r.json();
            });
        },
        uploadImage: function (file) {
            return fileToDataURL(file).then(function (durl) {
                var b64 = durl.split(',')[1];
                var path = 'v2/uploads/' + Date.now() + '_' + safeName(file.name);
                var body = { message: 'Admin: upload ' + path, content: b64, branch: CONFIG.branch };
                return fetch(API + '/contents/' + path, {
                    method: 'PUT',
                    headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                }).then(function (r) {
                    if (r.status === 401) { authLost(); throw new Error('انتهت صلاحية مفتاح الوصول — يرجى إدخاله من جديد'); }
                    if (!r.ok) return r.text().then(function (t) { throw new Error(t); });
                    return '/' + path;
                });
            });
        },
        publishDelayNote: 'سيظهر التعديل على الموقع خلال دقيقة تقريباً.'
    };

    /* ---------- PHP backend (the site's own server) ---------- */
    function phpCall(payload) {
        payload.password = pwdMem;
        return fetch(PHP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (r) { return r.json(); }).then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || 'server error');
            return j;
        });
    }
    var PH = {
        requiresToken: false,
        hasToken: function () { return true; },
        setToken: function () { },
        clearToken: function () { },
        login: function (pwd) {
            pwdMem = pwd;
            return phpCall({ action: 'login' }).then(function () { return { ok: true }; })
                .catch(function () { pwdMem = null; return { ok: false, reason: 'password' }; });
        },
        loadText: function (path) {
            return phpCall({ action: 'get', path: path }).then(function (j) { return j.content; })
                .catch(function (e) { if (String(e.message).indexOf('not found') !== -1) return null; throw e; });
        },
        saveText: function (path, text) {
            return phpCall({ action: 'save', path: path, content: b64encode(text) });
        },
        uploadImage: function (file) {
            return fileToDataURL(file).then(function (durl) {
                return phpCall({ action: 'upload', name: safeName(file.name), data: durl.split(',')[1] });
            }).then(function (j) { return j.path; });
        },
        publishDelayNote: 'تم الحفظ مباشرة على السيرفر.'
    };

    var impl = MODE === 'php' ? PH : GH;

    window.CMS = {
        mode: MODE,
        siteURL: SITE_URL,                      // absolute, no trailing slash
        requiresToken: impl.requiresToken,       // true on GitHub hosting
        hasToken: function () { return impl.hasToken(); },
        setToken: function (t) { return impl.setToken(t); },
        clearToken: function () { return impl.clearToken(); },
        setAuthErrorHandler: function (fn) { onAuthErr = (typeof fn === 'function') ? fn : function () { }; },
        login: function (pwd) { return impl.login(pwd); },   // resolves { ok, reason }
        loadText: function (path) { return impl.loadText(path); },
        saveText: function (path, text, message) { return impl.saveText(path, text, message); },
        uploadImage: function (file) { return impl.uploadImage(file); },
        publishDelayNote: impl.publishDelayNote,
        fileToDataURL: fileToDataURL
    };
})();

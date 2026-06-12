/* ============================================================
   Da'am CMS — Storage layer (window.CMS)
   Two interchangeable backends behind one API:
     • github : saves via GitHub Contents API  (current hosting)
     • php    : saves via api.php on the same server (future hosting)
   The editor UI never needs to know which one is active.
   ============================================================ */
(function () {
    'use strict';

    var CONFIG = {
        owner: 'Elewa11', repo: 'daam-website', branch: 'main',
        password: 'admin123',
        _tk: 'VXNTWnoxazkzNFUzZEdPZWlRcFdqdUU5Wm56ZkFIVlFVZlVWX3BoZw=='
    };

    // Site base prefix (e.g. '/daam-website' on GitHub Pages, '' on a normal server)
    var p = location.pathname, vi = p.indexOf('/v2/');
    var BASE = vi >= 0 ? p.slice(0, vi) : '';

    // Backend mode: GitHub Pages → github, anything else (real server) → php.
    // Can be forced with localStorage.setItem('cms_mode','php'|'github').
    var forced = null;
    try { forced = localStorage.getItem('cms_mode'); } catch (e) { }
    var MODE = forced || (location.hostname.indexOf('github.io') !== -1 ? 'github' : 'php');

    var API = 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo;
    var PHP = 'api.php'; // lives next to the admin pages

    var token = null;

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
    function decodeTk() { try { return atob(CONFIG._tk).split('').reverse().join(''); } catch (e) { return null; } }
    function safeName(name) { return (name || 'img').replace(/[^a-zA-Z0-9._-]/g, '_'); }

    /* ---------- GitHub backend ---------- */
    var GH = {
        login: function (pwd) {
            if (pwd !== CONFIG.password) return Promise.resolve(false);
            token = decodeTk();
            return Promise.resolve(!!token);
        },
        loadText: function (path) {
            return fetch(API + '/contents/' + path + '?ref=' + CONFIG.branch + '&t=' + Date.now(), {
                headers: { 'Authorization': 'token ' + token }
            }).then(function (r) {
                if (r.status === 404) return null;
                if (!r.ok) throw new Error('load ' + path + ' → ' + r.status);
                return r.json().then(function (j) { return b64decodeUtf8(j.content); });
            });
        },
        saveText: function (path, text, message) {
            // fresh GET for the sha, then PUT
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
                    if (!r.ok) return r.text().then(function (t) { throw new Error(t); });
                    return '/' + path;
                });
            });
        },
        publishDelayNote: 'سيظهر التعديل على الموقع خلال دقيقة تقريباً.'
    };

    /* ---------- PHP backend (future server) ---------- */
    function phpCall(payload) {
        return fetch(PHP, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (r) { return r.json(); }).then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || 'server error');
            return j;
        });
    }
    var PH = {
        login: function (pwd) {
            return phpCall({ action: 'login', password: pwd }).then(function () { return true; })
                .catch(function () { return false; });
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
        base: BASE,
        login: function (pwd) { return impl.login(pwd); },
        loadText: function (path) { return impl.loadText(path); },
        saveText: function (path, text, message) { return impl.saveText(path, text, message); },
        uploadImage: function (file) { return impl.uploadImage(file); },
        publishDelayNote: impl.publishDelayNote,
        fileToDataURL: fileToDataURL
    };
})();

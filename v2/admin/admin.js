/* ============================================================
   Da'am Foundation v2 — Admin (News + Team manager)
   Saves to GitHub via the Contents API. Login = password only;
   the access token is embedded (same as the legacy admin).
   ============================================================ */
(function () {
    'use strict';

    var CONFIG = {
        owner: 'Elewa11', repo: 'daam-website', branch: 'main',
        password: 'admin123',
        _tk: 'VXNTWnoxazkzNFUzZEdPZWlRcFdqdUU5Wm56ZkFIVlFVZlVWX3BoZw=='
    };
    var API = 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo;

    // Base path of the deployed site (e.g. /daam-website)
    var p = location.pathname, vi = p.indexOf('/v2/');
    var BASE = vi >= 0 ? p.slice(0, vi) : '';

    var state = {
        token: null,
        news: { posts: [] }, newsSha: null,
        team: { members: [] }, teamSha: null,
        editingId: null,
        coverPath: null   // root-relative path of the chosen cover image
    };

    // ---------- helpers ----------
    function $(id) { return document.getElementById(id); }
    function decodeTk() { try { return atob(CONFIG._tk).split('').reverse().join(''); } catch (e) { return null; } }
    function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

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
    function readDataURL(file) {
        return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(file); });
    }
    function toast(msg, kind) {
        var t = $('toast'); t.textContent = msg; t.className = 'toast show ' + (kind || '');
        setTimeout(function () { t.className = 'toast'; }, 3200);
    }
    function loading(on, text) { $('loadingText').textContent = text || 'جارٍ الحفظ...'; $('loading').className = 'loading' + (on ? ' show' : ''); }

    // ---------- GitHub API ----------
    function ghGet(path) {
        return fetch(API + '/contents/' + path + '?ref=' + CONFIG.branch + '&t=' + Date.now(), {
            headers: { 'Authorization': 'token ' + state.token }
        }).then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error('GET ' + path + ' ' + r.status); return r.json(); });
    }
    function ghPut(path, b64, message, sha) {
        var body = { message: message, content: b64, branch: CONFIG.branch };
        if (sha) body.sha = sha;
        return fetch(API + '/contents/' + path, {
            method: 'PUT',
            headers: { 'Authorization': 'token ' + state.token, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error(t); }); return r.json(); });
    }
    // Upload an image file, return its root-relative path (/v2/uploads/..)
    function uploadImageFile(file) {
        return readDataURL(file).then(function (durl) {
            var b64 = durl.split(',')[1];
            var safe = (file.name || 'img').replace(/[^a-zA-Z0-9._-]/g, '_');
            var path = 'v2/uploads/' + Date.now() + '_' + safe;
            return ghPut(path, b64, 'Admin: upload image ' + safe, null).then(function () { return '/' + path; });
        });
    }
    function saveNews() {
        return ghGet('v2/data/news.json').then(function (cur) {
            var sha = cur ? cur.sha : null;
            return ghPut('v2/data/news.json', b64encode(JSON.stringify(state.news, null, 2)), 'Admin: update news', sha);
        }).then(function (res) { state.newsSha = res.content.sha; });
    }
    function saveTeam() {
        return ghGet('v2/data/team.json').then(function (cur) {
            var sha = cur ? cur.sha : null;
            return ghPut('v2/data/team.json', b64encode(JSON.stringify(state.team, null, 2)), 'Admin: update team', sha);
        }).then(function (res) { state.teamSha = res.content.sha; });
    }

    // ---------- Auth ----------
    function login() {
        var pwd = $('pwd').value.trim();
        if (pwd !== CONFIG.password) { $('loginErr').style.display = 'block'; return; }
        $('loginErr').style.display = 'none';
        state.token = decodeTk() || localStorage.getItem('daam_admin_token');
        if (!state.token) { toast('تعذّر الحصول على مفتاح الوصول', 'bad'); return; }
        sessionStorage.setItem('daam_v2_admin', '1');
        showApp();
    }
    function showApp() {
        $('login').classList.add('hidden');
        $('app').classList.remove('hidden');
        loadAll();
    }
    function logout() { sessionStorage.removeItem('daam_v2_admin'); location.reload(); }

    function loadAll() {
        loading(true, 'جارٍ تحميل البيانات...');
        Promise.all([ghGet('v2/data/news.json'), ghGet('v2/data/team.json')]).then(function (r) {
            if (r[0]) { state.news = JSON.parse(b64decodeUtf8(r[0].content)); state.newsSha = r[0].sha; }
            if (r[1]) { state.team = JSON.parse(b64decodeUtf8(r[1].content)); state.teamSha = r[1].sha; }
            renderNews(); renderTeam(); loading(false);
        }).catch(function (e) { loading(false); toast('تعذّر تحميل البيانات', 'bad'); console.error(e); });
    }

    // ---------- News list ----------
    function renderNews() {
        var list = $('newsList'), posts = state.news.posts || [];
        if (!posts.length) { list.innerHTML = '<p class="muted">لا توجد أخبار بعد. اضغط «خبر جديد» للإضافة.</p>'; return; }
        list.innerHTML = posts.map(function (p) {
            return '<div class="news-item">'
                + '<div class="thumb"><img src="' + BASE + p.image + '" alt=""></div>'
                + '<div class="body"><span class="tag">' + esc(p.tag_ar || 'خبر') + '</span>'
                + '<h3>' + esc(p.title_ar || '') + '</h3>'
                + '<div class="meta"><i class="far fa-calendar"></i> ' + esc(p.date || '') + '</div>'
                + '<div class="row"><button class="btn ghost sm" data-edit="' + esc(p.id) + '"><i class="fas fa-pen"></i> تعديل</button>'
                + '<button class="btn danger sm" data-del="' + esc(p.id) + '"><i class="fas fa-trash"></i> حذف</button></div>'
                + '</div></div>';
        }).join('');
        list.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { openPost(b.getAttribute('data-edit')); }; });
        list.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { delPost(b.getAttribute('data-del')); }; });
    }

    // ---------- Post editor ----------
    function openPost(id) {
        var post = id ? (state.news.posts || []).filter(function (x) { return x.id === id; })[0] : null;
        state.editingId = id || null;
        $('modalTitle').textContent = post ? 'تعديل الخبر' : 'خبر جديد';
        $('f_tag_ar').value = post ? (post.tag_ar || '') : 'خبر';
        $('f_tag_en').value = post ? (post.tag_en || '') : 'News';
        $('f_date').value = post ? (post.date || '') : '2025';
        $('f_title_ar').value = post ? (post.title_ar || '') : '';
        $('f_title_en').value = post ? (post.title_en || '') : '';
        $('f_excerpt_ar').value = post ? (post.excerpt_ar || '') : '';
        $('f_excerpt_en').value = post ? (post.excerpt_en || '') : '';
        $('body_ar').innerHTML = post ? (post.body_ar || '') : '';
        $('body_en').innerHTML = post ? (post.body_en || '') : '';
        state.coverPath = post ? post.image : null;
        setCoverPreview(state.coverPath ? BASE + state.coverPath : null);
        $('postModal').classList.add('open');
    }
    function closePost() { $('postModal').classList.remove('open'); }
    function setCoverPreview(src) {
        if (src) { $('coverImg').src = src; $('coverImg').style.display = 'block'; $('coverPh').style.display = 'none'; }
        else { $('coverImg').style.display = 'none'; $('coverPh').style.display = 'block'; }
    }

    function slug(s) { return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

    function savePost() {
        var title_ar = $('f_title_ar').value.trim();
        if (!title_ar) { toast('أدخل عنوان الخبر بالعربية', 'bad'); return; }
        if (!state.coverPath) { toast('اختر صورة للخبر', 'bad'); return; }
        var post = {
            id: state.editingId || (slug($('f_title_en').value) || 'post-' + Date.now()),
            date: $('f_date').value.trim(),
            image: state.coverPath,
            tag_ar: $('f_tag_ar').value.trim(), tag_en: $('f_tag_en').value.trim(),
            title_ar: title_ar, title_en: $('f_title_en').value.trim(),
            excerpt_ar: $('f_excerpt_ar').value.trim(), excerpt_en: $('f_excerpt_en').value.trim(),
            body_ar: $('body_ar').innerHTML.trim(), body_en: $('body_en').innerHTML.trim()
        };
        var posts = state.news.posts || (state.news.posts = []);
        var idx = posts.findIndex(function (x) { return x.id === post.id; });
        if (idx >= 0) posts[idx] = post; else posts.unshift(post);

        loading(true, 'جارٍ نشر الخبر...');
        saveNews().then(function () {
            loading(false); closePost(); renderNews();
            toast('تم نشر الخبر بنجاح ✓ (يظهر خلال دقيقة)', 'ok');
        }).catch(function (e) { loading(false); toast('فشل الحفظ: ' + e.message, 'bad'); console.error(e); });
    }

    function delPost(id) {
        if (!confirm('هل تريد حذف هذا الخبر نهائياً؟')) return;
        state.news.posts = (state.news.posts || []).filter(function (x) { return x.id !== id; });
        loading(true, 'جارٍ الحذف...');
        saveNews().then(function () { loading(false); renderNews(); toast('تم حذف الخبر', 'ok'); })
            .catch(function (e) { loading(false); toast('فشل الحذف: ' + e.message, 'bad'); });
    }

    // ---------- Rich text editors ----------
    var savedRange = null;
    function rememberSel() { var s = window.getSelection(); if (s.rangeCount) savedRange = s.getRangeAt(0); }
    function restoreSel(area) { area.focus(); if (savedRange) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); } }
    function exec(cmd, val) { document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val || null); }

    function buildToolbar(wrap) {
        var bar = wrap.querySelector('.rt-toolbar'), area = wrap.querySelector('.rt-area');
        bar.innerHTML =
            '<button data-cmd="bold" title="عريض"><i class="fas fa-bold"></i></button>'
            + '<button data-cmd="italic" title="مائل"><i class="fas fa-italic"></i></button>'
            + '<button data-cmd="underline" title="تسطير"><i class="fas fa-underline"></i></button>'
            + '<span class="sep"></span>'
            + '<select data-block title="نوع النص"><option value="P">نص عادي</option><option value="H2">عنوان كبير</option><option value="H3">عنوان فرعي</option></select>'
            + '<select data-size title="حجم الخط"><option value="">الحجم</option><option value="2">صغير</option><option value="3">عادي</option><option value="5">كبير</option><option value="6">ضخم</option></select>'
            + '<span class="sep"></span>'
            + '<label class="color" title="لون النص"><i class="fas fa-font"></i><input type="color" data-fore></label>'
            + '<label class="color" title="لون التظليل"><i class="fas fa-highlighter"></i><input type="color" data-hi></label>'
            + '<span class="sep"></span>'
            + '<button data-cmd="justifyRight" title="يمين"><i class="fas fa-align-right"></i></button>'
            + '<button data-cmd="justifyCenter" title="وسط"><i class="fas fa-align-center"></i></button>'
            + '<button data-cmd="justifyLeft" title="يسار"><i class="fas fa-align-left"></i></button>'
            + '<button data-cmd="insertUnorderedList" title="نقاط"><i class="fas fa-list-ul"></i></button>'
            + '<button data-cmd="insertOrderedList" title="ترقيم"><i class="fas fa-list-ol"></i></button>'
            + '<span class="sep"></span>'
            + '<button data-link title="رابط"><i class="fas fa-link"></i></button>'
            + '<button data-img title="إدراج صورة"><i class="fas fa-image"></i></button>'
            + '<button data-cmd="removeFormat" title="إزالة التنسيق"><i class="fas fa-eraser"></i></button>';

        area.addEventListener('keyup', rememberSel);
        area.addEventListener('mouseup', rememberSel);
        area.addEventListener('blur', rememberSel);

        // command buttons: preventDefault on mousedown to keep selection
        bar.addEventListener('mousedown', function (e) {
            var b = e.target.closest('button[data-cmd]');
            if (b) { e.preventDefault(); exec(b.getAttribute('data-cmd')); }
        });
        bar.querySelector('[data-block]').addEventListener('change', function () { restoreSel(area); exec('formatBlock', this.value); this.selectedIndex = 0; });
        bar.querySelector('[data-size]').addEventListener('change', function () { if (!this.value) return; restoreSel(area); exec('fontSize', this.value); this.selectedIndex = 0; });
        bar.querySelector('[data-fore]').addEventListener('input', function () { restoreSel(area); exec('foreColor', this.value); });
        bar.querySelector('[data-hi]').addEventListener('input', function () { restoreSel(area); exec('hiliteColor', this.value); });
        bar.querySelector('[data-link]').addEventListener('mousedown', function (e) {
            e.preventDefault(); var u = prompt('أدخل الرابط:'); if (u) exec('createLink', u);
        });
        bar.querySelector('[data-img]').addEventListener('mousedown', function (e) {
            e.preventDefault();
            var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = function () {
                if (!inp.files[0]) return;
                loading(true, 'جارٍ رفع الصورة...');
                uploadImageFile(inp.files[0]).then(function (path) {
                    loading(false); restoreSel(area); exec('insertImage', BASE + path);
                }).catch(function (er) { loading(false); toast('فشل رفع الصورة', 'bad'); });
            };
            inp.click();
        });
    }

    // ---------- Team ----------
    function renderTeam() {
        var list = $('teamList'), members = state.team.members || [];
        list.innerHTML = members.map(function (m, i) {
            return '<div class="team-card" data-i="' + i + '">'
                + '<img class="ph" src="' + BASE + m.photo + '" data-photo title="اضغط لتغيير الصورة">'
                + '<input data-name placeholder="الاسم" value="' + esc(m.name_ar || '') + '">'
                + '<input data-role placeholder="المسمى (اختياري)" value="' + esc(m.role_ar || '') + '">'
                + '<div class="row"><button class="btn danger sm" data-remove style="flex:1"><i class="fas fa-trash"></i> حذف</button></div>'
                + '</div>';
        }).join('');
        list.querySelectorAll('.team-card').forEach(function (card) {
            var i = +card.getAttribute('data-i');
            card.querySelector('[data-name]').addEventListener('input', function () { state.team.members[i].name_ar = this.value; });
            card.querySelector('[data-role]').addEventListener('input', function () { state.team.members[i].role_ar = this.value; });
            card.querySelector('[data-photo]').addEventListener('click', function () {
                var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
                inp.onchange = function () {
                    if (!inp.files[0]) return;
                    loading(true, 'جارٍ رفع الصورة...');
                    uploadImageFile(inp.files[0]).then(function (path) {
                        state.team.members[i].photo = path; loading(false);
                        readDataURL(inp.files[0]).then(function (d) { card.querySelector('[data-photo]').src = d; });
                        toast('تم رفع الصورة، اضغط «حفظ الفريق» للنشر', 'ok');
                    }).catch(function () { loading(false); toast('فشل رفع الصورة', 'bad'); });
                };
                inp.click();
            });
            card.querySelector('[data-remove]').addEventListener('click', function () {
                if (!confirm('حذف هذا العضو؟')) return;
                state.team.members.splice(i, 1); renderTeam();
            });
        });
    }
    function addMember() {
        (state.team.members || (state.team.members = [])).push({ id: 'm' + Date.now(), name_ar: '', name_en: '', role_ar: '', role_en: '', photo: '/assets/images/team_1.png' });
        renderTeam();
    }
    function commitTeam() {
        loading(true, 'جارٍ نشر الفريق...');
        saveTeam().then(function () { loading(false); toast('تم حفظ الفريق ونشره ✓', 'ok'); })
            .catch(function (e) { loading(false); toast('فشل الحفظ: ' + e.message, 'bad'); });
    }

    // ---------- Wire up ----------
    document.addEventListener('DOMContentLoaded', function () {
        $('loginBtn').addEventListener('click', login);
        $('pwd').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
        $('logoutBtn').addEventListener('click', logout);

        document.querySelectorAll('.tab').forEach(function (t) {
            t.addEventListener('click', function () {
                document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
                t.classList.add('active');
                var tab = t.getAttribute('data-tab');
                $('view-news').classList.toggle('hidden', tab !== 'news');
                $('view-team').classList.toggle('hidden', tab !== 'team');
            });
        });

        $('newPostBtn').addEventListener('click', function () { openPost(null); });
        $('closeModal').addEventListener('click', closePost);
        $('cancelPost').addEventListener('click', closePost);
        $('savePost').addEventListener('click', savePost);
        $('coverPick').addEventListener('click', function () { $('coverInput').click(); });
        $('coverInput').addEventListener('change', function () {
            if (!this.files[0]) return;
            loading(true, 'جارٍ رفع الصورة...');
            uploadImageFile(this.files[0]).then(function (path) {
                state.coverPath = path; loading(false);
                readDataURL($('coverInput').files[0]).then(setCoverPreview);
            }).catch(function () { loading(false); toast('فشل رفع الصورة', 'bad'); });
        });

        $('addMemberBtn').addEventListener('click', addMember);
        $('saveTeamBtn').addEventListener('click', commitTeam);

        document.querySelectorAll('.rt-wrap').forEach(buildToolbar);

        if (sessionStorage.getItem('daam_v2_admin') === '1') { state.token = decodeTk(); if (state.token) showApp(); }
    });
})();

/* ============================================================
   Da'am Foundation v2 — Admin app
   Tabs: site pages (visual editor) + news + team.
   All persistence goes through window.CMS (storage.js), which
   targets GitHub now and api.php after moving to a new server.
   ============================================================ */
(function () {
    'use strict';

    var PASSWORD_HINT_KEY = 'daam_v2_admin';

    // Editable site pages shown in the "صفحات الموقع" tab
    var PAGES_AR = [
        { file: 'index.html', label: 'الرئيسية', icon: 'fa-house' },
        { file: 'about/index.html', label: 'من نحن', icon: 'fa-circle-info' },
        { file: 'programs/index.html', label: 'برامجنا', icon: 'fa-layer-group' },
        { file: 'projects/index.html', label: 'مشروعاتنا', icon: 'fa-diagram-project' },
        { file: 'media/index.html', label: 'المركز الإعلامي', icon: 'fa-newspaper' },
        { file: 'participate/index.html', label: 'انضم إلينا', icon: 'fa-handshake-angle' },
        { file: 'contact/index.html', label: 'تواصل معنا', icon: 'fa-envelope' },
        { file: 'post/index.html', label: 'قالب صفحة الخبر', icon: 'fa-file-lines' }
    ];
    var PAGES_EN = [
        { file: 'en/index.html', label: 'Home', icon: 'fa-house' },
        { file: 'en/about/index.html', label: 'About', icon: 'fa-circle-info' },
        { file: 'en/programs/index.html', label: 'Programs', icon: 'fa-layer-group' },
        { file: 'en/projects/index.html', label: 'Projects', icon: 'fa-diagram-project' },
        { file: 'en/media/index.html', label: 'Media Center', icon: 'fa-newspaper' },
        { file: 'en/participate/index.html', label: 'Join Us', icon: 'fa-handshake-angle' },
        { file: 'en/contact/index.html', label: 'Contact', icon: 'fa-envelope' },
        { file: 'en/post/index.html', label: 'Post template', icon: 'fa-file-lines' }
    ];

    var state = {
        news: { posts: [] },
        team: { members: [] },
        editingId: null,
        coverPath: null
    };

    /* ---------- small helpers ---------- */
    function $(id) { return document.getElementById(id); }
    function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function toast(msg, kind) {
        var t = $('toast'); t.textContent = msg; t.className = 'toast show ' + (kind || '');
        setTimeout(function () { t.className = 'toast'; }, 3500);
    }
    function loading(on, text) {
        $('loadingText').textContent = text || 'جارٍ الحفظ...';
        $('loading').className = 'loading' + (on ? ' show' : '');
    }
    function imgURL(rootRel) {
        // preview URL for a stored root-relative path like /assets/.. or /v2/uploads/..
        return CMS.siteURL + rootRel;
    }

    /* ---------- auth ---------- */
    function loginErr(msg) { var e = $('loginErr'); e.textContent = msg; e.style.display = 'block'; }
    function showTokenSetup() { $('tokenSetup').classList.remove('hidden'); $('loginErr').style.display = 'none'; }
    function hideTokenSetup() { $('tokenSetup').classList.add('hidden'); }

    function login() {
        var pwd = $('pwd').value.trim();
        if (!pwd) { loginErr('أدخل كلمة المرور'); return; }
        loading(true, 'جارٍ التحقق...');
        CMS.login(pwd).then(function (res) {
            loading(false);
            if (res && res.ok) {
                $('loginErr').style.display = 'none'; hideTokenSetup();
                try { sessionStorage.setItem(PASSWORD_HINT_KEY, pwd); } catch (e) { }
                showApp();
                return;
            }
            if (res && res.reason === 'token') { showTokenSetup(); return; }
            loginErr('كلمة المرور غير صحيحة.');
        }).catch(function () { loading(false); loginErr('تعذّر الاتصال، حاول مجدداً.'); });
    }
    function saveTokenAndLogin() {
        var t = $('ghToken').value.trim();
        if (!t) { return; }
        CMS.setToken(t);
        login();
    }
    function logout() {
        try { sessionStorage.removeItem(PASSWORD_HINT_KEY); } catch (e) { }
        location.reload();
    }
    // Called by storage.js when the GitHub token is rejected (401) at any time.
    function onAuthLost() {
        try { if (window.PageEditor && PageEditor.close) PageEditor.close(); } catch (e) { }
        $('app').classList.add('hidden');
        $('login').classList.remove('hidden');
        showTokenSetup();
        if ($('ghToken')) $('ghToken').value = '';
        toast('انتهت صلاحية مفتاح الوصول — يرجى إدخاله من جديد', 'bad');
    }
    function showApp() {
        $('login').classList.add('hidden');
        $('app').classList.remove('hidden');
        renderPages();
        loadData();
    }

    /* ---------- data load ---------- */
    function loadData() {
        loading(true, 'جارٍ تحميل البيانات...');
        Promise.all([CMS.loadText('v2/data/news.json'), CMS.loadText('v2/data/team.json')]).then(function (r) {
            if (r[0]) state.news = JSON.parse(r[0]);
            if (r[1]) state.team = JSON.parse(r[1]);
            renderNews(); renderTeam(); loading(false);
        }).catch(function (e) {
            loading(false);
            toast('تعذّر تحميل البيانات: ' + e.message, 'bad');
        });
    }

    /* ---------- pages tab ---------- */
    function renderPages() {
        function card(p) {
            return '<button class="page-card" data-file="' + p.file + '" data-label="' + esc(p.label) + '">'
                + '<span class="ic"><i class="fas ' + p.icon + '"></i></span>'
                + '<span><b>' + esc(p.label) + '</b><span>' + p.file.replace('v2/', '') + '</span></span>'
                + '</button>';
        }
        $('pagesAr').innerHTML = PAGES_AR.map(card).join('');
        $('pagesEn').innerHTML = PAGES_EN.map(card).join('');
        document.querySelectorAll('.page-card').forEach(function (c) {
            c.addEventListener('click', function () {
                PageEditor.open(c.getAttribute('data-file'), c.getAttribute('data-label'));
            });
        });
    }

    /* ---------- news ---------- */
    function renderNews() {
        var list = $('newsList'), posts = state.news.posts || [];
        if (!posts.length) { list.innerHTML = '<p class="muted">لا توجد أخبار بعد. اضغط «خبر جديد» للإضافة.</p>'; return; }
        list.innerHTML = posts.map(function (p) {
            return '<div class="news-item">'
                + '<div class="thumb"><img src="' + imgURL(p.image) + '" alt=""></div>'
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

    function saveNewsFile() {
        return CMS.saveText('v2/data/news.json', JSON.stringify(state.news, null, 2), 'Admin: update news');
    }
    function saveTeamFile() {
        return CMS.saveText('v2/data/team.json', JSON.stringify(state.team, null, 2), 'Admin: update team');
    }

    function openPost(id) {
        var post = id ? (state.news.posts || []).filter(function (x) { return x.id === id; })[0] : null;
        state.editingId = id || null;
        $('modalTitle').textContent = post ? 'تعديل الخبر' : 'خبر جديد';
        $('f_tag_ar').value = post ? (post.tag_ar || '') : 'خبر';
        $('f_tag_en').value = post ? (post.tag_en || '') : 'News';
        $('f_date').value = post ? (post.date || '') : new Date().getFullYear();
        $('f_title_ar').value = post ? (post.title_ar || '') : '';
        $('f_title_en').value = post ? (post.title_en || '') : '';
        $('f_excerpt_ar').value = post ? (post.excerpt_ar || '') : '';
        $('f_excerpt_en').value = post ? (post.excerpt_en || '') : '';
        $('body_ar').innerHTML = post ? (post.body_ar || '') : '';
        $('body_en').innerHTML = post ? (post.body_en || '') : '';
        state.coverPath = post ? post.image : null;
        setCoverPreview(state.coverPath ? imgURL(state.coverPath) : null);
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
        saveNewsFile().then(function () {
            loading(false); closePost(); renderNews();
            toast('تم نشر الخبر ✓ ' + CMS.publishDelayNote, 'ok');
        }).catch(function (e) { loading(false); toast('فشل الحفظ: ' + e.message, 'bad'); });
    }

    function delPost(id) {
        if (!confirm('هل تريد حذف هذا الخبر نهائياً؟')) return;
        state.news.posts = (state.news.posts || []).filter(function (x) { return x.id !== id; });
        loading(true, 'جارٍ الحذف...');
        saveNewsFile().then(function () { loading(false); renderNews(); toast('تم حذف الخبر', 'ok'); })
            .catch(function (e) { loading(false); toast('فشل الحذف: ' + e.message, 'bad'); });
    }

    /* ---------- rich text (news modal) ---------- */
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

        bar.addEventListener('mousedown', function (e) {
            var b = e.target.closest('button[data-cmd]');
            if (b) { e.preventDefault(); restoreSel(area); exec(b.getAttribute('data-cmd')); }
        });
        bar.querySelector('[data-block]').addEventListener('change', function () { restoreSel(area); exec('formatBlock', this.value); this.selectedIndex = 0; });
        bar.querySelector('[data-size]').addEventListener('change', function () { if (!this.value) return; restoreSel(area); exec('fontSize', this.value); this.selectedIndex = 0; });
        bar.querySelector('[data-fore]').addEventListener('input', function () { restoreSel(area); exec('foreColor', this.value); });
        bar.querySelector('[data-hi]').addEventListener('input', function () { restoreSel(area); exec('hiliteColor', this.value); });
        bar.querySelector('[data-link]').addEventListener('mousedown', function (e) {
            e.preventDefault(); var u = prompt('أدخل الرابط:'); if (u) { restoreSel(area); exec('createLink', u); }
        });
        bar.querySelector('[data-img]').addEventListener('mousedown', function (e) {
            e.preventDefault();
            var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = function () {
                if (!inp.files[0]) return;
                loading(true, 'جارٍ رفع الصورة...');
                CMS.uploadImage(inp.files[0]).then(function (path) {
                    loading(false); restoreSel(area); exec('insertImage', imgURL(path));
                }).catch(function () { loading(false); toast('فشل رفع الصورة', 'bad'); });
            };
            inp.click();
        });
    }

    /* ---------- team ---------- */
    function renderTeam() {
        var list = $('teamList'), members = state.team.members || [];
        if (!members.length) { list.innerHTML = '<p class="muted">لا يوجد أعضاء بعد. اضغط «عضو جديد» للإضافة.</p>'; return; }
        list.innerHTML = members.map(function (m, i) {
            return '<div class="team-card" data-i="' + i + '">'
                + '<div class="tc-move">'
                + '<button class="mv" data-up title="تحريك لأعلى/لليمين" ' + (i === 0 ? 'disabled' : '') + '><i class="fas fa-arrow-up"></i></button>'
                + '<span class="tc-order">' + (i + 1) + '</span>'
                + '<button class="mv" data-down title="تحريك لأسفل/لليسار" ' + (i === members.length - 1 ? 'disabled' : '') + '><i class="fas fa-arrow-down"></i></button>'
                + '</div>'
                + '<img class="ph" src="' + imgURL(m.photo) + '" data-photo title="اضغط لتغيير الصورة" onerror="this.style.opacity=.35">'
                + '<button class="tc-photo-btn" data-photo2><i class="fas fa-camera"></i> تغيير الصورة</button>'
                + '<input data-k="name_ar" placeholder="الاسم (عربي)" value="' + esc(m.name_ar || '') + '">'
                + '<input data-k="name_en" placeholder="Name (English)" dir="ltr" value="' + esc(m.name_en || '') + '">'
                + '<input data-k="role_ar" placeholder="المسمى الوظيفي (عربي)" value="' + esc(m.role_ar || '') + '">'
                + '<input data-k="role_en" placeholder="Role (English)" dir="ltr" value="' + esc(m.role_en || '') + '">'
                + '<div class="row"><button class="btn danger sm" data-remove style="flex:1"><i class="fas fa-trash"></i> حذف العضو</button></div>'
                + '</div>';
        }).join('');
        list.querySelectorAll('.team-card').forEach(function (card) {
            var i = +card.getAttribute('data-i');
            card.querySelectorAll('input[data-k]').forEach(function (inp) {
                inp.addEventListener('input', function () { state.team.members[i][inp.getAttribute('data-k')] = this.value; });
            });
            card.querySelector('[data-photo]').addEventListener('click', function () { pickPhoto(i, card); });
            card.querySelector('[data-photo2]').addEventListener('click', function () { pickPhoto(i, card); });
            var up = card.querySelector('[data-up]'), dn = card.querySelector('[data-down]');
            if (up) up.addEventListener('click', function () { if (!up.disabled) moveMember(i, -1); });
            if (dn) dn.addEventListener('click', function () { if (!dn.disabled) moveMember(i, 1); });
            card.querySelector('[data-remove]').addEventListener('click', function () {
                if (!confirm('حذف هذا العضو؟')) return;
                state.team.members.splice(i, 1); renderTeam();
            });
        });
    }
    function pickPhoto(i, card) {
        var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = function () {
            if (!inp.files[0]) return;
            loading(true, 'جارٍ رفع الصورة...');
            CMS.uploadImage(inp.files[0]).then(function (path) {
                state.team.members[i].photo = path; loading(false);
                CMS.fileToDataURL(inp.files[0]).then(function (d) { var im = card.querySelector('[data-photo]'); im.src = d; im.style.opacity = 1; });
                toast('تم رفع الصورة، اضغط «حفظ الفريق ونشره»', 'ok');
            }).catch(function () { loading(false); toast('فشل رفع الصورة', 'bad'); });
        };
        inp.click();
    }
    function moveMember(i, dir) {
        var a = state.team.members, j = i + dir;
        if (j < 0 || j >= a.length) return;
        var t = a[i]; a[i] = a[j]; a[j] = t;
        renderTeam();
    }
    function addMember() {
        (state.team.members || (state.team.members = [])).push({ id: 'm' + Date.now(), name_ar: '', name_en: '', role_ar: '', role_en: '', photo: '/assets/images/team_1.png' });
        renderTeam();
        var cards = $('teamList').querySelectorAll('.team-card');
        if (cards.length) cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function commitTeam() {
        loading(true, 'جارٍ نشر الفريق...');
        saveTeamFile().then(function () { loading(false); toast('تم حفظ الفريق ونشره ✓ ' + CMS.publishDelayNote, 'ok'); })
            .catch(function (e) { loading(false); toast('فشل الحفظ: ' + e.message, 'bad'); });
    }

    /* ---------- boot ---------- */
    document.addEventListener('DOMContentLoaded', function () {
        $('loginBtn').addEventListener('click', login);
        $('pwd').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
        $('logoutBtn').addEventListener('click', logout);

        document.querySelectorAll('.tab').forEach(function (t) {
            t.addEventListener('click', function () {
                document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
                t.classList.add('active');
                var tab = t.getAttribute('data-tab');
                $('view-pages').classList.toggle('hidden', tab !== 'pages');
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
            CMS.uploadImage(this.files[0]).then(function (path) {
                state.coverPath = path; loading(false);
                CMS.fileToDataURL($('coverInput').files[0]).then(setCoverPreview);
            }).catch(function () { loading(false); toast('فشل رفع الصورة', 'bad'); });
        });

        $('addMemberBtn').addEventListener('click', addMember);
        $('saveTeamBtn').addEventListener('click', commitTeam);

        document.querySelectorAll('.rt-wrap').forEach(buildToolbar);

        PageEditor.init({ toast: toast, loading: loading });
        if (CMS.setAuthErrorHandler) CMS.setAuthErrorHandler(onAuthLost);

        // point logos and the "view site" link at the live site, wherever the panel is hosted
        var vs = $('viewSite'); if (vs) vs.href = CMS.siteURL + '/v2/index.html';
        document.querySelectorAll('img[data-logo]').forEach(function (im) {
            im.src = CMS.siteURL + '/assets/images/logo_header.png';
        });

        var st = $('saveTokenBtn'); if (st) st.addEventListener('click', saveTokenAndLogin);
        var gt = $('ghToken'); if (gt) gt.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveTokenAndLogin(); });

        // auto-login within the same browser session
        var saved = null;
        try { saved = sessionStorage.getItem(PASSWORD_HINT_KEY); } catch (e) { }
        if (saved) {
            $('pwd').value = saved;
            CMS.login(saved).then(function (res) { if (res && res.ok) showApp(); });
        }
    });
})();

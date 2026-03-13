/* ============================================
   DAAM FOUNDATION — Inline Content Editor (Admin CMS)
   ============================================ */

const CONFIG = {
    owner: 'Elewa11',
    repo: 'daam-website',
    branch: 'main',
    password: 'admin123',
    // Pre-configured access key (obfuscated)
    _tk: 'VXNTWnoxazkzNFUzZEdPZWlRcFdqdUU5Wm56ZkFIVlFVZlVWX3BoZw==',
};

let state = {
    token: null,
    currentPage: 'index.html',
    currentPageSha: null,
    originalHTML: null,
    changes: 0,
    isEditMode: false,
    pendingImageData: null,
    pendingImageTarget: null,
};

// ═══════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════

/**
 * Extracts the repo-relative page path from a full URL pathname.
 * GitHub Pages URLs look like: /daam-website/index.html
 * We need just: index.html
 */
function extractPagePath(fullPathname) {
    // The base path for GitHub Pages is /<repo-name>/
    const repoBase = '/' + CONFIG.repo + '/';
    let path = fullPathname || '';
    
    // Strip the repo base if present
    if (path.indexOf(repoBase) !== -1) {
        path = path.substring(path.indexOf(repoBase) + repoBase.length);
    }
    
    // Strip any leading slashes
    path = path.replace(/^\/+/, '');
    
    // Default to index.html if empty
    if (!path || path === '' || path.endsWith('/')) {
        path = (path || '') + 'index.html';
    }
    
    // Remove trailing slashes before index.html check
    path = path.replace(/\/+$/, '') || 'index.html';
    
    console.log('[Admin] extractPagePath:', fullPathname, '->', path);
    return path;
}

// ═══════════════════════════════════════════
//  AUTHENTICATION
// ═══════════════════════════════════════════

function _decodeTk() {
    try { return atob(CONFIG._tk).split('').reverse().join(''); } catch { return null; }
}

async function handleLogin() {
    const password = document.getElementById('adminPassword').value.trim();
    const errorEl = document.getElementById('loginError');
    const btnText = document.querySelector('.btn-text');
    const btnLoader = document.querySelector('.btn-loader');

    if (!password) { errorEl.style.display = 'block'; return; }

    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-block';
    errorEl.style.display = 'none';

    if (password !== CONFIG.password) {
        errorEl.textContent = 'كلمة المرور غير صحيحة.';
        errorEl.style.display = 'block';
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        return;
    }

    // Use pre-configured token or stored token
    const storedToken = _decodeTk() || localStorage.getItem('daam_admin_token');
    if (storedToken) {
        state.token = storedToken;
        const valid = await validateToken();
        if (valid) {
            localStorage.setItem('daam_admin_token', storedToken);
            localStorage.setItem('daam_admin_session', 'active');
            startEditorSession();
        } else {
            showToast('الرمز المبرمج غير صالح.', 'error');
            document.getElementById('setupSection').style.display = 'block';
        }
    } else {
        document.getElementById('setupSection').style.display = 'block';
    }

    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
}

async function saveSetup() {
    const token = document.getElementById('githubToken').value.trim();
    if (!token) { showToast('يرجى إدخال رمز وصول صحيح.', 'error'); return; }

    state.token = token;
    const valid = await validateToken();
    if (valid) {
        localStorage.setItem('daam_admin_token', token);
        showToast('تم حفظ الإعدادات بنجاح!', 'success');
        startEditorSession();
    } else {
        showToast('الرمز غير صالح.', 'error');
        state.token = null;
    }
}

async function validateToken() {
    try {
        const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}`, {
            headers: { 'Authorization': `token ${state.token}` }
        });
        return res.ok;
    } catch { return false; }
}

function handleLogout() {
    state.token = null;
    localStorage.removeItem('daam_admin_session');
    document.getElementById('editorView').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPassword').value = '';
    document.getElementById('editorFrame').src = 'about:blank';
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // Auto-login if session exists
    const hasSession = localStorage.getItem('daam_admin_session');
    const storedToken = _decodeTk() || localStorage.getItem('daam_admin_token');
    if (hasSession && storedToken) {
        state.token = storedToken;
        validateToken().then(valid => {
            if (valid) {
                startEditorSession();
            }
        });
    }
});

// ═══════════════════════════════════════════
//  EDITOR SESSION & NAVIGATION
// ═══════════════════════════════════════════
function startEditorSession() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('editorView').style.display = 'flex';
    loadPageInEditor('index.html');
}

async function loadPageInEditor(pagePath) {
    if (state.changes > 0) {
        if (!confirm('لديك تعديلات غير محفوظة. هل تريد الانتقال لصفحة أخرى وفقدان التعديلات؟')) {
            return;
        }
    }

    showLoading('جاري تهيئة الصفحة...');
    
    // Ensure pagePath is clean (no repo prefix, no leading slashes)
    pagePath = pagePath.replace(/^\/+/, '');
    
    state.currentPage = pagePath;
    document.getElementById('currentPageLabel').textContent = pagePath;
    state.changes = 0;
    updateChangeUI();

    try {
        // Fetch raw HTML from GitHub for the base save state
        console.log('[Admin] Fetching from GitHub API: contents/' + pagePath);
        const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${pagePath}?ref=${CONFIG.branch}`, {
            headers: { 'Authorization': `token ${state.token}` }
        });

        if (res.ok) {
            const data = await res.json();
            state.currentPageSha = data.sha;
            state.originalHTML = decodeBase64(data.content);
            console.log('[Admin] Fetched OK. SHA:', data.sha);
        } else {
            const errData = await res.json();
            console.warn('[Admin] Could not fetch source from GitHub for', pagePath, errData);
        }

        // Load page in iframe using the live GitHub Pages URL
        const liveBaseUrl = `https://${CONFIG.owner.toLowerCase()}.github.io/${CONFIG.repo}/`;
        const liveUrl = liveBaseUrl + pagePath;
        console.log('[Admin] Loading iframe:', liveUrl);

        const iframe = document.getElementById('editorFrame');
        
        // Safety timeout: always hide loading after 5 seconds
        const safetyTimeout = setTimeout(() => {
            console.log('[Admin] Safety timeout triggered - hiding loading overlay');
            try {
                injectAdminBehaviors(iframe);
                applyModeState();
            } catch(e) {
                console.warn('[Admin] Could not inject (safety):', e.message);
            }
            hideLoading();
        }, 5000);
        
        iframe.onload = () => {
            console.log('[Admin] iframe onload fired');
            clearTimeout(safetyTimeout);
            setTimeout(() => {
                try {
                    injectAdminBehaviors(iframe);
                    applyModeState();
                } catch(e) {
                    console.warn('[Admin] Could not inject into iframe:', e.message);
                }
                hideLoading();
            }, 800);
        };
        
        iframe.src = liveUrl;

    } catch (err) {
        hideLoading();
        showToast('حدث خطأ: ' + err.message, 'error');
    }
}

// ═══════════════════════════════════════════
//  MODE TOGGLE & INJECTION
// ═══════════════════════════════════════════
function toggleMode() {
    state.isEditMode = document.getElementById('modeSwitch').checked;
    applyModeState();
}

function applyModeState() {
    const iframe = document.getElementById('editorFrame');
    try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (!doc || !doc.body) return;

        if (state.isEditMode) {
            doc.body.classList.add('ai-edit-mode');
            document.getElementById('editLabel').classList.add('active-mode');
            document.getElementById('browseLabel').classList.remove('active-mode');
        } else {
            doc.body.classList.remove('ai-edit-mode');
            document.getElementById('browseLabel').classList.add('active-mode');
            document.getElementById('editLabel').classList.remove('active-mode');
        }
    } catch(e) {
        console.warn('[Admin] Cannot access iframe document:', e.message);
    }
}

function injectAdminBehaviors(iframe) {
    const win = iframe.contentWindow;
    const doc = win.document;
    if (!doc || doc.getElementById('ai-admin-styles')) return; // Already injected

    // Intercept link clicks for navigation tracking
    doc.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        if (state.isEditMode) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        const href = link.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:')) {
            e.preventDefault();
            let newPage = href;
            if (newPage.startsWith('./')) newPage = newPage.substring(2);
            if (newPage.startsWith('../')) {
                const parts = state.currentPage.split('/');
                parts.pop();
                newPage = newPage.replace(/^\.\.\//, '');
                newPage = parts.length > 0 ? parts.join('/') + '/' + newPage : newPage;
            }
            newPage = newPage.replace(/^\/+/, '');
            loadPageInEditor(newPage);
        } else if (href && href.startsWith('#')) {
            // Allow anchor scrolling
        } else if (href && href.startsWith('http')) {
            e.preventDefault();
        }
    }, true);

    // ── Inject Enhanced Styles ──
    const style = doc.createElement('style');
    style.id = 'ai-admin-styles';
    style.textContent = `
        /* Editable Text Hover */
        body.ai-edit-mode [data-ai-editable]:hover {
            outline: 2px dashed rgba(0, 74, 173, 0.5) !important;
            outline-offset: 2px !important;
            cursor: text !important;
        }
        body.ai-edit-mode [data-ai-editable]:focus {
            outline: 2px solid #004aad !important;
            outline-offset: 2px !important;
            background: rgba(0, 74, 173, 0.05) !important;
        }
        body.ai-edit-mode .edited {
            outline: 2px solid #28a745 !important;
            outline-offset: 2px !important;
        }
        /* Images */
        body.ai-edit-mode [data-ai-img] {
            cursor: pointer !important;
            transition: 0.2s;
        }
        body.ai-edit-mode [data-ai-img]:hover {
            outline: 3px solid #004aad !important;
            outline-offset: 2px !important;
            filter: brightness(0.85);
        }
        body.ai-edit-mode a[data-ai-editable] {
            cursor: text !important;
        }

        /* ── Section Delete Button ── */
        body.ai-edit-mode section,
        body.ai-edit-mode .section,
        body.ai-edit-mode [class*="section"],
        body.ai-edit-mode .hero,
        body.ai-edit-mode .team-section,
        body.ai-edit-mode .programs-section,
        body.ai-edit-mode .contact-section,
        body.ai-edit-mode .about-section {
            position: relative !important;
        }
        .ai-delete-btn {
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 9999;
            background: #ef4444;
            color: white;
            border: none;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            font-size: 18px;
            cursor: pointer;
            display: none;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: 0.2s;
        }
        .ai-delete-btn:hover { background: #dc2626; transform: scale(1.1); }
        body.ai-edit-mode section:hover > .ai-delete-btn,
        body.ai-edit-mode .section:hover > .ai-delete-btn,
        body.ai-edit-mode [class*="section"]:hover > .ai-delete-btn,
        body.ai-edit-mode .hero:hover > .ai-delete-btn,
        body.ai-edit-mode .team-section:hover > .ai-delete-btn {
            display: flex !important;
        }

        /* ── Floating Rich Text Toolbar (Redesigned) ── */
        #ai-text-toolbar {
            position: fixed;
            top: -100px;
            left: 50%;
            transform: translateX(-50%);
            background: #0f172a;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 5px 8px;
            display: flex;
            align-items: center;
            gap: 2px;
            z-index: 99999;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            transition: top 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            flex-wrap: nowrap;
            height: 40px;
        }
        #ai-text-toolbar.visible { top: 12px; }
        #ai-text-toolbar button {
            background: transparent;
            color: #f1f5f9;
            border: 1px solid transparent;
            width: 32px;
            height: 32px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            font-weight: 600;
        }
        #ai-text-toolbar button:hover { background: rgba(255,255,255,0.1); }
        #ai-text-toolbar button.active { background: #3b82f6; color: white; }
        
        #ai-text-toolbar .separator {
            width: 1px;
            height: 20px;
            background: rgba(255,255,255,0.15);
            margin: 0 6px;
            flex-shrink: 0;
        }
        
        #ai-text-toolbar select {
            background: rgba(255,255,255,0.05);
            color: #f1f5f9;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            padding: 0 10px;
            font-size: 13px;
            cursor: pointer;
            height: 32px;
            min-width: 90px;
            outline: none;
            direction: rtl;
        }
        
        #ai-text-toolbar .color-picker-wrap {
            width: 30px;
            height: 30px;
            border-radius: 4px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255,255,255,0.2);
            cursor: pointer;
            position: relative;
        }
        #ai-text-toolbar .color-picker-wrap input[type="color"] {
            position: absolute;
            top: -10px;
            left: -10px;
            width: 150%;
            height: 150%;
            cursor: pointer;
            border: none;
            background: none;
        }

        /* ── Card placeholder image areas ── */
        body.ai-edit-mode .placeholder-img,
        body.ai-edit-mode .card-img,
        body.ai-edit-mode .team-img,
        body.ai-edit-mode [class*="placeholder"],
        body.ai-edit-mode .card-body img,
        body.ai-edit-mode .card img {
            cursor: pointer !important;
        }
        body.ai-edit-mode .placeholder-img:hover,
        body.ai-edit-mode .card-img:hover,
        body.ai-edit-mode .team-img:hover {
            outline: 3px solid #004aad !important;
            filter: brightness(0.85);
        }
    `;
    doc.head.appendChild(style);

    // ── Create Rich Text Toolbar ──
    const toolbar = doc.createElement('div');
    toolbar.id = 'ai-text-toolbar';
    toolbar.innerHTML = `
        <div class="color-picker-wrap" title="لون الخلفية" style="background: #fbbf24;">
            <input type="color" data-cmd="hiliteColor" value="#fbbf24" oninput="this.parentElement.style.background=this.value">
        </div>
        <div class="color-picker-wrap" title="لون النص" style="background: #ffffff; margin-left: 4px;">
            <input type="color" data-cmd="foreColor" value="#ffffff" oninput="this.parentElement.style.background=this.value">
        </div>
        <div class="separator"></div>
        <select data-cmd="fontSize" title="حجم الخط">
            <option value="">حجم الخط ⌄</option>
            <option value="1">صغير جداً</option>
            <option value="2">صغير</option>
            <option value="3">عادي</option>
            <option value="4">متوسط</option>
            <option value="5">كبير</option>
            <option value="6">كبير جداً</option>
            <option value="7">ضخم</option>
        </select>
        <div class="separator"></div>
        <button data-cmd="justifyRight" title="محاذاة يمين">⫸</button>
        <button data-cmd="justifyCenter" title="توسيط">☰</button>
        <button data-cmd="justifyLeft" title="محاذاة يسار">⫷</button>
        <div class="separator"></div>
        <button data-cmd="underline" title="تسطير"><u>U</u></button>
        <button data-cmd="italic" title="مائل"><i>/</i></button>
        <button data-cmd="bold" title="غامق"><b>B</b></button>
    `;
    doc.body.appendChild(toolbar);

    // Track the currently active range/selection
    let lastRange = null;
    function saveSelection() {
        const sel = doc.getSelection();
        if (sel.rangeCount > 0) {
            lastRange = sel.getRangeAt(0);
        }
    }
    function restoreSelection() {
        if (!lastRange) return;
        const sel = doc.getSelection();
        sel.removeAllRanges();
        sel.addRange(lastRange);
    }

    doc.addEventListener('mouseup', saveSelection);
    doc.addEventListener('keyup', saveSelection);

    // CRITICAL: Prevent toolbar from stealing focus/selection
    toolbar.addEventListener('mousedown', (e) => {
        // If it's a color picker wrap or input, don't prevent default as it blocks the dialog
        // Instead, just make sure we have the latest selection
        if (e.target.closest('.color-picker-wrap')) {
            saveSelection();
        } else {
            e.preventDefault(); // This keeps the text selection alive for buttons
        }
    });

    // Handle button clicks
    toolbar.querySelectorAll('button[data-cmd]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            restoreSelection(); // Ensure we have it
            doc.execCommand(cmd, false, null);
            saveSelection(); // Update it
            // Mark as edited
            const focused = doc.querySelector('[contenteditable="true"]');
            if (focused) {
                focused.classList.add('edited');
                recountChanges(doc);
            }
        });
    });

    // Handle select (font size)
    toolbar.querySelectorAll('select[data-cmd]').forEach(sel => {
        sel.addEventListener('mousedown', (e) => {
            saveSelection();
            e.stopPropagation(); // Allow select to open
        });
        sel.addEventListener('change', (e) => {
            if (sel.value) {
                restoreSelection();
                doc.execCommand(sel.dataset.cmd, false, sel.value);
                sel.value = '';
                saveSelection();
                const focused = doc.querySelector('[contenteditable="true"]');
                if (focused) {
                    focused.classList.add('edited');
                    recountChanges(doc);
                }
            }
        });
    });

    // Handle color inputs
    toolbar.querySelectorAll('input[data-cmd]').forEach(colorInput => {
        colorInput.addEventListener('mousedown', (e) => {
            saveSelection();
            e.stopPropagation(); // Allow color picker to open
        });
        colorInput.addEventListener('input', (e) => {
            restoreSelection();
            doc.execCommand(colorInput.dataset.cmd, false, colorInput.value);
            saveSelection();
            const focused = doc.querySelector('[contenteditable="true"]');
            if (focused) {
                focused.classList.add('edited');
                recountChanges(doc);
            }
        });
    });

    // Track the currently active editable element
    let activeEditable = null;

    // Show toolbar when an editable element gets focus
    doc.addEventListener('focusin', (e) => {
        if (state.isEditMode && e.target.hasAttribute('data-ai-editable')) {
            activeEditable = e.target;
            toolbar.classList.add('visible');
        }
    });

    // Show toolbar when text is selected
    doc.addEventListener('mouseup', () => {
        if (!state.isEditMode) return;
        saveSelection();
        const sel = doc.getSelection();
        if (sel && sel.toString().trim().length > 0) {
            toolbar.classList.add('visible');
        }
    });

    // Hide toolbar only when clicking outside both toolbar and editable elements
    doc.addEventListener('mousedown', (e) => {
        if (e.target.closest('#ai-text-toolbar')) return; // Clicking on toolbar
        if (e.target.hasAttribute('data-ai-editable')) return; // Clicking on editable
        if (e.target.closest('[data-ai-editable]')) return; // Inside editable
        
        // Delay hide to let click handler finish
        setTimeout(() => {
            if (doc.activeElement && doc.activeElement.closest('#ai-text-toolbar')) return;
            toolbar.classList.remove('visible');
            activeEditable = null;
        }, 300);
    });

    // ── Annotate Text Elements ──
    const textSelectors = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, span:not(.fas):not(.fab):not(.far):not(.fa), a, .btn, .btn-primary, .btn-secondary, td, th, label, figcaption, div.card-title, div.card-text, .team-name, .member-name';
    const textElements = doc.querySelectorAll(textSelectors);
    
    textElements.forEach(el => {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
        if (el.children.length > 5 && !el.classList.contains('card-title')) return;
        
        el.setAttribute('data-ai-editable', 'true');
        el.setAttribute('spellcheck', 'false');
        el.dataset.originalText = el.innerHTML;

        el.addEventListener('click', (e) => {
            if (!state.isEditMode) return;
            e.preventDefault();
            e.stopPropagation();
            el.setAttribute('contenteditable', 'true');
            el.focus();
        });

        el.addEventListener('input', () => {
            if (el.innerHTML !== el.dataset.originalText) {
                el.classList.add('edited');
                recountChanges(doc);
            } else {
                el.classList.remove('edited');
                recountChanges(doc);
            }
        });

        el.addEventListener('blur', (e) => {
            // Don't remove contenteditable if user clicked the toolbar
            const relatedTarget = e.relatedTarget;
            if (relatedTarget && relatedTarget.closest('#ai-text-toolbar')) return;
            
            // Small delay to check if focus went to toolbar
            setTimeout(() => {
                if (doc.activeElement && doc.activeElement.closest('#ai-text-toolbar')) return;
                el.removeAttribute('contenteditable');
            }, 150);
        });
    });

    // ── Annotate ALL Images (including cards) ──
    const images = doc.querySelectorAll('img');
    images.forEach(img => {
        // Skip only very tiny icons (< 20px)
        if (img.naturalWidth > 0 && img.naturalWidth < 20) return;

        img.setAttribute('data-ai-img', 'true');
        img.dataset.originalSrc = img.getAttribute('src');

        img.addEventListener('click', (e) => {
            if (!state.isEditMode) return;
            e.preventDefault();
            e.stopPropagation();
            window.parent.openImageModal(img);
        });
    });

    // ── Make placeholder divs (card image areas) clickable for image upload ──
    const cardImgAreas = doc.querySelectorAll('.placeholder-img, .card-img, .team-img, .card-img-top, [class*="placeholder"]');
    cardImgAreas.forEach(div => {
        if (div.tagName === 'IMG') return; // Already handled above
        
        div.setAttribute('data-ai-img', 'true');
        div.dataset.originalSrc = div.style.backgroundImage || '';
        div.dataset.isDiv = 'true';

        div.addEventListener('click', (e) => {
            if (!state.isEditMode) return;
            e.preventDefault();
            e.stopPropagation();
            // For div placeholders, we open the image modal
            // When confirmed, we'll set background-image instead of src
            window.parent.openImageModal(div);
        });
    });

    // ── Add Delete Buttons to Sections ──
    const sectionSelectors = 'section, .section, [class*="section"], .hero, .team-section, .programs-section, .contact-section, .about-section';
    const sections = doc.querySelectorAll(sectionSelectors);
    sections.forEach(section => {
        // Skip if already has delete button
        if (section.querySelector('.ai-delete-btn')) return;
        // Skip very small elements and the main body
        if (section === doc.body || section.offsetHeight < 50) return;

        const deleteBtn = doc.createElement('button');
        deleteBtn.className = 'ai-delete-btn';
        deleteBtn.innerHTML = '🗑';
        deleteBtn.title = 'حذف هذا القسم';
        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('هل أنت متأكد من حذف هذا القسم؟ لا يمكن التراجع.')) {
                section.dataset.originalSection = section.outerHTML;
                section.style.display = 'none';
                section.setAttribute('data-ai-deleted', 'true');
                recountChanges(doc);
                showToast('تم حذف القسم. انشر لحفظ التعديل.', 'info');
            }
        });
        section.appendChild(deleteBtn);
    });
}

function recountChanges(doc) {
    const edited = doc.querySelectorAll('.edited');
    const imgEdited = doc.querySelectorAll('[data-ai-img-changed]');
    const deletedSections = doc.querySelectorAll('[data-ai-deleted]');
    state.changes = edited.length + imgEdited.length + deletedSections.length;
    updateChangeUI();
}

function updateChangeUI() {
    const counter = document.getElementById('changeCounter');
    const btnSave = document.getElementById('btnSave');

    if (state.changes > 0) {
        counter.textContent = `${state.changes} تعديلات`;
        counter.style.display = 'inline-block';
        btnSave.disabled = false;
        btnSave.textContent = 'نشر التعديلات';
        btnSave.classList.add('has-changes');
    } else {
        counter.style.display = 'none';
        btnSave.disabled = true;
        btnSave.textContent = 'لا يوجد تغيير';
        btnSave.classList.remove('has-changes');
    }
}

// ═══════════════════════════════════════════
//  IMAGE MODAL
// ═══════════════════════════════════════════
window.openImageModal = function(imgEl) {
    state.pendingImageTarget = imgEl;
    const modal = document.getElementById('imageModal');
    // Show current image - support both img.src and div background-image
    const currentSrc = imgEl.tagName === 'IMG' ? imgEl.src : (imgEl.style.backgroundImage ? imgEl.style.backgroundImage.replace(/url\(['"]?|['"]?\)/g, '') : '');
    document.getElementById('modalPreview').src = currentSrc || '';
    modal.style.display = 'flex';
};

function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('modalPreview').src = e.target.result;
        state.pendingImageData = {
            dataUrl: e.target.result,
            file: file,
            name: file.name,
            type: file.type
        };
        document.getElementById('btnConfirmImage').disabled = false;
    };
    reader.readAsDataURL(file);
}

document.getElementById('imageInput').onchange = (e) => {
    if (e.target.files[0]) handleImageFile(e.target.files[0]);
};

document.getElementById('dropZone').onclick = () => document.getElementById('imageInput').click();

function confirmImageReplace() {
    const target = state.pendingImageTarget;
    
    if (target.tagName === 'IMG') {
        // Standard img element
        target.src = state.pendingImageData.dataUrl;
    } else {
        // Div placeholder - set background-image
        target.style.backgroundImage = `url(${state.pendingImageData.dataUrl})`;
        target.style.backgroundSize = 'cover';
        target.style.backgroundPosition = 'center';
    }
    
    target.setAttribute('data-ai-img-changed', 'true');
    target.dataset.newImageData = state.pendingImageData.dataUrl;
    target.dataset.newImageName = state.pendingImageData.name;
    
    const doc = document.getElementById('editorFrame').contentDocument;
    recountChanges(doc);
    closeImageModal();
}

function closeImageModal() {
    document.getElementById('imageModal').style.display = 'none';
    state.pendingImageTarget = null;
    state.pendingImageData = null;
    document.getElementById('btnConfirmImage').disabled = true;
}

// ═══════════════════════════════════════════
//  SAVE / PUBLISH
// ═══════════════════════════════════════════
async function saveChanges() {
    if (state.changes === 0 || !state.originalHTML) return;
    
    showLoading('جاري رفع التعديلات والصور...');
    try {
        const iframe = document.getElementById('editorFrame');
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        // 1. Handle Images
        const changedImages = doc.querySelectorAll('[data-ai-img-changed]');
        const imageMap = new Map();
        for (const img of changedImages) {
            const base64Data = img.dataset.newImageData.split(',')[1];
            const ext = img.dataset.newImageName.split('.').pop();
            const safeName = `img_${Date.now()}.${ext}`;
            const uploadPath = `assets/images/${safeName}`;
            
            console.log('[Admin] Uploading image:', uploadPath);
            await githubCreateOrUpdateFile(uploadPath, base64Data, `Admin Upload: ${uploadPath}`);
            
            const relPathPrefix = state.currentPage.includes('/') ? '../' : '';
            imageMap.set(img.dataset.originalSrc, `${relPathPrefix}assets/images/${safeName}`);
        }

        // 2. Handle HTML text edits
        let updatedHTML = state.originalHTML;
        const editedElements = doc.querySelectorAll('[data-ai-editable].edited');
        for (const el of editedElements) {
            const cleanOriginal = el.dataset.originalText;
            const cleanNew = cleanEditableHTML(el.innerHTML);
            if (cleanOriginal && updatedHTML.includes(cleanOriginal)) {
                updatedHTML = updatedHTML.replace(cleanOriginal, cleanNew);
            }
        }
        
        // 3. Handle image path replacements
        for (const [oldSrc, newPath] of imageMap) {
            updatedHTML = updatedHTML.replace(new RegExp(escapeRegExp(oldSrc), 'g'), newPath);
        }

        // 4. Handle deleted sections
        const deletedSections = doc.querySelectorAll('[data-ai-deleted]');
        for (const section of deletedSections) {
            const originalHTML = section.dataset.originalSection;
            if (originalHTML) {
                // Remove the section's original HTML from the page
                const cleanedOriginal = originalHTML
                    .replace(/<button class="ai-delete-btn"[^>]*>[^<]*<\/button>/g, '')
                    .replace(/\s*data-original-section="[^"]*"/g, '')
                    .replace(/\s*data-ai-deleted="true"/g, '')
                    .replace(/\s*style="display:\s*none;?"/g, '');
                if (updatedHTML.includes(cleanedOriginal)) {
                    updatedHTML = updatedHTML.replace(cleanedOriginal, '');
                }
            }
        }

        // 5. Publish to GitHub
        const apiPath = state.currentPage;
        console.log('[Admin] Publishing to GitHub: contents/' + apiPath, 'SHA:', state.currentPageSha);
        
        // Re-fetch SHA right before saving to avoid conflicts
        const freshSha = await getFreshSha(apiPath);
        
        const publishResult = await githubCreateOrUpdateFile(apiPath, encodeBase64(updatedHTML), `Admin Content Update: ${apiPath}`, freshSha);
        
        // Update SHA from GitHub response so subsequent publishes work
        if (publishResult && publishResult.content && publishResult.content.sha) {
            state.currentPageSha = publishResult.content.sha;
            console.log('[Admin] Updated SHA to:', state.currentPageSha);
        }
        
        hideLoading();
        showToast('تم النشر بنجاح! ✅', 'success');
        
        // Reset changes state
        state.changes = 0;
        state.originalHTML = updatedHTML;
        editedElements.forEach(el => {
            el.classList.remove('edited');
            el.dataset.originalText = el.innerHTML;
        });
        changedImages.forEach(img => {
            img.removeAttribute('data-ai-img-changed');
            img.dataset.originalSrc = img.getAttribute('src');
        });
        updateChangeUI();
        
    } catch (err) {
        hideLoading();
        console.error('[Admin] Publish error:', err);
        showToast('فشل النشر: ' + err.message, 'error');
    }
}

async function getFreshSha(path) {
    try {
        const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}?ref=${CONFIG.branch}`, {
            headers: { 'Authorization': `token ${state.token}` }
        });
        if (res.ok) {
            const data = await res.json();
            return data.sha;
        }
    } catch(e) {}
    return state.currentPageSha;
}

function cleanEditableHTML(html) {
    return html
        .replace(/\s*contenteditable="true"/g, '')
        .replace(/\s*data-ai-editable="true"/g, '')
        .replace(/\s*data-ai-img="true"/g, '')
        .replace(/\s*class="edited"/g, '')
        .replace(/\s*spellcheck="false"/g, '')
        .trim();
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeBase64(encoded) {
    const cleaned = encoded.replace(/\n/g, '');
    const bytes = atob(cleaned);
    const uint8Array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) { uint8Array[i] = bytes.charCodeAt(i); }
    return new TextDecoder('utf-8').decode(uint8Array);
}

function encodeBase64(str) {
    const uint8Array = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) { binary += String.fromCharCode(uint8Array[i]); }
    return btoa(binary);
}

async function githubCreateOrUpdateFile(path, base64Content, message, sha = null) {
    const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`;
    const body = { message, content: base64Content, branch: CONFIG.branch };
    if (sha) body.sha = sha;

    console.log('[Admin] GitHub API PUT:', url, 'SHA:', sha ? sha : '(new file)');
    
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `token ${state.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    if (!res.ok) {
        const errText = await res.text();
        console.error('[Admin] GitHub API Error:', res.status, errText);
        throw new Error(errText);
    }
    return await res.json();
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.className = `toast toast-${type} visible`;
    document.getElementById('toastMessage').textContent = message;
    toast.style.display = 'flex';
    setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.style.display = 'none', 300); }, 4000);
}

function showLoading(text) {
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('loadingText').textContent = text;
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

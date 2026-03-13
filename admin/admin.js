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
    document.getElementById('editorView').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPassword').value = '';
    document.getElementById('editorFrame').src = 'about:blank';
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
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
        
        iframe.onload = () => {
            setTimeout(() => {
                try {
                    injectAdminBehaviors(iframe);
                    applyModeState();
                } catch(e) {
                    console.warn('[Admin] Could not inject into iframe:', e.message);
                }
                hideLoading();
            }, 500);
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
            // In edit mode, block all navigation
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // In browse mode, intercept internal links to track page changes
        const href = link.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:')) {
            e.preventDefault();
            
            // Resolve the href relative to the current page
            let newPage = href;
            if (newPage.startsWith('./')) newPage = newPage.substring(2);
            if (newPage.startsWith('../')) {
                // Handle relative up paths
                const parts = state.currentPage.split('/');
                parts.pop();
                newPage = newPage.replace(/^\.\.\//, '');
                newPage = parts.length > 0 ? parts.join('/') + '/' + newPage : newPage;
            }
            newPage = newPage.replace(/^\/+/, '');
            
            console.log('[Admin] Navigating to:', newPage);
            loadPageInEditor(newPage);
        } else if (href && href.startsWith('#')) {
            // Allow anchor scrolling
        } else if (href && href.startsWith('http')) {
            // External links - do nothing
            e.preventDefault();
        }
    }, true);

    // Inject Styles for Edit Mode
    const style = doc.createElement('style');
    style.id = 'ai-admin-styles';
    style.textContent = `
        /* When Edit Mode is Active */
        body.ai-edit-mode [data-ai-editable]:hover {
            outline: 2px dashed rgba(0, 74, 173, 0.5) !important;
            outline-offset: 2px !important;
            cursor: text !important;
            border-radius: 2px;
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
        body.ai-edit-mode [data-ai-img] {
            position: relative !important;
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
    `;
    doc.head.appendChild(style);

    // Annotate Text Elements
    const textSelectors = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, span:not(.fas):not(.fab):not(.far), a, .btn, .btn-primary, .btn-secondary, td, th, label, figcaption';
    const textElements = doc.querySelectorAll(textSelectors);
    
    textElements.forEach(el => {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
        if (el.children.length > 3) return; // Skip containers with many children
        
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

        el.addEventListener('blur', () => {
            el.removeAttribute('contenteditable');
        });
    });

    // Annotate Images
    const images = doc.querySelectorAll('img');
    images.forEach(img => {
        if (img.naturalWidth > 0 && img.naturalWidth < 30) return;

        img.setAttribute('data-ai-img', 'true');
        img.dataset.originalSrc = img.getAttribute('src');

        img.addEventListener('click', (e) => {
            if (!state.isEditMode) return;
            e.preventDefault();
            e.stopPropagation();
            window.parent.openImageModal(img);
        });
    });
}

function recountChanges(doc) {
    const edited = doc.querySelectorAll('.edited');
    const imgEdited = doc.querySelectorAll('[data-ai-img-changed]');
    state.changes = edited.length + imgEdited.length;
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
    document.getElementById('modalPreview').src = imgEl.src;
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
    const img = state.pendingImageTarget;
    img.src = state.pendingImageData.dataUrl;
    img.setAttribute('data-ai-img-changed', 'true');
    img.dataset.newImageData = state.pendingImageData.dataUrl;
    img.dataset.newImageName = state.pendingImageData.name;
    
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

        // 2. Handle HTML
        let updatedHTML = state.originalHTML;
        const editedElements = doc.querySelectorAll('[data-ai-editable].edited');
        for (const el of editedElements) {
            const cleanOriginal = el.dataset.originalText;
            const cleanNew = cleanEditableHTML(el.innerHTML);
            if (cleanOriginal && updatedHTML.includes(cleanOriginal)) {
                updatedHTML = updatedHTML.replace(cleanOriginal, cleanNew);
            }
        }
        
        for (const [oldSrc, newPath] of imageMap) {
            updatedHTML = updatedHTML.replace(new RegExp(escapeRegExp(oldSrc), 'g'), newPath);
        }

        // 3. Publish to GitHub
        const apiPath = state.currentPage;
        console.log('[Admin] Publishing to GitHub: contents/' + apiPath, 'SHA:', state.currentPageSha);
        
        // Re-fetch SHA right before saving to avoid conflicts
        const freshSha = await getFreshSha(apiPath);
        
        await githubCreateOrUpdateFile(apiPath, encodeBase64(updatedHTML), `Admin Content Update: ${apiPath}`, freshSha);
        
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

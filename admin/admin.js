/* ============================================
   DAAM FOUNDATION — Content Editor (Admin CMS)
   No backend required. Uses GitHub API directly.
   ============================================ */

// ─── Configuration ───
const CONFIG = {
    owner: 'Elewa11',
    repo: 'daam-website',
    branch: 'main',
    // SHA-256 hash of the admin password: 'admin123'
    passwordHash: '90230ee1405515aa19246cbc88f1754a49ac5a3bb2968dfe00778ea452bdc229',
    _tk: null,
    pages: {
        ar: [
            { title: 'الصفحة الرئيسية', file: 'index.html', icon: '🏠' },
            { title: 'من نحن', file: 'about.html', icon: '🏛️' },
            { title: 'برامجنا', file: 'programs.html', icon: '⚙️' },
            { title: 'شارك معنا', file: 'participate.html', icon: '🤝' },
            { title: 'تواصل معنا', file: 'contact.html', icon: '✉️' },
        ],
        en: [
            { title: 'Home Page', file: 'en/index.html', icon: '🏠' },
            { title: 'About Us', file: 'en/about.html', icon: '🏛️' },
            { title: 'Our Programs', file: 'en/programs.html', icon: '⚙️' },
            { title: 'Participate', file: 'en/participate.html', icon: '🤝' },
            { title: 'Contact Us', file: 'en/contact.html', icon: '✉️' },
        ]
    }
};

// ─── State ───
let state = {
    token: null,
    currentPage: null,
    currentPageContent: null,
    currentPageSha: null,
    changes: 0,
    originalHTML: null,
    currentLang: 'ar',
    pendingImageData: null,
    pendingImageTarget: null,
};

// ═══════════════════════════════════════════
//  AUTHENTICATION
// ═══════════════════════════════════════════

async function hashPassword(password) {
    const encoded = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuffer))
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
}

async function handleLogin() {
    const passwordInput = document.getElementById('adminPassword');
    const password = passwordInput.value.trim();
    const errorEl = document.getElementById('loginError');
    const btnText = document.querySelector('.btn-text');
    const btnLoader = document.querySelector('.btn-loader');

    if (!password) {
        errorEl.textContent = 'يرجى إدخال كلمة المرور.';
        errorEl.style.display = 'block';
        return;
    }

    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-block';
    errorEl.style.display = 'none';

    // Check password
    const hash = await hashPassword(password);

    // Check config hash
    const storedHash = CONFIG.passwordHash;
    if (hash !== storedHash) {
        errorEl.textContent = 'كلمة المرور غير صحيحة. حاول مرة أخرى.';
        errorEl.style.display = 'block';
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        return;
    }

    // Use stored token
    const storedToken = localStorage.getItem('daam_admin_token');
    if (storedToken) {
        state.token = storedToken;
        const valid = await validateToken();
        if (valid) {
            showDashboard();
        } else {
            showToast('فشل الاتصال بـ GitHub. يرجى التحقق من مفتاح الوصول.', 'error');
            showSetupSection();
        }
    } else {
        showSetupSection();
    }

    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
}

function showSetupSection() {
    document.getElementById('setupSection').style.display = 'block';
}

async function saveSetup() {
    const tokenInput = document.getElementById('githubToken');
    const token = tokenInput.value.trim();

    if (!token) {
        showToast('يرجى إدخال رمز وصول صحيح.', 'error');
        return;
    }

    state.token = token;
    const valid = await validateToken();
    if (valid) {
        localStorage.setItem('daam_admin_token', token);
        showToast('تم حفظ الإعدادات بنجاح!', 'success');
        showDashboard();
    } else {
        showToast('الرمز غير صالح. تأكد من صلاحيات الوصول (repo).', 'error');
        state.token = null;
    }
}

async function validateToken() {
    try {
        const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}`, {
            headers: { 'Authorization': `token ${state.token}` }
        });
        return res.ok;
    } catch {
        return false;
    }
}

function handleLogout() {
    state.token = null;
    state.currentPage = null;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPassword').value = '';
}

// Add enter key support for login
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // Auto-login if session exists
    const storedToken = localStorage.getItem('daam_admin_token');
    if (storedToken) {
        state.token = storedToken;
        validateToken().then(valid => {
            if (valid) {
                // We still need to ask for password for security in this session
                // Or we can auto-login if you prefer. Reference does auto-login if token is valid.
                showDashboard();
            }
        });
    }
});

// ═══════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    renderPageGrid();
}

function filterPages(lang) {
    state.currentLang = lang;
    document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.page-tab[data-lang="${lang}"]`).classList.add('active');
    renderPageGrid();
}

function renderPageGrid() {
    const grid = document.getElementById('pageGrid');
    const pages = CONFIG.pages[state.currentLang];

    grid.innerHTML = pages.map((page, idx) => `
    <div class="page-card" onclick="openEditor('${page.file}')" style="animation-delay:${idx * 0.05}s">
      <div class="page-card-icon">${page.icon}</div>
      <div class="page-card-title">${page.title}</div>
      <div class="page-card-path">${page.file}</div>
      <div class="page-card-arrow">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════
//  PAGE EDITOR
// ═══════════════════════════════════════════

async function openEditor(filePath) {
    state.currentPage = filePath;
    state.changes = 0;

    document.getElementById('pageListView').style.display = 'none';
    document.getElementById('editorView').style.display = 'flex';
    document.getElementById('editorPageName').textContent = filePath;
    updateChangeUI();

    showLoading('جاري تحميل الصفحة...');

    try {
        // 1. Fetch raw HTML from GitHub API
        const res = await fetch(
            `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}?ref=${CONFIG.branch}`,
            { headers: { 'Authorization': `token ${state.token}` } }
        );

        if (!res.ok) throw new Error('فشل جلب الصفحة من GitHub');

        const data = await res.json();
        state.currentPageSha = data.sha;

        const content = decodeBase64(data.content);
        state.originalHTML = content;
        state.currentPageContent = content;

        // 2. Load the LIVE page URL in the iframe
        const iframe = document.getElementById('editorFrame');
        const origin = window.location.origin;
        const sitePath = window.location.pathname.replace(/\/admin\/.*$/, '/');
        const liveUrl = `${origin}${sitePath}${filePath}`;

        iframe.removeAttribute('sandbox');

        iframe.onload = () => {
            setTimeout(() => {
                injectEditingCapabilities(iframe);
                hideLoading();
            }, 800);
        };

        iframe.src = liveUrl;

    } catch (err) {
        hideLoading();
        showToast('فشل تحميل الصفحة: ' + err.message, 'error');
        closeEditor();
    }
}

function decodeBase64(encoded) {
    const cleaned = encoded.replace(/\n/g, '');
    const bytes = atob(cleaned);
    const uint8Array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        uint8Array[i] = bytes.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(uint8Array);
}

function encodeBase64(str) {
    const uint8Array = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
}

function closeEditor() {
    document.getElementById('editorView').style.display = 'none';
    document.getElementById('pageListView').style.display = 'block';
    state.currentPage = null;
    state.currentPageContent = null;
    state.currentPageSha = null;
    state.changes = 0;

    const iframe = document.getElementById('editorFrame');
    iframe.src = 'about:blank';
}

// ═══════════════════════════════════════════
//  INLINE EDITING
// ═══════════════════════════════════════════

function injectEditingCapabilities(iframe) {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return;

    const style = doc.createElement('style');
    style.textContent = `
    [data-ai-editable]:hover {
      outline: 2px dashed rgba(0, 74, 173, 0.4) !important;
      outline-offset: 4px !important;
      cursor: text !important;
    }
    [data-ai-editable]:focus {
      outline: 2px solid #004aad !important;
      outline-offset: 4px !important;
      background: rgba(0, 74, 173, 0.05) !important;
    }
    [data-ai-editable].edited {
      outline: 2px solid #28a745 !important;
      outline-offset: 4px !important;
    }
    [data-ai-img] {
      position: relative !important;
      cursor: pointer !important;
    }
    [data-ai-img]:hover {
      filter: brightness(0.85) !important;
    }
    .ai-img-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(30, 41, 59, 0.6);
      color: white;
      font-size: 14px;
      font-weight: 600;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
      border-radius: inherit;
      z-index: 100;
    }
    [data-ai-img]:hover .ai-img-overlay {
      opacity: 1;
    }
  `;
    doc.head.appendChild(style);

    const textElements = doc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, span, a, .btn, .btn-primary, .btn-secondary, .section-title h4');
    textElements.forEach(el => {
        // Skip icons and scripts
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.classList.contains('fas') || el.classList.contains('fab')) return;
        
        // Skip navigation and footer ONLY if they are basic menu items (to avoid breaking layout)
        // But the user wants "all sections", so let's allow it but be careful.
        
        el.setAttribute('data-ai-editable', 'true');
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('spellcheck', 'false');
        el.dataset.originalText = el.innerHTML;

        el.addEventListener('input', () => {
            if (el.innerHTML !== el.dataset.originalText) {
                el.classList.add('edited');
                recountChanges(doc);
            } else {
                el.classList.remove('edited');
                recountChanges(doc);
            }
        });
    });

    const images = doc.querySelectorAll('img');
    images.forEach(img => {
        // Skip tiny icons and hidden images
        if (img.naturalWidth > 0 && img.naturalWidth < 30) return;
        if (img.classList.contains('no-edit')) return;

        img.setAttribute('data-ai-img', 'true');
        img.dataset.originalSrc = img.getAttribute('src');

        const wrapper = img.parentElement;
        if (window.getComputedStyle(wrapper).position === 'static') {
            wrapper.style.position = 'relative';
        }

        const overlay = doc.createElement('div');
        overlay.className = 'ai-img-overlay';
        overlay.innerHTML = '📷 اضغط لاستبدال الصورة';
        wrapper.appendChild(overlay);

        img.addEventListener('click', (e) => {
            e.preventDefault();
            openImageModal(img);
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
    const btnUndo = document.getElementById('btnUndo');
    const btnSave = document.getElementById('btnSave');

    if (state.changes > 0) {
        counter.textContent = `${state.changes} تعديلات معلقة`;
        counter.style.display = 'inline-block';
        btnUndo.style.display = 'flex';
        btnSave.disabled = false;
    } else {
        counter.style.display = 'none';
        btnUndo.style.display = 'none';
        btnSave.disabled = true;
    }
}

// ═══════════════════════════════════════════
//  IMAGE HANDLING
// ═══════════════════════════════════════════

function openImageModal(imgEl) {
    state.pendingImageTarget = imgEl;
    const modal = document.getElementById('imageModal');
    document.getElementById('modalPreview').src = imgEl.src;
    modal.style.display = 'flex';
}

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
    
    recountChanges(img.ownerDocument);
    closeImageModal();
}

function closeImageModal() {
    document.getElementById('imageModal').style.display = 'none';
    state.pendingImageTarget = null;
    state.pendingImageData = null;
}

// ═══════════════════════════════════════════
//  SAVE / PUBLISH
// ═══════════════════════════════════════════

async function saveChanges() {
    showLoading('جاري رفع التعديلات والصور...');
    try {
        const iframe = document.getElementById('editorFrame');
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        // 1. Handle Images
        const changedImages = doc.querySelectorAll('[data-ai-img-changed]');
        const imageMap = new Map();
        for (const img of changedImages) {
            const base64Data = img.dataset.newImageData.split(',')[1];
            const name = `assets/images/uploaded_${Date.now()}_${img.dataset.newImageName}`;
            await githubCreateOrUpdateFile(name, base64Data, `Upload: ${name}`);
            imageMap.set(img.dataset.originalSrc, name);
        }

        // 2. Handle HTML
        let updatedHTML = state.originalHTML;
        const editedElements = doc.querySelectorAll('[data-ai-editable].edited');
        for (const el of editedElements) {
            updatedHTML = updatedHTML.replace(el.dataset.originalText, cleanEditableHTML(el.innerHTML));
        }
        
        for (const [oldSrc, newPath] of imageMap) {
            updatedHTML = updatedHTML.replace(new RegExp(escapeRegExp(oldSrc), 'g'), newPath);
        }

        await githubCreateOrUpdateFile(state.currentPage, encodeBase64(updatedHTML), `Admin Update: ${state.currentPage}`, state.currentPageSha);
        
        hideLoading();
        showToast('تم النشر بنجاح! سيتم تحديث الموقع خلال دقيقة.', 'success');
        setTimeout(() => location.reload(), 2000);
    } catch (err) {
        hideLoading();
        showToast('فشل النشر: ' + err.message, 'error');
    }
}

function cleanEditableHTML(html) {
    return html.replace(/contenteditable="true"/g, '').replace(/data-ai-editable="true"/g, '').replace(/class="edited"/g, '').trim();
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function githubCreateOrUpdateFile(path, base64Content, message, sha = null) {
    const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`;
    const body = { message, content: base64Content, branch: CONFIG.branch };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `token ${state.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
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

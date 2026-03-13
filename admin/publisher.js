/**
 * Daam Website Publisher logic
 * Handles cleaning the DOM and pushing to GitHub REST API
 */

async function publishChanges() {
    const urlParams = new URLSearchParams(window.location.search);
    const fileName = urlParams.get('page') || 'index.html';
    const frame = document.getElementById('editor-frame');
    const doc = frame.contentDocument || frame.contentWindow.document;

    const token = localStorage.getItem('gh_token');
    if (!token) {
        alert('يرجى العودة للرئيسية وإدخال GitHub Token أولاً لتتمكن من النشر.');
        return;
    }

    // 1. Prepare HTML content
    // We clone the document to clean it up before sending
    const clone = doc.documentElement.cloneNode(true);
    
    // Remove all contentEditable attributes and editor-specific styles
    clone.querySelectorAll('[contenteditable]').forEach(el => {
        el.removeAttribute('contenteditable');
        el.style.boxShadow = '';
        el.style.outline = '';
    });

    const fullHtml = '<!DOCTYPE html>\n' + clone.outerHTML;

    // 2. Info for GitHub API
    const owner = 'Elewa11';
    const repo = 'daam-website';
    const path = fileName; // Assuming main directory for now
    
    showMsg('<i class="fas fa-spinner fa-spin"></i> جاري الاتصال بـ GitHub...', '#1e293b');

    try {
        // Step A: Get current file SHA (required for update)
        const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const response = await fetch(getUrl, {
            headers: { 'Authorization': `token ${token}` }
        });
        
        if (!response.ok) throw new Error('فشل في جلب بيانات الملف من GitHub');
        
        const fileData = await response.json();
        const sha = fileData.sha;

        // Step B: Update file
        const updateUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const body = {
            message: `Admin Update: Edited ${fileName} via Visual Editor`,
            content: b64EncodeUnicode(fullHtml),
            sha: sha
        };

        const putResponse = await fetch(updateUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (putResponse.ok) {
            showMsg('✅ تم بنجاح! التحديثات منشورة الآن على الموقع.', '#059669');
        } else {
            const err = await putResponse.json();
            throw new Error(err.message || 'فشل في عملية النشر');
        }

    } catch (error) {
        console.error(error);
        showMsg(`❌ خطأ: ${error.message}`, '#dc2626');
    }
}

// Helper to handle UTF-8 base64 encoding correctly in browser
function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function(match, p1) {
            return String.fromCharCode('0x' + p1);
        }));
}

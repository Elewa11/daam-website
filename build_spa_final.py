import os
import re
import base64
import mimetypes
import json

# Configuration
ROOT_DIR = '.'
OUTPUT_FILE = 'daam_one_file_all_pages.html'
# Files to process and their "virtual" paths (keys)
PAGE_FILES = [
    'index.html',
    'about.html',
    'programs.html',
    'participate.html',
    'contact.html',
    'en/index.html',
    'en/about.html',
    'en/programs.html',
    'en/participate.html',
    'en/contact.html'
]
IGNORE_DIRS = {'.git', '.gemini', 'daam-one-page', 'daam_offline_site', '__pycache__'}

def file_to_base64(path):
    if not os.path.exists(path):
        return ""
    mime_type, _ = mimetypes.guess_type(path)
    if not mime_type: mime_type = 'application/octet-stream'
    try:
        with open(path, 'rb') as f:
            encoded = base64.b64encode(f.read()).decode('utf-8')
        return f"data:{mime_type};base64,{encoded}"
    except Exception as e:
        print(f"Error encode {path}: {e}")
        return ""

def embed_assets(content, base_path):
    """Embeds images and re-writes links to be SPA-compatible."""
    
    # 1. Embed Images (src="...")
    def repl_img(m):
        src = m.group(1)
        if src.startswith('http') or src.startswith('data:') or src.startswith('#'): return m.group(0)
        full_path = os.path.normpath(os.path.join(base_path, src))
        b64 = file_to_base64(full_path)
        if b64: return m.group(0).replace(src, b64)
        return m.group(0)
    
    content = re.sub(r'<img\s+[^>]*src=["\']([^"\']+)["\']', repl_img, content)

    # 2. Embed CSS Styles (url(...)) - mostly for inline styles
    def repl_css_url(m):
        url = m.group(1)
        if url.startswith('http') or url.startswith('data:') or url.startswith('#'): return m.group(0)
        full_path = os.path.normpath(os.path.join(base_path, url))
        b64 = file_to_base64(full_path)
        if b64: return f'url("{b64}")'
        return m.group(0)
        
    content = re.sub(r'url\s*\([\'"]?([^\'"\)]+)[\'"]?\)', repl_css_url, content)

    # 3. Rewrite Links (href="...")
    # converting href="about.html" -> href="#" onclick="navigate('about.html')" logic
    # But actually, we will use a global event listener, so we just need to normalize paths.
    # If we are in 'en/index.html' and link is 'about.html', it refers to 'en/about.html'
    # We need to resolve this to the canonical keys in PAGE_FILES.
    
    def repl_link(m):
        href = m.group(1)
        if href.startswith('http') or href.startswith('#') or href.startswith('mailto:') or href.startswith('tel:'):
            return m.group(0)
        
        # Resolving relative path
        if base_path == '.':
            resolved = href
        else:
            # e.g. base_path='en', href='about.html' -> en/about.html
            # e.g. base_path='en', href='../index.html' -> index.html
            resolved = os.path.normpath(os.path.join(base_path, href)).replace('\\', '/')
            
        return m.group(0).replace(href, resolved) # We standardise to forward slashes for keys

    content = re.sub(r'<a\s+[^>]*href=["\']([^"\']+)["\']', repl_link, content)
    
    return content

def get_body_content(html):
    """Extracts content between <body> tags."""
    m = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1)
    return ""

def process_css(base_dir):
    """Reads style.css, embeds assets, returns css string."""
    # Assuming primary usage of assets/css/style.css
    css_path = os.path.join(base_dir, 'assets', 'css', 'style.css')
    if not os.path.exists(css_path): return "/* CSS Not Found */"
    
    with open(css_path, 'r', encoding='utf-8') as f:
        css = f.read()
    
    css_dir = os.path.dirname(css_path)
    
    def repl_url(m):
        url = m.group(1)
        if url.startswith('http') or url.startswith('data:'): return m.group(0)
        full = os.path.normpath(os.path.join(css_dir, url))
        b64 = file_to_base64(full)
        if b64: return f'url("{b64}")'
        return m.group(0)

    css = re.sub(r'url\s*\([\'"]?([^\'"\)]+)[\'"]?\)', repl_url, css)
    return css

def process_js(base_dir):
    """Reads main.js."""
    js_path = os.path.join(base_dir, 'assets', 'js', 'main.js')
    if not os.path.exists(js_path): return "// JS Not Found"
    with open(js_path, 'r', encoding='utf-8') as f:
        return f.read()

ROUTER_SCRIPT = """
<script>
    // SPA Router Logic
    document.addEventListener('DOMContentLoaded', () => {
        
        function showPage(pageId) {
            // Hide all pages
            document.querySelectorAll('.spa-page').forEach(el => {
                el.style.display = 'none';
            });
            
            // Show target
            const target = document.getElementById('page-' + pageId);
            if (target) {
                target.style.display = 'block';
                window.scrollTo(0, 0);
            } else {
                console.error('Page not found:', pageId);
                // Fallback to index
                if(pageId !== 'index.html') showPage('index.html');
            }
        }

        // Intercept Clicks
        document.body.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link) {
                const href = link.getAttribute('href');
                // Check if it's an internal navigation link
                if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:')) {
                    e.preventDefault();
                    // Normalize path separators if needed (though we did in python)
                    showPage(href); 
                }
            }
        });

        // Initialize: Show index.html by default
        showPage('index.html');
        
        // Handle Mobile Menu (Re-initialize logic for the specific active page?)
        // Since all HTML is present, querySelector might pick the first hidden one.
        // We might need to scope listeners, but simple toggle usually works globally 
        // if classes are unique or we listen on document.body
    });
</script>
"""

def main():
    print("Building Ultimate Single-File SPA...")
    
    # 1. Start with Head Skeleton (from index.html)
    with open('index.html', 'r', encoding='utf-8') as f:
        master_html = f.read()
        
    head_match = re.search(r'<head>(.*?)</head>', master_html, re.DOTALL | re.IGNORECASE)
    head_content = head_match.group(1) if head_match else ""
    
    # Remove existing CSS links/JS scripts to replace with embedded
    head_content = re.sub(r'<link[^>]+rel=["\']stylesheet["\'][^>]*>', '', head_content)
    head_content = re.sub(r'<script[^>]*src=[^>]*>.*?</script>', '', head_content)
    
    # 2. Build Pages Accumulator
    pages_html = ""
    
    for page_path in PAGE_FILES:
        if not os.path.exists(page_path):
            print(f"Skipping {page_path} (not found)")
            continue
            
        print(f"Processing Body: {page_path}")
        with open(page_path, 'r', encoding='utf-8') as f:
            raw_html = f.read()
            
        body = get_body_content(raw_html)
        if not body:
            print(f"Warning: No body in {page_path}")
            continue
            
        # Determine base path for relative asset resolution
        base_dir = os.path.dirname(page_path)
        if base_dir == '': base_dir = '.'
        
        # Embed assets within this body
        body = embed_assets(body, base_dir)
        
        # Wrap in SPA Container
        # ID needs to match the href exactly (e.g., 'en/about.html')
        # We replace / with something safe? No, let's keep it simple string matching
        # But ID can't contain slash safely in CSS selectors sometimes? 
        # Actually typical custom IDs are fine, but let's prefix
        safe_id = 'page-' + page_path.replace('\\', '/')
        
        style = 'display:none;' # Default hidden
        if page_path == 'index.html': style = 'display:block;' # Show home initially? handled by JS
        
        pages_html += f'\n<!-- PAGE: {page_path} -->\n<div id="{safe_id}" class="spa-page" style="{style}">\n{body}\n</div>\n'

    # 3. Process Global Assets
    print("Processing Global Styles & Scripts...")
    css_content = process_css('.')
    js_content = process_js('.')
    
    # 4. Assemble Final HTML
    final_output = f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Da'am Foundation - Single File</title>
    {head_content}
    <style>
        /* Global Embedded CSS */
        {css_content}
        
        /* SPA Specific Adjustments */
        .spa-page {{ display: none; }}
    </style>
</head>
<body>

{pages_html}

<script>
    /* Global Embedded JS */
    {js_content}
</script>

{ROUTER_SCRIPT}

</body>
</html>"""

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(final_output)
        
    print(f"Done! {OUTPUT_FILE} created ({os.path.getsize(OUTPUT_FILE)//1024} KB).")

if __name__ == "__main__":
    main()

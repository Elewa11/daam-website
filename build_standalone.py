import os
import re
import base64
import mimetypes

# Configuration
SOURCE_FILE = 'index.html'
OUTPUT_FILE = 'daam_standalone.html'
ASSETS_DIR = 'assets'

def file_to_base64(path):
    """Reads a file and converts it to a base64 data URI."""
    if not os.path.exists(path):
        print(f"Warning: File not found: {path}")
        return ""
    
    mime_type, _ = mimetypes.guess_type(path)
    if not mime_type:
        mime_type = 'application/octet-stream'
        
    with open(path, 'rb') as f:
        encoded_data = base64.b64encode(f.read()).decode('utf-8')
        
    return f"data:{mime_type};base64,{encoded_data}"

def embed_images(html_content, base_dir):
    """Embeds <img src="..."> images as base64."""
    def replace_img(match):
        img_tag = match.group(0)
        src = match.group(1)
        
        # Skip external links or already embedded data
        if src.startswith('http') or src.startswith('data:'):
            return img_tag
            
        full_path = os.path.join(base_dir, src)
        data_uri = file_to_base64(full_path)
        
        if data_uri:
            return img_tag.replace(src, data_uri)
        return img_tag

    # Regex for standard src attributes
    pattern = r'<img\s+[^>]*src=["\']([^"\']+)["\']'
    return re.sub(pattern, replace_img, html_content)

def embed_css(html_content, base_dir):
    """Inlines external CSS and embeds images referenced inside CSS."""
    
    def repl_css_url(match, css_dir):
        """Replaces url(...) inside CSS."""
        url = match.group(1)
        if url.startswith('http') or url.startswith('data:'):
            return match.group(0)
            
        # CSS paths are relative to the CSS file, so we need to adjust
        # But here we assume simple relative paths for now or handle standard ../ logic
        # If the CSS is "assets/css/style.css" and it calls "../images/bg.jpg"
        # The full path is assets/css/../images/bg.jpg -> assets/images/bg.jpg
        full_path = os.path.normpath(os.path.join(css_dir, url))
        
        data_uri = file_to_base64(full_path)
        if data_uri:
            return f'url("{data_uri}")'
        return match.group(0)

    def replace_link(match):
        href = match.group(1)
        if href.startswith('http') or href.startswith('data:'):
            return match.group(0)
            
        full_path = os.path.join(base_dir, href)
        if not os.path.exists(full_path):
            return match.group(0)
            
        with open(full_path, 'r', encoding='utf-8') as f:
            css_content = f.read()
            
        # Process URLs inside this CSS
        css_dir = os.path.dirname(full_path)
        css_content = re.sub(r'url\s*\([\'"]?([^\'"\)]+)[\'"]?\)', 
                           lambda m: repl_css_url(m, css_dir), 
                           css_content)
            
        return f'<style>\n{css_content}\n</style>'

    # Replace <link rel="stylesheet">
    pattern = r'<link\s+[^>]*rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\'][^>]*>'
    return re.sub(pattern, replace_link, html_content)

def embed_js(html_content, base_dir):
    """Inlines external JS files."""
    def replace_script(match):
        src = match.group(1)
        if src.startswith('http') or src.startswith('data:'):
            return match.group(0)
            
        full_path = os.path.join(base_dir, src)
        if not os.path.exists(full_path):
            return match.group(0)
            
        with open(full_path, 'r', encoding='utf-8') as f:
            js_content = f.read()
            
        return f'<script>\n{js_content}\n</script>'

    pattern = r'<script\s+[^>]*src=["\']([^"\']+)["\'][^>]*>\s*</script>'
    return re.sub(pattern, replace_script, html_content)

def main():
    print(f"Building standalone file from {SOURCE_FILE}...")
    
    with open(SOURCE_FILE, 'r', encoding='utf-8') as f:
        html = f.read()
        
    base_dir = os.path.dirname(os.path.abspath(SOURCE_FILE))
    
    # 1. Embed CSS (and assets within CSS)
    print("Embedding CSS...")
    html = embed_css(html, base_dir)
    
    # 2. Embed Images in HTML
    print("Embedding HTML Images...")
    html = embed_images(html, base_dir)
    
    # 3. Embed JS
    print("Embedding JS...")
    html = embed_js(html, base_dir)
    
    # Write output
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(html)
        
    print(f"Success! {OUTPUT_FILE} created ({os.path.getsize(OUTPUT_FILE) // 1024} KB).")

if __name__ == "__main__":
    main()

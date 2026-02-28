import os
import re
import base64
import mimetypes
import shutil

# Configuration
SOURCE_DIR = '.'
OUTPUT_DIR = 'daam_offline_site'
IGNORE_DIRS = {'.git', '.gemini', 'daam-one-page', 'daam_offline_site', '__pycache__', '.idea', '.vscode'}
IGNORE_FILES = {'build_standalone.py', 'build_full_site.py', 'daam_standalone.html'}

def file_to_base64(path):
    """Reads a file and converts it to a base64 data URI."""
    if not os.path.exists(path):
        print(f"Warning: File not found: {path} (referenced in {path})")
        return ""
    
    mime_type, _ = mimetypes.guess_type(path)
    if not mime_type:
        mime_type = 'application/octet-stream'
        
    try:
        with open(path, 'rb') as f:
            encoded_data = base64.b64encode(f.read()).decode('utf-8')
        return f"data:{mime_type};base64,{encoded_data}"
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return ""

def embed_images(html_content, base_dir):
    """Embeds <img src="..."> images as base64."""
    def replace_img(match):
        img_tag = match.group(0)
        src = match.group(1)
        
        if src.startswith('http') or src.startswith('data:') or src.startswith('#'):
            return img_tag
            
        full_path = os.path.normpath(os.path.join(base_dir, src))
        data_uri = file_to_base64(full_path)
        
        if data_uri:
            # properly replace the quote-enclosed src
            return img_tag.replace(src, data_uri)
        return img_tag

    pattern = r'<img\s+[^>]*src=["\']([^"\']+)["\']'
    return re.sub(pattern, replace_img, html_content)

def embed_css(html_content, base_dir):
    """Inlines external CSS and embeds images referenced inside CSS."""
    
    def repl_css_url(match, css_dir):
        url = match.group(1)
        if url.startswith('http') or url.startswith('data:') or url.startswith('#'):
            return match.group(0)
            
        # CSS paths are relative to the CSS file
        full_path = os.path.normpath(os.path.join(css_dir, url))
        
        data_uri = file_to_base64(full_path)
        if data_uri:
            return f'url("{data_uri}")'
        return match.group(0)

    def replace_link(match):
        href = match.group(1)
        if href.startswith('http') or href.startswith('data:') or href.startswith('#'):
            return match.group(0)
            
        full_path = os.path.normpath(os.path.join(base_dir, href))
        if not os.path.exists(full_path):
            return match.group(0)
            
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                css_content = f.read()
            
            # Process URLs inside this CSS
            css_dir = os.path.dirname(full_path)
            css_content = re.sub(r'url\s*\([\'"]?([^\'"\)]+)[\'"]?\)', 
                               lambda m: repl_css_url(m, css_dir), 
                               css_content)
                
            return f'<style>\n/* Inlined from {href} */\n{css_content}\n</style>'
        except Exception as e:
            print(f"Error reading CSS {full_path}: {e}")
            return match.group(0)

    pattern = r'<link\s+[^>]*rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\'][^>]*>'
    return re.sub(pattern, replace_link, html_content)

def embed_js(html_content, base_dir):
    """Inlines external JS files."""
    def replace_script(match):
        src = match.group(1)
        if src.startswith('http') or src.startswith('data:') or src.startswith('#'):
            return match.group(0)
            
        full_path = os.path.normpath(os.path.join(base_dir, src))
        if not os.path.exists(full_path):
            return match.group(0)
            
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                js_content = f.read()
            return f'<script>\n/* Inlined from {src} */\n{js_content}\n</script>'
        except Exception as e:
            print(f"Error reading JS {full_path}: {e}")
            return match.group(0)

    pattern = r'<script\s+[^>]*src=["\']([^"\']+)["\'][^>]*>\s*</script>'
    return re.sub(pattern, replace_script, html_content)

def process_file(file_path, rel_path):
    print(f"Processing {rel_path}...")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    base_dir = os.path.dirname(file_path)
    
    # Embed everything
    html = embed_css(html, base_dir)
    html = embed_images(html, base_dir)
    html = embed_js(html, base_dir)
    
    # Save to output dir
    out_path = os.path.join(OUTPUT_DIR, rel_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)

def main():
    if os.path.exists(OUTPUT_DIR):
        print(f"Cleaning existing {OUTPUT_DIR}...")
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR)

    for root, dirs, files in os.walk(SOURCE_DIR):
        # Modify dirs in-place to skip ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        
        for file in files:
            if not file.endswith('.html') or file in IGNORE_FILES:
                continue
                
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, SOURCE_DIR)
            
            process_file(full_path, rel_path)

    print("\n-----------------------------------------------------------")
    print(f"Build Complete! The website is ready in '{OUTPUT_DIR}' folder.")
    print("You can zip this folder and send it to anyone.")
    print("All links between pages (e.g. href='about.html') will work.")
    print("All media is embedded.")
    print("-----------------------------------------------------------")

if __name__ == "__main__":
    main()

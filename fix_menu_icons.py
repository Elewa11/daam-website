import os
import re

SVG_ICON = """            <div class="mobile-toggle" style="color:#fff;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            </div>"""

# Regex pattern to match the div and its content (ignoring whitespace and attributes)
# Matches <div class="mobile-toggle" ...>...</div>
PATTERN = r'<div\s+class=["\']mobile-toggle["\'][^>]*>\s*<i\s+class=["\']fas\s+fa-bars["\']>\s*</i>\s*</div>'

FILES = [
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

def main():
    for file_path in FILES:
        if not os.path.exists(file_path):
            print(f"Skipping {file_path}")
            continue
            
        print(f"Processing {file_path}...")
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content, count = re.subn(PATTERN, SVG_ICON, content, flags=re.IGNORECASE | re.DOTALL)
        
        if count > 0:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"  Fixed {count} occurrence(s).")
        else:
            print("  Target not found.")

if __name__ == "__main__":
    main()

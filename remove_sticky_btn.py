import os
import re

# Regex to match the Sticky Button block
# Matches: <!-- Sticky... --> then <a ... class="sticky-volunteer-btn ..."> ... </a>
PATTERN = r'<!-- Sticky Volunteer Button \(Mobile\) -->\s*<a\s+[^>]*class=["\'][^"\']*sticky-volunteer-btn[^"\']*["\'][^>]*>.*?</a>'

FILES = [
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

def main():
    print("Removing Sticky Volunteer Button from all files...")
    for file_path in FILES:
        if not os.path.exists(file_path):
            continue
            
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content, count = re.subn(PATTERN, '', content, flags=re.DOTALL | re.IGNORECASE)
        
        if count > 0:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"  Removed from {file_path}")
        else:
            print(f"  Not found in {file_path}")

if __name__ == "__main__":
    main()

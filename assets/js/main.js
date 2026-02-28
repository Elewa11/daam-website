document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle (Event Delegation for SPA support)
    document.body.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.mobile-toggle');

        if (toggleBtn) {
            e.preventDefault(); // Prevent default behavior
            console.log('Mobile toggle clicked');

            // Find the parent navbar container
            const navbar = toggleBtn.closest('.navbar');
            if (navbar) {
                const navLinks = navbar.querySelector('.nav-links');
                if (navLinks) {
                    navLinks.classList.toggle('active');
                    document.body.classList.toggle('menu-open');
                    console.log('Menu toggled. Active class:', navLinks.classList.contains('active'));

                    // Optional: Close other open menus if any (for SPA)
                    document.querySelectorAll('.nav-links.active').forEach(menu => {
                        if (menu !== navLinks) menu.classList.remove('active');
                    });
                } else {
                    console.error('Nav links container not found');
                }
            } else {
                console.error('Navbar container not found');
            }
        }
    });

    // FAQ Accordion
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            // Close other items
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                }
            });
            // Toggle current item
            item.classList.toggle('active');
        });
    });
});

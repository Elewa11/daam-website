/* Da'am Foundation v2 — interactions */
(function () {
    'use strict';

    // Sticky header
    var header = document.querySelector('.site-header');
    function onScroll() {
        if (!header) return;
        header.classList.toggle('scrolled', window.scrollY > 40);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Mobile menu
    var toggle = document.querySelector('.nav-toggle');
    var menu = document.querySelector('.nav-menu');
    if (toggle && menu) {
        if (!menu.id) menu.id = 'primary-nav';
        toggle.setAttribute('aria-controls', menu.id);
        toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', function () {
            var open = menu.classList.toggle('open');
            toggle.classList.toggle('active');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        menu.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () {
                menu.classList.remove('open');
                toggle.classList.remove('active');
                toggle.setAttribute('aria-expanded', 'false');
            });
        });
    }

    // Reveal on scroll
    var reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
            });
        }, { threshold: 0.12 });
        reveals.forEach(function (r) { io.observe(r); });
    } else {
        reveals.forEach(function (r) { r.classList.add('in'); });
    }

    // Animated counters
    function animateCount(el) {
        var target = parseFloat(el.getAttribute('data-count'));
        var suffix = el.getAttribute('data-suffix') || '';
        var dur = 1600, start = null;
        function step(ts) {
            if (!start) start = ts;
            var p = Math.min((ts - start) / dur, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.floor(eased * target).toLocaleString('en-US') + suffix;
            if (p < 1) requestAnimationFrame(step);
            else el.textContent = target.toLocaleString('en-US') + suffix;
        }
        requestAnimationFrame(step);
    }
    var counters = document.querySelectorAll('[data-count]');
    if ('IntersectionObserver' in window) {
        var co = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) { animateCount(e.target); co.unobserve(e.target); }
            });
        }, { threshold: 0.5 });
        counters.forEach(function (c) { co.observe(c); });
    } else {
        counters.forEach(animateCount);
    }

    // FAQ accordion (keyboard accessible)
    document.querySelectorAll('.faq-q').forEach(function (q) {
        q.setAttribute('role', 'button');
        q.setAttribute('tabindex', '0');
        q.setAttribute('aria-expanded', 'false');
        function toggleFaq() {
            var open = q.parentElement.classList.toggle('open');
            q.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        q.addEventListener('click', toggleFaq);
        q.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFaq(); }
        });
    });

    // Accessible names for placeholder-only newsletter inputs
    document.querySelectorAll('.f-news input[type=email]').forEach(function (i) {
        if (!i.getAttribute('aria-label')) i.setAttribute('aria-label', i.getAttribute('placeholder') || 'البريد الإلكتروني');
    });

    // Footer year
    var yr = document.querySelector('[data-year]');
    if (yr) yr.textContent = new Date().getFullYear();
})();

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
        toggle.addEventListener('click', function () {
            menu.classList.toggle('open');
            toggle.classList.toggle('active');
        });
        menu.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () {
                menu.classList.remove('open');
                toggle.classList.remove('active');
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

    // FAQ accordion
    document.querySelectorAll('.faq-q').forEach(function (q) {
        q.addEventListener('click', function () {
            q.parentElement.classList.toggle('open');
        });
    });

    // Footer year
    var yr = document.querySelector('[data-year]');
    if (yr) yr.textContent = new Date().getFullYear();
})();

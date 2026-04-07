/**
 * Kai0-style coverflow: center large, sides small; left/right click to switch;
 * current video ends → auto-advance to next.
 */
(function () {
    var root = document.getElementById('kaiTaskReel');
    if (!root) return;

    var slides = Array.prototype.slice.call(root.querySelectorAll('.coverflow-slide'));
    var track = document.getElementById('coverflowTrack');
    var viewport = root.querySelector('.coverflow-viewport');
    var hitLeft = document.getElementById('coverflowHitLeft');
    var hitRight = document.getElementById('coverflowHitRight');

    if (!slides.length || !track) return;

    var n = slides.length;
    var active = 0;
    var prevActive = -1;

    function relPos(i) {
        return (i - active + n) % n;
    }

    function applyLayout() {
        var changed = active !== prevActive;
        prevActive = active;

        slides.forEach(function (slide, i) {
            var r = relPos(i);
            slide.classList.remove('pos-left', 'pos-center', 'pos-right');
            if (r === 0) slide.classList.add('pos-center');
            else if (r === 1) slide.classList.add('pos-right');
            else slide.classList.add('pos-left');
        });

        slides.forEach(function (slide, i) {
            var v = slide.querySelector('video');
            if (!v) return;
            if (relPos(i) === 0) {
                if (changed) v.currentTime = 0;
                var p = v.play();
                if (p && typeof p.catch === 'function') p.catch(function () {});
            } else {
                v.pause();
            }
        });
    }

    function go(delta) {
        active = (active + delta + n) % n;
        applyLayout();
    }

    if (hitLeft) hitLeft.addEventListener('click', function () { go(-1); });
    if (hitRight) hitRight.addEventListener('click', function () { go(1); });

    slides.forEach(function (slide, i) {
        var v = slide.querySelector('video');
        if (!v) return;
        v.addEventListener('ended', function () {
            if (active !== i) return;
            go(1);
        });
    });

    root.setAttribute('tabindex', '-1');
    root.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            go(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            go(1);
        }
    });

    var startX = 0;
    var dragging = false;
    var threshold = 56;

    function onDown(x) {
        dragging = true;
        startX = x;
    }
    function onUp(x) {
        if (!dragging) return;
        dragging = false;
        var dx = x - startX;
        if (dx > threshold) go(-1);
        else if (dx < -threshold) go(1);
    }

    track.addEventListener(
        'pointerdown',
        function (e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            track.setPointerCapture(e.pointerId);
            onDown(e.clientX);
        },
        { passive: true }
    );
    track.addEventListener(
        'pointerup',
        function (e) {
            onUp(e.clientX);
            try {
                track.releasePointerCapture(e.pointerId);
            } catch (err) {}
        },
        { passive: true }
    );
    track.addEventListener(
        'pointercancel',
        function () {
            dragging = false;
        },
        { passive: true }
    );

    if ('IntersectionObserver' in window && viewport) {
        var io = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (en) {
                    if (en.isIntersecting && en.intersectionRatio > 0.12) {
                        applyLayout();
                    } else {
                        slides.forEach(function (slide) {
                            var v = slide.querySelector('video');
                            if (v) v.pause();
                        });
                    }
                });
            },
            { threshold: [0, 0.12, 0.25] }
        );
        io.observe(viewport);
    }

    applyLayout();
})();

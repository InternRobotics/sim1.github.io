// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Theme toggle
const THEME_STORAGE_KEY = 'sim1-theme';
const themeToggleBtn = document.getElementById('themeToggleBtn');

function applyTheme(theme) {
    const isLight = theme === 'light';
    document.body.classList.toggle('theme-light', isLight);
    if (themeToggleBtn) {
        themeToggleBtn.setAttribute('aria-pressed', String(isLight));
        themeToggleBtn.querySelector('.theme-toggle-text').textContent = isLight ? 'Light' : 'Night';
        themeToggleBtn.setAttribute('aria-label', isLight ? 'Switch to night mode' : 'Switch to light mode');
    }
    window.dispatchEvent(new CustomEvent('sim1-themechange', { detail: { theme } }));
}

const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
applyTheme(savedTheme);

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const nextTheme = document.body.classList.contains('theme-light') ? 'dark' : 'light';
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
        updateNavbarBackground();
    });
}

// Back to top button
const backToTopBtn = document.getElementById('backToTopBtn');

function updateBackToTopVisibility() {
    if (!backToTopBtn) return;
    backToTopBtn.classList.toggle('is-visible', window.pageYOffset > 500);
}

if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// Scroll progress bar
const scrollProgress = document.querySelector('.scroll-progress');
window.addEventListener('scroll', () => {
    const windowHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrolled = (window.scrollY / windowHeight) * 100;
    scrollProgress.style.width = scrolled + '%';
    updateBackToTopVisibility();
});
updateBackToTopVisibility();

// Navbar background on scroll
const navbar = document.querySelector('.navbar');
function updateNavbarBackground() {
    if (!navbar) return;
    const styles = getComputedStyle(document.body);
    const bg = window.pageYOffset > 100
        ? styles.getPropertyValue('--navbar-bg-scrolled').trim()
        : styles.getPropertyValue('--navbar-bg').trim();
    navbar.style.backgroundColor = bg;
}

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    void currentScroll;
    updateNavbarBackground();
});
updateNavbarBackground();

// Newsletter form handling
const newsletterForm = document.querySelector('.newsletter-form');
if (newsletterForm) {
    newsletterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = newsletterForm.querySelector('.email-input').value;
        if (email) {
            // Show success message
            const btn = newsletterForm.querySelector('.submit-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Subscribed!';
            btn.style.background = 'var(--success)';
            
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
                newsletterForm.reset();
            }, 3000);
        }
    });
}

// Intersection Observer for fade-in animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all sections
document.querySelectorAll('.section').forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(20px)';
    section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(section);
});

// ── Adaptive video loading (viewport priority + super low → low → HQ) ──
// Mirror: videos/… → videos_super_low/… → videos_low/… (ffmpeg; missing tier falls back).
window.SIM1 = window.SIM1 || {};
SIM1.heroTryAutoplay = () => {};

(function initAdaptiveVideoLoading() {
    const adaptiveVideos = new Set();
    const adaptiveState = new WeakMap();
    const hqRingMeta = new WeakMap();
    const MAX_CONCURRENT_HQ = 2;
    const MAX_CONCURRENT_LOW = 2;
    let hqUpgradeCount = 0;
    let lowUpgradeCount = 0;

    /** Gate YouTube until every adaptive video with superUrl has tried super (canplay or error → fallback). */
    const youtubeSuperPending = new Set();
    const youtubeSuperReadyCallbacks = [];

    function markYoutubeSuperReady(v) {
        if (!youtubeSuperPending.has(v)) return;
        youtubeSuperPending.delete(v);
        if (youtubeSuperPending.size === 0) {
            youtubeSuperReadyCallbacks.splice(0).forEach((fn) => {
                try {
                    fn();
                } catch (e) {}
            });
        }
    }

    SIM1.onAllSuperLowReadyForYoutube = function (cb) {
        if (typeof cb !== 'function') return;
        if (youtubeSuperPending.size === 0) cb();
        else youtubeSuperReadyCallbacks.push(cb);
    };

    const IO_OPTS = { rootMargin: '75% 0px 75% 0px', threshold: [0, 0.05, 0.15, 0.35, 0.6, 1] };

    function toSuperLowUrl(hqUrl) {
        if (!hqUrl || !hqUrl.startsWith('videos/')) return null;
        return 'videos_super_low/' + hqUrl.slice('videos/'.length);
    }

    function toLowUrl(hqUrl) {
        if (!hqUrl || !hqUrl.startsWith('videos/')) return null;
        return 'videos_low/' + hqUrl.slice('videos/'.length);
    }

    function viewportCenterScore(el) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 && r.height < 2) return -1e9;
        const cy = (r.top + r.bottom) / 2;
        const mid = window.innerHeight * 0.5;
        return 1000 - Math.abs(cy - mid);
    }

    function bufferedFraction(v) {
        if (!v.duration || !Number.isFinite(v.duration) || v.duration <= 0) return 0;
        let end = 0;
        for (let i = 0; i < v.buffered.length; i++) {
            end = Math.max(end, v.buffered.end(i));
        }
        return Math.min(1, end / v.duration);
    }

    /** Off-DOM preload so current tier keeps playing until next tier is buffered. */
    function preloadVideoUrl(url, onReady, onError) {
        let settled = false;
        const p = document.createElement('video');
        p.muted = true;
        p.setAttribute('playsinline', '');
        p.preload = 'auto';
        p.style.cssText =
            'position:absolute;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;visibility:hidden';
        p.src = url;
        document.body.appendChild(p);
        p.load();
        const finishOk = () => {
            if (settled) return;
            settled = true;
            if (p.parentNode) p.parentNode.removeChild(p);
            onReady();
        };
        const finishErr = () => {
            if (settled) return;
            settled = true;
            if (p.parentNode) p.parentNode.removeChild(p);
            onError();
        };
        p.addEventListener('canplaythrough', finishOk, { once: true });
        p.addEventListener('error', finishErr, { once: true });
        p.addEventListener(
            'canplay',
            () => {
                if (p.readyState >= 3) finishOk();
            },
            { once: true }
        );
    }

    function freezeCurrentFrameAsPoster(v) {
        try {
            const w = v.videoWidth;
            const h = v.videoHeight;
            if (!w || !h) return;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(v, 0, 0);
            v.poster = canvas.toDataURL('image/jpeg', 0.82);
        } catch (e) {}
    }

    function clearTierPoster(v) {
        v.removeAttribute('poster');
    }

    /** After preload, swap main element src; poster hides decode gap. */
    function swapMainToUrl(v, st, url, nextPhase, savedTime, wasPlaying, onDone, onFail) {
        const vw = v.closest('.video-wrapper');
        if (vw) vw.classList.add('demo-poster-ready');
        freezeCurrentFrameAsPoster(v);
        v.src = url;
        v.load();
        let applied = false;
        const apply = () => {
            if (applied) return;
            applied = true;
            v.removeEventListener('canplaythrough', onCap);
            v.removeEventListener('canplay', onCp);
            v.removeEventListener('error', onErr);
            clearTierPoster(v);
            st.phase = nextPhase;
            if (v.duration && Number.isFinite(v.duration)) {
                v.currentTime = Math.min(Math.max(0, savedTime), Math.max(0, v.duration - 0.05));
            }
            if (wasPlaying) tryPlayAdaptive(v);
            if (onDone) onDone();
        };
        const onCap = () => apply();
        const onCp = () => {
            if (v.readyState >= 3) apply();
        };
        const onErr = () => {
            if (applied) return;
            applied = true;
            v.removeEventListener('canplaythrough', onCap);
            v.removeEventListener('canplay', onCp);
            v.removeEventListener('error', onErr);
            clearTierPoster(v);
            if (onFail) onFail();
        };
        v.addEventListener('canplaythrough', onCap, { once: true });
        v.addEventListener('canplay', onCp, { once: true });
        v.addEventListener('error', onErr, { once: true });
    }

    function attachHqRing(v) {
        if (hqRingMeta.has(v)) return;
        const host = v.closest('.solver-vid-wrap, .method-video-wrapper, .video-wrapper') || v.parentElement;
        if (!host) return;
        const wrap = document.createElement('div');
        wrap.className = 'video-hq-ring';
        wrap.setAttribute('aria-hidden', 'true');
        wrap.innerHTML =
            '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">' +
            '<circle class="video-hq-ring-track" cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>' +
            '<circle class="video-hq-ring-prog" cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.72)" stroke-width="2" ' +
            'stroke-linecap="round" transform="rotate(-90 12 12)"/>' +
            '</svg>';
        host.appendChild(wrap);
        const prog = wrap.querySelector('.video-hq-ring-prog');
        const R = 9;
        const circumference = 2 * Math.PI * R;
        prog.style.strokeDasharray = String(circumference);
        prog.style.strokeDashoffset = String(circumference);
        hqRingMeta.set(v, { wrap, prog, circumference });
    }

    function updateHqRingProgress(v) {
        const m = hqRingMeta.get(v);
        if (!m || !m.wrap.classList.contains('is-visible')) return;
        const dur = v.duration;
        let frac = 0;
        if (dur && Number.isFinite(dur) && dur > 0) {
            frac = bufferedFraction(v);
        }
        m.prog.style.strokeDashoffset = String(m.circumference * (1 - frac));
        m.wrap.classList.toggle('video-hq-ring--pulse', frac < 0.02 && !(dur && dur > 0));
    }

    function stopHqRingLoad(v, st) {
        if (!st) return;
        if (st._ringOnProg) {
            v.removeEventListener('progress', st._ringOnProg);
            st._ringOnProg = null;
        }
        if (st._ringOnCap) {
            v.removeEventListener('canplaythrough', st._ringOnCap);
            st._ringOnCap = null;
        }
        if (st._ringInterval) {
            clearInterval(st._ringInterval);
            st._ringInterval = null;
        }
        st.ringSession = (st.ringSession || 0) + 1;
        const m = hqRingMeta.get(v);
        if (m) {
            m.wrap.classList.remove('is-visible', 'video-hq-ring--pulse');
        }
    }

    /** Show ring + track buffer until canplaythrough or ~full buffer. */
    function startHqRingLoad(v, st) {
        stopHqRingLoad(v, st);
        attachHqRing(v);
        const m = hqRingMeta.get(v);
        if (!m) return;
        const sid = st.ringSession;
        m.wrap.classList.add('is-visible');
        updateHqRingProgress(v);

        const cleanup = () => {
            if (st.ringSession !== sid) return;
            if (st._ringOnProg) {
                v.removeEventListener('progress', st._ringOnProg);
                st._ringOnProg = null;
            }
            if (st._ringOnCap) {
                v.removeEventListener('canplaythrough', st._ringOnCap);
                st._ringOnCap = null;
            }
            if (st._ringInterval) {
                clearInterval(st._ringInterval);
                st._ringInterval = null;
            }
            m.wrap.classList.remove('is-visible', 'video-hq-ring--pulse');
        };

        const onProg = () => {
            if (st.ringSession !== sid) return;
            updateHqRingProgress(v);
            if (bufferedFraction(v) >= 0.992) cleanup();
        };

        const onCap = () => cleanup();

        st._ringOnProg = onProg;
        st._ringOnCap = onCap;
        v.addEventListener('progress', onProg);
        v.addEventListener('canplaythrough', onCap, { once: true });
        st._ringInterval = window.setInterval(() => {
            onProg();
        }, 280);
        window.setTimeout(() => {
            if (st.ringSession === sid) cleanup();
        }, 120000);
    }

    function tryPlayAdaptive(v) {
        if (v.id === 'demoVideo') {
            SIM1.heroTryAutoplay();
            return;
        }
        v.play().catch(() => {});
    }

    function loadHqFallback(v, st) {
        st.phase = 'loading-hq';
        preloadVideoUrl(
            st.hqUrl,
            () => {
                freezeCurrentFrameAsPoster(v);
                startHqRingLoad(v, st);
                v.src = st.hqUrl;
                v.load();
                let applied = false;
                const apply = () => {
                    if (applied) return;
                    applied = true;
                    stopHqRingLoad(v, st);
                    clearTierPoster(v);
                    st.phase = 'hq';
                    tryPlayAdaptive(v);
                };
                v.addEventListener('canplaythrough', apply, { once: true });
                v.addEventListener('canplay', () => {
                    if (v.readyState >= 3) apply();
                }, { once: true });
                v.addEventListener('error', () => {
                    st.phase = 'idle';
                    stopHqRingLoad(v, st);
                    clearTierPoster(v);
                }, { once: true });
            },
            () => {
                st.phase = 'idle';
                stopHqRingLoad(v, st);
            }
        );
    }

    function loadLowOrHqFromIdle(v, st) {
        if (st.lowUrl) {
            st.phase = 'loading-low';
            preloadVideoUrl(
                st.lowUrl,
                () => {
                    swapMainToUrl(
                        v,
                        st,
                        st.lowUrl,
                        'low',
                        0,
                        false,
                        () => scheduleHqUpgrades(),
                        () => loadHqFallback(v, st)
                    );
                },
                () => loadHqFallback(v, st)
            );
        } else {
            loadHqFallback(v, st);
        }
    }

    function beginSuperLoad(v, st) {
        if (st.phase !== 'idle' || !st.superUrl) return;
        st.phase = 'loading-super';
        const onSuperErr = () => {
            v.removeEventListener('error', onSuperErr);
            v.removeEventListener('canplay', onSuperOk);
            markYoutubeSuperReady(v);
            loadLowOrHqFromIdle(v, st);
        };
        const onSuperOk = () => {
            v.removeEventListener('error', onSuperErr);
            st.phase = 'super';
            markYoutubeSuperReady(v);
            tryPlayAdaptive(v);
            scheduleLowUpgrades();
            scheduleHqUpgrades();
        };
        v.addEventListener('error', onSuperErr);
        v.addEventListener('canplay', onSuperOk, { once: true });
        v.src = st.superUrl;
        v.load();
    }

    function ensureAdaptiveLoad(v, st) {
        if (!st.inView) return;
        if (st.upgrading || st.upgradingLow) return;
        if (st.phase === 'hq') {
            tryPlayAdaptive(v);
            return;
        }
        if (st.phase === 'low' && v.readyState >= 2 && !v.error) {
            tryPlayAdaptive(v);
            return;
        }
        if (st.phase === 'super' && v.readyState >= 2 && !v.error) {
            tryPlayAdaptive(v);
            return;
        }
        if (st.phase === 'loading-super' || st.phase === 'loading-low' || st.phase === 'loading-hq') return;

        if (st.phase === 'idle') {
            if (st.superUrl) {
                beginSuperLoad(v, st);
            } else {
                loadLowOrHqFromIdle(v, st);
            }
        }
    }

    function startLowUpgrade(v, st) {
        if (st.phase !== 'super' || st.upgradingLow || !st.lowUrl || !st.inView) return;
        st.upgradingLow = true;
        lowUpgradeCount++;
        const savedTime = v.currentTime;
        const wasPlaying = !v.paused;
        const handleLowTierFail = () => {
            st.upgradingLow = false;
            lowUpgradeCount--;
            if (st.hqUrl) {
                startHqUpgradeFromSuperAfterLowFail(v, st, savedTime, wasPlaying);
            }
            scheduleLowUpgrades();
        };
        preloadVideoUrl(
            st.lowUrl,
            () => {
                swapMainToUrl(
                    v,
                    st,
                    st.lowUrl,
                    'low',
                    savedTime,
                    wasPlaying,
                    () => {
                        st.upgradingLow = false;
                        lowUpgradeCount--;
                        scheduleHqUpgrades();
                        scheduleLowUpgrades();
                    },
                    handleLowTierFail
                );
            },
            handleLowTierFail
        );
    }

    /** Low tier preload failed while still on super — try HQ with same smooth swap. */
    function startHqUpgradeFromSuperAfterLowFail(v, st, savedTime, wasPlaying) {
        if (!st.hqUrl || st.upgrading) return;
        st.upgrading = true;
        hqUpgradeCount++;
        preloadVideoUrl(
            st.hqUrl,
            () => {
                freezeCurrentFrameAsPoster(v);
                startHqRingLoad(v, st);
                v.src = st.hqUrl;
                v.load();
                let applied = false;
                const apply = () => {
                    if (applied) return;
                    applied = true;
                    stopHqRingLoad(v, st);
                    clearTierPoster(v);
                    st.phase = 'hq';
                    st.upgrading = false;
                    hqUpgradeCount--;
                    if (v.duration && Number.isFinite(v.duration)) {
                        v.currentTime = Math.min(Math.max(0, savedTime), Math.max(0, v.duration - 0.05));
                    }
                    if (wasPlaying) tryPlayAdaptive(v);
                    scheduleHqUpgrades();
                };
                v.addEventListener('canplaythrough', apply, { once: true });
                v.addEventListener('canplay', () => {
                    if (v.readyState >= 3) apply();
                }, { once: true });
                v.addEventListener(
                    'error',
                    () => {
                        st.upgrading = false;
                        hqUpgradeCount--;
                        stopHqRingLoad(v, st);
                        clearTierPoster(v);
                        scheduleHqUpgrades();
                    },
                    { once: true }
                );
            },
            () => {
                st.upgrading = false;
                hqUpgradeCount--;
                scheduleHqUpgrades();
            }
        );
    }

    function scheduleLowUpgrades() {
        if (lowUpgradeCount >= MAX_CONCURRENT_LOW) return;
        const candidates = [];
        for (const v of adaptiveVideos) {
            const st = adaptiveState.get(v);
            if (!st || st.phase !== 'super' || st.upgradingLow || !st.inView || !st.lowUrl) continue;
            candidates.push({ v, st, score: viewportCenterScore(v) });
        }
        candidates.sort((a, b) => b.score - a.score);
        for (const { v, st } of candidates) {
            if (lowUpgradeCount >= MAX_CONCURRENT_LOW) break;
            if (st.phase !== 'super' || st.upgradingLow) continue;
            startLowUpgrade(v, st);
        }
    }

    function startHqUpgrade(v, st) {
        const fromLow = st.phase === 'low' && st.lowUrl;
        const fromSuperNoLow = st.phase === 'super' && !st.lowUrl && st.hqUrl;
        if ((!fromLow && !fromSuperNoLow) || st.upgrading) return;
        st.upgrading = true;
        hqUpgradeCount++;
        const savedTime = v.currentTime;
        const wasPlaying = !v.paused;
        const onFail = () => {
            st.upgrading = false;
            hqUpgradeCount--;
            stopHqRingLoad(v, st);
            scheduleHqUpgrades();
        };
        preloadVideoUrl(
            st.hqUrl,
            () => {
                freezeCurrentFrameAsPoster(v);
                startHqRingLoad(v, st);
                v.src = st.hqUrl;
                v.load();
                let applied = false;
                const apply = () => {
                    if (applied) return;
                    applied = true;
                    stopHqRingLoad(v, st);
                    clearTierPoster(v);
                    st.phase = 'hq';
                    st.upgrading = false;
                    hqUpgradeCount--;
                    if (v.duration && Number.isFinite(v.duration)) {
                        v.currentTime = Math.min(Math.max(0, savedTime), Math.max(0, v.duration - 0.05));
                    }
                    if (wasPlaying) tryPlayAdaptive(v);
                    scheduleHqUpgrades();
                };
                v.addEventListener('canplaythrough', apply, { once: true });
                v.addEventListener('canplay', () => {
                    if (v.readyState >= 3) apply();
                }, { once: true });
                v.addEventListener('error', onFail, { once: true });
            },
            onFail
        );
    }

    function scheduleHqUpgrades() {
        if (hqUpgradeCount >= MAX_CONCURRENT_HQ) return;
        const candidates = [];
        for (const v of adaptiveVideos) {
            const st = adaptiveState.get(v);
            if (!st || st.upgrading || !st.inView || !st.hqUrl) continue;
            if (st.phase === 'low' && st.lowUrl) {
                candidates.push({ v, st, score: viewportCenterScore(v) });
            } else if (st.phase === 'super' && !st.lowUrl) {
                candidates.push({ v, st, score: viewportCenterScore(v) });
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        for (const { v, st } of candidates) {
            if (hqUpgradeCount >= MAX_CONCURRENT_HQ) break;
            if (st.upgrading) continue;
            if (!(st.phase === 'low' || (st.phase === 'super' && !st.lowUrl))) continue;
            startHqUpgrade(v, st);
        }
    }

    const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const v = entry.target;
            const st = adaptiveState.get(v);
            if (!st) continue;
            st.inView = entry.isIntersecting;
            st.intersectionRatio = entry.intersectionRatio;
            if (entry.isIntersecting) {
                ensureAdaptiveLoad(v, st);
                scheduleLowUpgrades();
                scheduleHqUpgrades();
            } else {
                v.pause();
            }
        }
    }, IO_OPTS);

    function registerAdaptiveVideo(el) {
        if (!el || el.tagName !== 'VIDEO' || adaptiveState.has(el)) return;
        let hq =
            el.dataset.adaptiveHq ||
            el.getAttribute('data-adaptive-hq') ||
            (el.querySelector('source') && el.querySelector('source').getAttribute('src'));
        if (!hq) return;
        el.innerHTML = '';
        el.dataset.adaptiveHq = hq;
        el.preload = 'none';
        el.autoplay = false;
        const st = {
            hqUrl: hq,
            lowUrl: toLowUrl(hq),
            superUrl: toSuperLowUrl(hq),
            phase: 'idle',
            upgrading: false,
            upgradingLow: false,
            inView: false,
            intersectionRatio: 0,
            ringSession: 0,
            _ringInterval: null
        };
        adaptiveState.set(el, st);
        adaptiveVideos.add(el);
        if (st.superUrl) {
            youtubeSuperPending.add(el);
            const ric =
                window.requestIdleCallback ||
                function (cb) {
                    return window.setTimeout(() => cb({ didTimeout: false }), 1);
                };
            ric(
                () => {
                    const s2 = adaptiveState.get(el);
                    if (s2 && s2.phase === 'idle') beginSuperLoad(el, s2);
                },
                { timeout: 4000 }
            );
        }
        io.observe(el);
    }

    document.querySelectorAll('video.video-adaptive').forEach(registerAdaptiveVideo);
    SIM1.registerAdaptiveVideo = registerAdaptiveVideo;
})();

// ── Hero Video Player ──
const demoVideo = document.getElementById('demoVideo');
const demoWrapper = document.querySelector('.video-wrapper');

if (demoVideo && demoWrapper) {
    function formatTime(s) {
        if (isNaN(s)) return '0:00';
        return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    }

    // First frame as poster (JPEG data URL), then play only when poster is ready AND canplay
    let heroPosterReady = false;
    let heroCanPlay = false;
    function tryHeroAutoplay() {
        if (!heroPosterReady || !heroCanPlay) return;
        demoVideo.play().catch(() => {});
    }

    function captureHeroPoster() {
        if (heroPosterReady) return true;
        try {
            const w = demoVideo.videoWidth;
            const h = demoVideo.videoHeight;
            if (!w || !h) return false;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(demoVideo, 0, 0);
            demoVideo.poster = canvas.toDataURL('image/jpeg', 0.82);
            heroPosterReady = true;
            demoWrapper.classList.add('demo-poster-ready');
            tryHeroAutoplay();
            return true;
        } catch (e) {
            heroPosterReady = true;
            demoWrapper.classList.add('demo-poster-ready');
            tryHeroAutoplay();
            return true;
        }
    }

    demoVideo.addEventListener('loadeddata', function onHeroLoadedData() {
        if (captureHeroPoster()) return;
        const onSeeked = () => {
            demoVideo.removeEventListener('seeked', onSeeked);
            captureHeroPoster();
        };
        demoVideo.addEventListener('seeked', onSeeked);
        demoVideo.currentTime = 0;
    }, { once: true });

    demoVideo.addEventListener('canplay', () => {
        heroCanPlay = true;
        tryHeroAutoplay();
    });

    demoVideo.addEventListener('error', () => {
        heroPosterReady = true;
        demoWrapper.classList.add('demo-poster-ready');
        heroCanPlay = true;
        tryHeroAutoplay();
    });

    SIM1.heroTryAutoplay = tryHeroAutoplay;

    const progressBar   = demoWrapper.querySelector('.progress-bar');
    const progressFilled = demoWrapper.querySelector('.progress-filled');
    const currentTimeEl = demoWrapper.querySelector('.current-time');
    const durationEl    = demoWrapper.querySelector('.duration');
    const fullscreenBtn = demoWrapper.querySelector('.fullscreen-btn');

    // Play state via CSS class
    demoVideo.addEventListener('play',  () => demoWrapper.classList.add('is-playing'));
    demoVideo.addEventListener('pause', () => demoWrapper.classList.remove('is-playing'));

    // Toggle play on any play-pause-btn or the video itself
    function togglePlay() {
        demoVideo.paused ? demoVideo.play() : demoVideo.pause();
    }
    demoWrapper.querySelectorAll('.play-pause-btn').forEach(btn => btn.addEventListener('click', togglePlay));
    demoVideo.addEventListener('click', togglePlay);

    // Progress
    demoVideo.addEventListener('timeupdate', () => {
        if (!demoVideo.duration) return;
        progressFilled.style.width = `${(demoVideo.currentTime / demoVideo.duration) * 100}%`;
        if (currentTimeEl) currentTimeEl.textContent = formatTime(demoVideo.currentTime);
        if (durationEl)    durationEl.textContent    = formatTime(demoVideo.duration);
    });
    demoVideo.addEventListener('loadedmetadata', () => {
        if (durationEl) durationEl.textContent = formatTime(demoVideo.duration);
    });

    progressBar && progressBar.addEventListener('click', (e) => {
        const pos = (e.clientX - progressBar.getBoundingClientRect().left) / progressBar.offsetWidth;
        demoVideo.currentTime = pos * demoVideo.duration;
    });

    // Fullscreen
    fullscreenBtn && fullscreenBtn.addEventListener('click', () => {
        document.fullscreenElement ? document.exitFullscreen() : demoWrapper.requestFullscreen();
    });

    // Keyboard shortcuts (space / arrows)
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.key === ' ')            { e.preventDefault(); togglePlay(); }
        if (e.key === 'ArrowLeft')    demoVideo.currentTime = Math.max(0, demoVideo.currentTime - 5);
        if (e.key === 'ArrowRight')   demoVideo.currentTime = Math.min(demoVideo.duration, demoVideo.currentTime + 5);
    });

}

// Chart bar animations on scroll
const chartBars = document.querySelectorAll('.bar, .comp-bar');
const chartObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const bar = entry.target;
            const originalHeight = bar.style.height;
            bar.style.height = '0%';
            bar.style.transition = 'height 1s ease-out';
            
            setTimeout(() => {
                bar.style.height = originalHeight;
            }, 100);
            
            chartObserver.unobserve(bar);
        }
    });
}, { threshold: 0.5 });

chartBars.forEach(bar => {
    chartObserver.observe(bar);
});

// Method card hover effect enhancement
document.querySelectorAll('.method-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'var(--accent-primary)';
    });
    
    card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'var(--border-color)';
    });
});

// Architecture item animations
document.querySelectorAll('.arch-item').forEach((item, index) => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(20px)';
    item.style.transition = `opacity 0.6s ease ${index * 0.2}s, transform 0.6s ease ${index * 0.2}s`;
    
    setTimeout(() => {
        item.style.opacity = '1';
        item.style.transform = 'translateY(0)';
    }, 500 + index * 200);
});

// Metric card counter animation
const metricCards = document.querySelectorAll('.metric-card');
const metricObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const card = entry.target;
            card.style.transform = 'scale(1.05)';
            
            setTimeout(() => {
                card.style.transform = 'scale(1)';
            }, 300);
            
            metricObserver.unobserve(card);
        }
    });
}, { threshold: 0.5 });

metricCards.forEach(card => {
    card.style.transition = 'transform 0.3s ease';
    metricObserver.observe(card);
});

// Copy citation functionality
function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
}

async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
    }
    return fallbackCopyText(text);
}

document.querySelectorAll('.citation-copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
        const codeEl = btn.closest('.citation-box')?.querySelector('code');
        if (!codeEl) return;

        const ok = await copyText(codeEl.textContent);
        if (!ok) return;

        const copyIcon = btn.querySelector('.copy-icon');
        const checkIcon = btn.querySelector('.check-icon');
        copyIcon.style.display = 'none';
        checkIcon.style.display = 'block';
        btn.classList.add('copied');

        setTimeout(() => {
            copyIcon.style.display = '';
            checkIcon.style.display = 'none';
            btn.classList.remove('copied');
        }, 2000);
    });
});

// Social link hover effects
document.querySelectorAll('.social-link').forEach(link => {
    link.addEventListener('mouseenter', () => {
        link.style.transform = 'translateY(-2px)';
    });
    
    link.addEventListener('mouseleave', () => {
        link.style.transform = 'translateY(0)';
    });
});

// Parallax effect for hero section
const hero = document.querySelector('.hero');
if (hero) {
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const rate = scrolled * 0.3;
        hero.style.backgroundPositionY = `${rate}px`;
    });
}

// Lightweight particle collisions + ripple field behind the SIM1 wordmark only.
function initHeroTitleFx() {
    const host = document.querySelector('.title-name-wrap');
    const canvas = document.getElementById('heroTitleFx');
    if (!host || !canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = {
        width: 0,
        height: 0,
        dpr: 1,
        particles: [],
        ripples: [],
        rafId: 0,
        running: true,
        lastTs: 0,
        lastPointerRipple: 0,
        lastAutoPulse: 0
    };

    const PARTICLE_COUNT = window.innerWidth < 768 ? 18 : 30;
    const MAX_RIPPLES = 18;

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function getPalette() {
        const isLight = document.body.classList.contains('theme-light');
        if (isLight) {
            return {
                glowCore: 'rgba(74, 106, 175, 0.12)',
                glowMid: 'rgba(92, 122, 188, 0.09)',
                glowEdge: 'rgba(92, 122, 188, 0)',
                linkRgb: '86, 111, 166',
                rippleRgb: '78, 104, 162',
                particleFill: 'rgba(66, 89, 140, 0.85)',
                particleShadow: 'rgba(96, 124, 186, 0.22)'
            };
        }
        return {
            glowCore: 'rgba(90, 130, 255, 0.085)',
            glowMid: 'rgba(95, 135, 255, 0.11)',
            glowEdge: 'rgba(80, 120, 255, 0)',
            linkRgb: '145, 180, 255',
            rippleRgb: '150, 190, 255',
            particleFill: 'rgba(220, 232, 255, 0.88)',
            particleShadow: 'rgba(120, 165, 255, 0.36)'
        };
    }

    function emitRipple(x, y, strength = 1) {
        if (state.ripples.length >= MAX_RIPPLES) state.ripples.shift();
        state.ripples.push({
            x,
            y,
            radius: 2,
            maxRadius: rand(26, 50) * strength,
            alpha: 0.28 * Math.min(strength, 1.2),
            growth: rand(22, 34)
        });
    }

    function seedParticles() {
        state.particles = [];
        for (let i = 0; i < PARTICLE_COUNT; i += 1) {
            state.particles.push({
                x: rand(12, state.width - 12),
                y: rand(10, state.height - 10),
                vx: rand(-22, 22),
                vy: rand(-16, 16),
                r: rand(1.4, 2.5)
            });
        }
        emitRipple(state.width * 0.32, state.height * 0.52, 1.15);
        emitRipple(state.width * 0.68, state.height * 0.48, 1.15);
    }

    function resize() {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        state.width = Math.max(10, rect.width);
        state.height = Math.max(10, rect.height);
        canvas.width = Math.round(state.width * state.dpr);
        canvas.height = Math.round(state.height * state.dpr);
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        seedParticles();
    }

    function drawBackdrop() {
        const palette = getPalette();
        const gradient = ctx.createRadialGradient(
            state.width * 0.48,
            state.height * 0.52,
            6,
            state.width * 0.48,
            state.height * 0.52,
            state.width * 0.62
        );
        gradient.addColorStop(0, palette.glowCore);
        gradient.addColorStop(0.32, palette.glowMid);
        gradient.addColorStop(0.62, palette.glowMid.replace(/0\.\d+\)$/, '0.04)'));
        gradient.addColorStop(1, palette.glowEdge);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, state.width, state.height);
    }

    function update(dt) {
        state.lastAutoPulse += dt;
        if (state.lastAutoPulse > 1.25 && state.particles.length) {
            const p = state.particles[(Math.random() * state.particles.length) | 0];
            emitRipple(p.x, p.y, 0.95);
            state.lastAutoPulse = 0;
        }

        for (const p of state.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            if (p.x <= p.r || p.x >= state.width - p.r) {
                p.vx *= -1;
                p.x = Math.max(p.r, Math.min(state.width - p.r, p.x));
                emitRipple(p.x, p.y, 0.7);
            }
            if (p.y <= p.r || p.y >= state.height - p.r) {
                p.vy *= -1;
                p.y = Math.max(p.r, Math.min(state.height - p.r, p.y));
                emitRipple(p.x, p.y, 0.7);
            }
        }

        for (let i = 0; i < state.particles.length; i += 1) {
            for (let j = i + 1; j < state.particles.length; j += 1) {
                const a = state.particles[i];
                const b = state.particles[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy) || 0.001;
                const minDist = a.r + b.r + 2.5;
                if (dist >= minDist) continue;

                const nx = dx / dist;
                const ny = dy / dist;
                const overlap = (minDist - dist) * 0.5;
                a.x -= nx * overlap;
                a.y -= ny * overlap;
                b.x += nx * overlap;
                b.y += ny * overlap;

                const va = a.vx * nx + a.vy * ny;
                const vb = b.vx * nx + b.vy * ny;
                const impulse = vb - va;
                a.vx += nx * impulse;
                a.vy += ny * impulse;
                b.vx -= nx * impulse;
                b.vy -= ny * impulse;

                emitRipple((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, 1);
            }
        }

        state.ripples = state.ripples.filter((ripple) => {
            ripple.radius += ripple.growth * dt;
            ripple.alpha -= 0.32 * dt;
            return ripple.alpha > 0 && ripple.radius < ripple.maxRadius;
        });
    }

    function render() {
        const palette = getPalette();
        ctx.clearRect(0, 0, state.width, state.height);
        drawBackdrop();

        for (let i = 0; i < state.particles.length; i += 1) {
            for (let j = i + 1; j < state.particles.length; j += 1) {
                const a = state.particles[i];
                const b = state.particles[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 34) continue;
                const alpha = (1 - dist / 34) * 0.14;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.strokeStyle = `rgba(${palette.linkRgb}, ${alpha})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        for (const ripple of state.ripples) {
            ctx.beginPath();
            ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${palette.rippleRgb}, ${ripple.alpha})`;
            ctx.lineWidth = 1.1;
            ctx.stroke();
        }

        for (const p of state.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = palette.particleFill;
            ctx.shadowColor = palette.particleShadow;
            ctx.shadowBlur = 10;
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }

    function frame(ts) {
        if (!state.running) return;
        const dt = Math.min((ts - (state.lastTs || ts)) / 1000, 0.033);
        state.lastTs = ts;
        update(prefersReducedMotion ? 0.006 : dt);
        render();
        state.rafId = window.requestAnimationFrame(frame);
    }

    host.addEventListener('pointermove', (event) => {
        const now = performance.now();
        if (now - state.lastPointerRipple < 140) return;
        const rect = canvas.getBoundingClientRect();
        emitRipple(event.clientX - rect.left, event.clientY - rect.top, 0.9);
        state.lastPointerRipple = now;
    });

    host.addEventListener('pointerdown', (event) => {
        const rect = canvas.getBoundingClientRect();
        emitRipple(event.clientX - rect.left, event.clientY - rect.top, 1.2);
    });

    document.addEventListener('visibilitychange', () => {
        state.running = !document.hidden;
        if (state.running && !state.rafId) {
            state.lastTs = 0;
            state.rafId = window.requestAnimationFrame(frame);
        }
        if (!state.running && state.rafId) {
            window.cancelAnimationFrame(state.rafId);
            state.rafId = 0;
        }
    });

    const observer = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => resize())
        : null;
    observer && observer.observe(canvas);

    const themeObserver = new MutationObserver(() => {
        render();
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    resize();
    render();
    state.rafId = window.requestAnimationFrame(frame);
}

// Loading animation
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);

    initHeroTitleFx();
});

// ── Solver Reel — drag-to-scroll + looping nav buttons ──
function initSolverReel(reelEl, prevBtn, nextBtn) {
    if (!reelEl) return;

    let cards = Array.from(reelEl.querySelectorAll('.solver-card'));
    let currentIdx = 0;
    let isDown = false, dragStartX = 0, dragScrollLeft = 0, hasDragged = false;

    // Card step in pixels (card width + gap)
    function cardStep() {
        cards = Array.from(reelEl.querySelectorAll('.solver-card'));
        if (cards.length < 2) return 476;
        const padLeft = parseInt(window.getComputedStyle(reelEl).paddingLeft) || 0;
        return (cards[1].offsetLeft - padLeft) - (cards[0].offsetLeft - padLeft);
    }

    function navigateReel(dir) {
        const step = cardStep();
        const maxScroll = reelEl.scrollWidth - reelEl.clientWidth;

        if (dir > 0) {
            if (reelEl.scrollLeft >= maxScroll - 4) {
                // At right end → loop to start
                reelEl.scrollTo({ left: 0, behavior: 'smooth' });
                currentIdx = 0;
            } else {
                currentIdx = Math.min(currentIdx + 1, cards.length - 1);
                reelEl.scrollBy({ left: step, behavior: 'smooth' });
            }
        } else {
            if (reelEl.scrollLeft <= 4) {
                // At left end → loop to end
                reelEl.scrollTo({ left: maxScroll, behavior: 'smooth' });
                currentIdx = cards.length - 1;
            } else {
                currentIdx = Math.max(currentIdx - 1, 0);
                reelEl.scrollBy({ left: -step, behavior: 'smooth' });
            }
        }
    }

    // Keep currentIdx in sync after free scroll / drag
    let syncTimer;
    reelEl.addEventListener('scroll', () => {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            const step = cardStep();
            currentIdx = Math.round(reelEl.scrollLeft / step);
            currentIdx = Math.max(0, Math.min(currentIdx, cards.length - 1));
        }, 80);
    });

    // Nav buttons
    prevBtn && prevBtn.addEventListener('click', () => navigateReel(-1));
    nextBtn && nextBtn.addEventListener('click', () => navigateReel(+1));

    // Drag-to-scroll
    reelEl.addEventListener('mousedown', (e) => {
        isDown = true;
        hasDragged = false;
        reelEl.classList.add('is-dragging');
        dragStartX = e.pageX - reelEl.offsetLeft;
        dragScrollLeft = reelEl.scrollLeft;
    });

    document.addEventListener('mouseup', () => {
        isDown = false;
        reelEl.classList.remove('is-dragging');
    });

    reelEl.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x    = e.pageX - reelEl.offsetLeft;
        const walk = (x - dragStartX) * 1.4;
        if (Math.abs(walk) > 4) hasDragged = true;
        reelEl.scrollLeft = dragScrollLeft - walk;
    });

    // Prevent click-through after a drag
    reelEl.addEventListener('click', (e) => {
        if (hasDragged) e.stopPropagation();
    }, true);
}

const solverReel = document.getElementById('solverReel');
const solverPrev = document.getElementById('solverPrev');
const solverNext = document.getElementById('solverNext');
initSolverReel(solverReel, solverPrev, solverNext);

console.log('Psi0 Website Loaded Successfully!');

// ── Results bar charts (3 panels, animated + tooltip + replay) ──
(() => {
    const rootPi05 = document.getElementById('results-bar-chart-pi05');
    const rootPi0 = document.getElementById('results-bar-chart-pi0');
    const rootScratch = document.getElementById('results-bar-chart-scratch');
    const tooltip = document.getElementById('results-bar-tooltip');
    if (!rootPi05 || !rootPi0 || !rootScratch || !tooltip) return;

    /* Sections use transform (fade-in). Any transformed ancestor breaks position:fixed for
       descendants — clientX/Y no longer match left/top. Reparent tooltip to body. */
    if (tooltip.parentElement !== document.body) {
        document.body.appendChild(tooltip);
    }

    // Values provided by user.
    // Order within each category (triples): Real, Sim Teleoperated, Sim Generated.
    const categories5 = ['In-domain', 'Spatial', 'Texture', 'Viewpoint', 'Lighting'];
    const pi05Vals = [97, 87, 90, 43, 40, 93, 77, 83, 90, 0, 0, 47, 47, 63, 93];
    const pi0Vals = [3, 0, 76, 3, 3, 20, 0, 0, 20, 0, 0, 19, 13, 0, 43];

    function triplesToRows(values) {
        const rows = [];
        for (let i = 0; i < categories5.length; i++) {
            const base = i * 3;
            rows.push({
                label: categories5[i],
                real: values[base],
                tele: values[base + 1],
                gen: values[base + 2],
            });
        }
        return rows;
    }

    const barData = {
        // First panel: π0.5 (from scratch), In-domain only, two bars:
        scratchPi05InDomain: [{ label: 'In-domain', real: 0, gen: 76 }],
        pi05: triplesToRows(pi05Vals),
        pi0: triplesToRows(pi0Vals),
    };

    function clamp01(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(100, n));
    }

    function barHeightVar(v) {
        const n = clamp01(v);
        // Baseline height for 0, and all values stack on top of it.
        // Keep in sync with CSS `.bar-stack { height: 220px; }`.
        const basePx = 6;
        const stackPx = 220;
        const px = basePx + (n / 100) * (stackPx - basePx);
        return `${px.toFixed(2)}px`;
    }

    function hideTooltip() {
        tooltip.classList.remove('is-visible');
        tooltip.setAttribute('aria-hidden', 'true');
    }

    function showTooltip(e, groupLabel, seriesLabel, value) {
        tooltip.innerHTML = `
            <div class="tooltip-title">${groupLabel}</div>
            <div class="tooltip-row"><span>${seriesLabel}</span><span>${value}</span></div>
        `;
        tooltip.setAttribute('aria-hidden', 'false');
        tooltip.classList.add('is-visible');

        const pad = 12;
        const ox = 14;
        const oy = 10;
        function place() {
            const tw = tooltip.offsetWidth || 160;
            const th = tooltip.offsetHeight || 72;
            let x = e.clientX + ox;
            let y = e.clientY + oy;
            x = Math.max(pad, Math.min(window.innerWidth - tw - pad, x));
            y = Math.max(pad, Math.min(window.innerHeight - th - pad, y));
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        }
        place();
        requestAnimationFrame(place);
    }

    function renderInto(root, rows, series, panelIndex) {
        root.classList.remove('is-animated');
        root.innerHTML = '';

        const groups = document.createElement('div');
        groups.className = 'bar-groups';

        for (const r of rows) {
            const group = document.createElement('div');
            group.className = 'bar-group';

            const stack = document.createElement('div');
            stack.className = 'bar-stack';
            // Use fixed column widths so "gap" is visually meaningful.
            stack.style.gridTemplateColumns = `repeat(${series.length}, 20px)`;
            stack.style.justifyContent = 'center';

            for (let si = 0; si < series.length; si++) {
                const it = series[si];
                const v = clamp01(r[it.key]);
                const bar = document.createElement('div');
                bar.className = `bar ${it.cls}`;
                bar.style.setProperty('--bar-base', '6px');
                bar.style.setProperty('--bar-h', barHeightVar(v));
                // Stagger per panel a bit so the whole section feels animated.
                const delayMs = panelIndex * 140 + si * 60;
                bar.style.transitionDelay = `${delayMs}ms`;
                bar.setAttribute('role', 'img');
                bar.setAttribute('aria-label', `${r.label} ${it.name}: ${v}`);

                bar.addEventListener('mouseenter', (e) => showTooltip(e, r.label, it.name, v));
                bar.addEventListener('mousemove', (e) => showTooltip(e, r.label, it.name, v));
                bar.addEventListener('mouseleave', hideTooltip);

                stack.appendChild(bar);
            }

            const label = document.createElement('div');
            label.className = 'bar-label';
            label.textContent = r.label;

            group.appendChild(stack);
            group.appendChild(label);
            groups.appendChild(group);
        }

        root.appendChild(groups);

        // Trigger animation after layout/paint so height transition runs reliably.
        // Small stagger between panels for a nicer effect.
        setTimeout(() => {
            root.classList.add('is-animated');
        }, 60 + panelIndex * 120);
    }

    function animateAll() {
        // one-shot: reset and let each panel re-add `is-animated` via renderInto()
        for (const root of [rootPi05, rootPi0, rootScratch]) {
            root.classList.remove('is-animated');
        }
    }

    // initial render (3 panels)
    // Order within each task-group: Real → Sim Teleoperated (if any) → Sim Generated
    // Colors are driven by CSS classes: .bar.real / .bar.tele / .bar.gen
    const series3 = [
        { key: 'real', cls: 'real', name: 'Real Data' },
        { key: 'tele', cls: 'tele', name: 'Sim Teleoperated Data' },
        { key: 'gen',  cls: 'gen',  name: 'Sim Generated Data' }
    ];
    const seriesScratch2 = [
        { key: 'real', cls: 'real', name: 'Real Data' },
        { key: 'gen',  cls: 'gen',  name: 'Sim Generated Data' }
    ];

    // Order: π0.5 (from scratch) → π0.5 → π0
    renderInto(rootScratch, barData.scratchPi05InDomain, seriesScratch2, 0);
    renderInto(rootPi05, barData.pi05, series3, 1);
    renderInto(rootPi0, barData.pi0, series3, 2);

    // Cancel any previous auto-replay (no longer looping).
    if (window.__resultsBarReplayTimeoutId) {
        clearTimeout(window.__resultsBarReplayTimeoutId);
        window.__resultsBarReplayTimeoutId = null;
    }

    // safety: hide tooltip on scroll
    window.addEventListener('scroll', hideTooltip, { passive: true });
})();

// ── Results videos: row 1 = videos/zip_1/, row 2 = videos/zip/ ──
(() => {
    function appendZipReel(reel, folder, indices) {
        const frag = document.createDocumentFragment();
        indices.forEach((i, index) => {
            const card = document.createElement('div');
            card.className = 'solver-card';

            const wrap = document.createElement('div');
            wrap.className = 'solver-vid-wrap zip-video-badge';

            const video = document.createElement('video');
            video.classList.add('video-adaptive');
            video.dataset.adaptiveHq = `videos/${folder}/zip_${i}.mp4`;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.preload = 'none';

            const label = document.createElement('p');
            label.className = 'solver-label';
            label.textContent = `Vis ${index + 1}`;

            wrap.appendChild(video);
            card.appendChild(wrap);
            card.appendChild(label);
            frag.appendChild(card);
        });
        reel.appendChild(frag);
        reel.querySelectorAll('video.video-adaptive').forEach((v) => SIM1.registerAdaptiveVideo(v));
    }

    /** Full filenames under videos/{folder}/ — same card layout as zip reels, no zip badge. */
    function appendNamedReel(reel, folder, filenames) {
        const frag = document.createDocumentFragment();
        filenames.forEach((name, index) => {
            const card = document.createElement('div');
            card.className = 'solver-card';

            const wrap = document.createElement('div');
            wrap.className = 'solver-vid-wrap';

            const video = document.createElement('video');
            video.classList.add('video-adaptive');
            video.dataset.adaptiveHq = `videos/${folder}/${name}`;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.preload = 'none';
            video.addEventListener('loadedmetadata', () => {
                if (video.videoWidth && video.videoHeight) {
                    wrap.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
                }
            });

            const label = document.createElement('p');
            label.className = 'solver-label';
            label.textContent = `Case ${index + 1}`;

            wrap.appendChild(video);
            card.appendChild(wrap);
            card.appendChild(label);
            frag.appendChild(card);
        });
        reel.appendChild(frag);
        reel.querySelectorAll('video.video-adaptive').forEach((v) => SIM1.registerAdaptiveVideo(v));
    }

    // Order: zip_1 first, then zip (indices match files on disk).
    const zip1Indices = [
        4, 5, 6, 7, 8, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29, 30, 31
    ];
    const zipIndices = [
        0, 2, 9, 14, 15, 16, 23, 24, 34, 35, 36, 37, 38, 39, 40
    ];

    const reel1 = document.getElementById('resultsReelZip1');
    const reel2 = document.getElementById('resultsReelZip');
    const reelNovel = document.getElementById('resultsReelNovel');
    if (!reel1 || !reel2) return;

    appendZipReel(reel1, 'zip_1', zip1Indices);
    appendZipReel(reel2, 'zip', zipIndices);

    initSolverReel(reel1, document.getElementById('resultsPrevZip1'), document.getElementById('resultsNextZip1'));
    initSolverReel(reel2, document.getElementById('resultsPrevZip'), document.getElementById('resultsNextZip'));

    const novelSolverFiles = [
        'scene_550.mp4',
        'scene_551.mp4',
        'scene_552.mp4',
        'scene_553.mp4',
        'scene_554.mp4',
        'scene_560.mp4',
        'scene_561.mp4',
        'scene_562.mp4',
        'scene_563.mp4',
        'scene_564.mp4'
    ];
    if (reelNovel) {
        appendNamedReel(reelNovel, 'novel_solver_videos', novelSolverFiles);
        initSolverReel(reelNovel, document.getElementById('resultsPrevNovel'), document.getElementById('resultsNextNovel'));
    }
})();

// Defer YouTube until every adaptive video has finished super-low load (canplay or fallback); see SIM1.onAllSuperLowReadyForYoutube
(() => {
    let done = false;
    function startCoverflowYt() {
        if (done) return;
        done = true;
        if (window.SIM1 && typeof SIM1.startCoverflowYoutube === 'function') {
            SIM1.startCoverflowYoutube();
        }
    }
    if (window.SIM1 && typeof SIM1.onAllSuperLowReadyForYoutube === 'function') {
        SIM1.onAllSuperLowReadyForYoutube(startCoverflowYt);
    } else {
        window.setTimeout(startCoverflowYt, 0);
    }
    window.setTimeout(startCoverflowYt, 90000);
})();

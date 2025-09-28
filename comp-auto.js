// ==UserScript==
// @name         Auto Search with Persistent Pause/Resume
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  Auto search with play/pause toggle, persistent pause-after-X searches and resume-after-Y-minutes (survives page loads)
// @author       KIDhacker
// @match        *://www.bing.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function() {
    'use strict';

    const defaultWords = ['apple','banana','cherry','date','elderberry','fig','grape','honeydew'];

    // persisted state keys:
    // 'searchCount', 'pauseAfter', 'resumeAfter', 'isPaused', 'pauseUntil', 'bookmarkletIndex', 'wordList', 'lastUsedWord'
    let searchCount = GM_getValue('searchCount', 0);
    let pauseAfter = GM_getValue('pauseAfter', 0);
    let resumeAfter = GM_getValue('resumeAfter', 0); // minutes
    let isPaused = GM_getValue('isPaused', false);
    let pauseUntil = GM_getValue('pauseUntil', 0); // timestamp ms or 0
    let resumeTimer = null;

    let terms = GM_getValue('wordList', defaultWords);
    let index = GM_getValue('bookmarkletIndex', 0);

    let statusText, toggleBtn, pauseInput, resumeInput;

    // format remaining time
    function msToTime(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(total/3600);
        const m = Math.floor((total%3600)/60);
        const s = total % 60;
        if (h) return `${h}h ${m}m ${s}s`;
        if (m) return `${m}m ${s}s`;
        return `${s}s`;
    }

    function updateStatus(extra = "") {
        const now = Date.now();
        let untilStr = pauseUntil && pauseUntil > now ? ` (for ${msToTime(pauseUntil-now)})` : (pauseUntil ? ' (expired)' : '');
        statusText.innerHTML =
            `Searches: ${searchCount}<br>` +
            `PauseAfter: ${pauseAfter || 0}<br>` +
            `ResumeAfter: ${resumeAfter || 0}m<br>` +
            `State: ${isPaused ? 'Paused' : 'Running'}${untilStr}<br>` +
            (extra ? `<span style="color:yellow">${extra}</span>` : "");
        // set toggle button label
        if (toggleBtn) toggleBtn.textContent = isPaused ? '▶ Play' : '⏸ Pause';
    }

    // create UI
    function createControlPanel() {
        const panel = document.createElement('div');
        panel.style.position = 'fixed';
        panel.style.bottom = '20px';
        panel.style.right = '20px';
        panel.style.zIndex = '9999';
        panel.style.background = 'rgba(0,0,0,0.85)';
        panel.style.padding = '12px';
        panel.style.borderRadius = '10px';
        panel.style.color = 'white';
        panel.style.fontFamily = 'Arial, sans-serif';
        panel.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
        panel.style.fontSize = '13px';
        panel.style.width = '220px';

        // Toggle Button
        toggleBtn = document.createElement('button');
        toggleBtn.style.margin = '5px 0';
        toggleBtn.style.padding = '6px 12px';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.width = '100%';
        toggleBtn.onclick = () => {
            isPaused = !isPaused;
            GM_setValue('isPaused', isPaused);
            if (!isPaused) {
                // manual resume: clear pauseUntil (if any) and reset counter? keep behavior: manual resume continues (not auto-reset)
                pauseUntil = 0;
                GM_setValue('pauseUntil', 0);
                updateStatus("Resumed manually");
                triggerSearch();
            } else {
                updateStatus("Paused manually");
                if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
            }
        };
        // Inputs
        pauseInput = document.createElement('input');
        pauseInput.type = 'number';
        pauseInput.min = '0';
        pauseInput.placeholder = 'Pause after (searches)';
        pauseInput.style.margin = '6px 0';
        pauseInput.style.width = '100%';
        pauseInput.value = pauseAfter || '';

        pauseInput.onchange = () => {
            pauseAfter = parseInt(pauseInput.value) || 0;
            GM_setValue('pauseAfter', pauseAfter);
            updateStatus("Saved pause-after");
        };

        resumeInput = document.createElement('input');
        resumeInput.type = 'number';
        resumeInput.min = '0';
        resumeInput.placeholder = 'Resume after (minutes)';
        resumeInput.style.margin = '6px 0';
        resumeInput.style.width = '100%';
        resumeInput.value = resumeAfter || '';

        resumeInput.onchange = () => {
            resumeAfter = parseInt(resumeInput.value) || 0;
            GM_setValue('resumeAfter', resumeAfter);
            updateStatus("Saved resume-after");
        };

        // Status display
        statusText = document.createElement('div');
        statusText.style.marginTop = '8px';
        statusText.style.fontSize = '12px';
        statusText.style.lineHeight = '1.4';

        panel.appendChild(toggleBtn);
        panel.appendChild(pauseInput);
        panel.appendChild(resumeInput);
        panel.appendChild(statusText);
        document.body.appendChild(panel);

        updateStatus();
    }

    // schedule resume with persistence
    function scheduleResume(ms) {
        if (resumeTimer) clearTimeout(resumeTimer);
        if (!ms || ms <= 0) return;
        resumeTimer = setTimeout(() => {
            isPaused = false;
            GM_setValue('isPaused', false);
            pauseUntil = 0;
            GM_setValue('pauseUntil', 0);
            // reset search count on auto-resume so next run starts fresh
            searchCount = 0;
            GM_setValue('searchCount', 0);
            updateStatus(`Auto-resumed after ${resumeAfter}m`);
            triggerSearch();
        }, ms);
    }

    // fetch word list (keeps behaviour from before)
    function fetchWordList() {
        return fetch('https://random-word-api.vercel.app/api?words=70')
            .then(r => r.ok ? r.json() : defaultWords)
            .catch(() => defaultWords);
    }
    function fetchAndStoreWordList() {
        fetchWordList().then(words => {
            GM_setValue('wordList', words);
            terms = words;
        });
    }
    function setWordListUpdateTimer() {
        fetchAndStoreWordList();
        setInterval(fetchAndStoreWordList, 24 * 60 * 60 * 1000);
    }
    setWordListUpdateTimer();

    function getRandomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function typeSearchTerm(searchInput, term, callback) {
        searchInput.focus();
        searchInput.value = '';
        let i = 0;
        const interval = setInterval(() => {
            searchInput.value += term[i];
            i++;
            if (i === term.length) {
                clearInterval(interval);
                callback();
            }
        }, getRandomDelay(20, 50));
    }

    function getRandomIndexAvoidLast(max, last) {
        if (!max) return 0;
        let newIndex = last;
        while (newIndex === last) {
            newIndex = Math.floor(Math.random() * max);
        }
        return newIndex;
    }

    function triggerSearch() {
        // if paused, don't start
        if (isPaused) return;

        const searchInput = document.getElementById('sb_form_q');
        const form = searchInput && searchInput.closest('form');

        if (searchInput && form) {
            let randomIndex = getRandomIndexAvoidLast(terms.length, index);
            let term = terms[randomIndex];

            typeSearchTerm(searchInput, term, () => {
                // record index/word
                index = randomIndex;
                GM_setValue('bookmarkletIndex', index);
                GM_setValue('lastUsedWord', term);
                GM_setValue('lastUsedTime', Date.now());

                // increment and persist count BEFORE submit so next page knows it
                searchCount = (parseInt(GM_getValue('searchCount', 0)) || 0) + 1;
                GM_setValue('searchCount', searchCount);
                updateStatus();

                // check pause after
                if (pauseAfter > 0 && searchCount >= pauseAfter) {
                    isPaused = true;
                    GM_setValue('isPaused', true);

                    if (resumeAfter > 0) {
                        pauseUntil = Date.now() + resumeAfter * 60 * 1000;
                        GM_setValue('pauseUntil', pauseUntil);
                        scheduleResume(resumeAfter * 60 * 1000);
                        updateStatus(`Auto-paused at ${searchCount}`);
                    } else {
                        pauseUntil = 0;
                        GM_setValue('pauseUntil', 0);
                        updateStatus(`Auto-paused at ${searchCount} (no auto-resume)`);
                    }
                    // do not schedule next search
                    return;
                }

                // submit will navigate — when page reloads script reads persisted searchCount/isPaused etc.
                setTimeout(() => form.submit(), 100);
            });
        } else {
            // input not ready yet, retry
            setTimeout(triggerSearch, 1000);
        }
    }

    // init UI & state on load
    createControlPanel();

    // restore UI inputs from storage
    pauseInput.value = pauseAfter || '';
    resumeInput.value = resumeAfter || '';

    // handle persisted pauseUntil (auto-resume) across reloads
    const now = Date.now();
    if (pauseUntil && pauseUntil > now) {
        // still paused, schedule remaining time
        isPaused = true;
        GM_setValue('isPaused', true);
        const remaining = pauseUntil - now;
        scheduleResume(remaining);
        updateStatus('Paused (resume scheduled)');
    } else if (pauseUntil && pauseUntil <= now) {
        // pauseUntil expired while we were away -> clear and resume now
        pauseUntil = 0;
        GM_setValue('pauseUntil', 0);
        isPaused = false;
        GM_setValue('isPaused', false);
        searchCount = 0;
        GM_setValue('searchCount', 0);
        updateStatus('Auto-resumed (expired while away)');
        // start searching again
        setTimeout(triggerSearch, getRandomDelay(8000, 10000));
        return;
    }

    // if not paused, start (with initial stagger)
    if (!isPaused) {
        setTimeout(triggerSearch, getRandomDelay(8000, 10000));
    } else {
        updateStatus('Paused on load');
    }

})();

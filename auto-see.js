// ==UserScript==
// @name         Bing Auto Search Bot
// @namespace    https://github.com/kidhacker45/tempermonkeybing
// @version      1.1.0
// @description  Automatically performs continuous Bing searches with random words from GitHub
// @author       KidHacker
// @match        https://www.bing.com/*
// @match        https://bing.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @updateURL    https://raw.githubusercontent.com/kidhacker45/tempermonkeybing/refs/heads/main/auto-see.js
// @downloadURL  https://raw.githubusercontent.com/kidhacker45/tempermonkeybing/refs/heads/main/auto-see.js
// ==/UserScript==
(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        GITHUB_WORD_LIST_URL: 'https://raw.githubusercontent.com/kidhacker45/tempermonkeybing/refs/heads/main/words.json', // Update with your actual URL
        MIN_SEARCH_DELAY: 5000,// 5 seconds
        MAX_SEARCH_DELAY: 10000,// 10 seconds
        MIN_TYPING_DELAY: 80,// 80ms
        MAX_TYPING_DELAY: 100,// 100ms
        RETRY_DELAY: 2000,// 1 second retry delay
        DEFAULT_WORDS: [
            'apple', 'banana', 'computer', 'database', 'elephant',
            'forest', 'guitar', 'horizon', 'island', 'journey',
            'kitchen', 'library', 'mountain', 'notebook', 'ocean',
            'penguin', 'question', 'rainbow', 'satellite', 'telescope',
            'umbrella', 'volcano', 'waterfall', 'xylophone', 'yesterday',
            'zebra', 'astronomy', 'bicycle', 'chocolate', 'dinosaur'
        ]
    };

    // State management
    let isRunning = false;
    let wordList = [...CONFIG.DEFAULT_WORDS];
    let searchTimeout = null;
    let currentController = null;

    // UI Creation
    function createUI() {
        const panel = document.createElement('div');
        panel.id = 'bing-auto-search-panel';
        panel.innerHTML = `
            <div style="
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #1a1a1a;
                border: 2px solid #333;
                border-radius: 8px;
                padding: 15px;
                color: #fff;
                font-family: Arial, sans-serif;
                font-size: 14px;
                z-index: 999999;
                box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                min-width: 200px;
            ">
                <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #4CAF50;">Bing Auto Search</h3>
                <div style="margin-bottom: 10px;">
                    <span id="search-status">Status: Stopped</span>
                </div>
                <div style="margin-bottom: 10px;">
                    <span id="word-count">Words loaded: ${wordList.length}</span>
                </div>
                <div style="margin-bottom: 10px;">
                    <span id="last-word">Last word: None</span>
                </div>
                <button id="toggle-search" style="
                    width: 100%;
                    padding: 8px;
                    background: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                    transition: background 0.3s;
                ">Start Searching</button>
            </div>
        `;

        document.body.appendChild(panel);

        // Button event listener
        document.getElementById('toggle-search').addEventListener('click', toggleSearch);

        // Hover effect
        const button = document.getElementById('toggle-search');
        button.addEventListener('mouseenter', () => {
            button.style.background = isRunning ? '#d32f2f' : '#45a049';
        });
        button.addEventListener('mouseleave', () => {
            button.style.background = isRunning ? '#f44336' : '#4CAF50';
        });
    }

    // Update UI elements
    function updateUI() {
        const statusEl = document.getElementById('search-status');
        const buttonEl = document.getElementById('toggle-search');
        const lastWordEl = document.getElementById('last-word');

        if (statusEl) {
            statusEl.textContent = `Status: ${isRunning ? 'Running' : 'Stopped'}`;
            statusEl.style.color = isRunning ? '#4CAF50' : '#f44336';
        }

        if (buttonEl) {
            buttonEl.textContent = isRunning ? 'Stop Searching' : 'Start Searching';
            buttonEl.style.background = isRunning ? '#f44336' : '#4CAF50';
        }

        const lastWord = GM_getValue('lastSearchWord', 'None');
        if (lastWordEl) {
            lastWordEl.textContent = `Last word: ${lastWord}`;
        }
    }

    // Fetch words from GitHub
    async function fetchWordsFromGitHub() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: CONFIG.GITHUB_WORD_LIST_URL,
                timeout: 5000,
                onload: function(response) {
                    try {
                        if (response.status === 200) {
                            const data = JSON.parse(response.responseText);
                            // Handle different possible formats
                            let words = [];
                            if (Array.isArray(data)) {
                                words = data;
                            } else if (data.words && Array.isArray(data.words)) {
                                words = data.words;
                            } else if (typeof data === 'object') {
                                // Try to extract arrays from object
                                words = Object.values(data).flat().filter(w => typeof w === 'string');
                            }

                            if (words.length > 0) {
                                wordList = words;
                                console.log(`Loaded ${words.length} words from GitHub`);
                                updateWordCount();
                                resolve(true);
                            } else {
                                throw new Error('No valid words found in response');
                            }
                        } else {
                            throw new Error(`HTTP ${response.status}`);
                        }
                    } catch (error) {
                        console.error('Failed to parse GitHub words:', error);
                        console.log('Using default word list');
                        resolve(false);
                    }
                },
                onerror: function() {
                    console.error('Failed to fetch words from GitHub');
                    console.log('Using default word list');
                    resolve(false);
                },
                ontimeout: function() {
                    console.error('GitHub request timed out');
                    console.log('Using default word list');
                    resolve(false);
                }
            });
        });
    }

    // Update word count in UI
    function updateWordCount() {
        const wordCountEl = document.getElementById('word-count');
        if (wordCountEl) {
            wordCountEl.textContent = `Words loaded: ${wordList.length}`;
        }
    }

    // Get random word (avoiding last used)
    function getRandomWord() {
        const lastWord = GM_getValue('lastSearchWord', '');
        let availableWords = wordList.filter(w => w !== lastWord);

        if (availableWords.length === 0) {
            availableWords = wordList;
        }

        const randomIndex = Math.floor(Math.random() * availableWords.length);
        const selectedWord = availableWords[randomIndex];

        GM_setValue('lastSearchWord', selectedWord);
        return selectedWord;
    }

    // Find search elements
    function findSearchElements() {
        // Try multiple possible selectors for Bing's search box
        const searchBoxSelectors = [
            'input[name="q"]',
            'input#sb_form_q',
            'textarea[name="q"]',
            'input[type="search"]',
            'input.b_searchbox'
        ];

        let searchBox = null;
        for (const selector of searchBoxSelectors) {
            searchBox = document.querySelector(selector);
            if (searchBox) break;
        }

        if (!searchBox) return null;

        // Find the form
        let searchForm = searchBox.closest('form');
        if (!searchForm) {
            // Try to find form by ID or class
            searchForm = document.querySelector('#sb_form') ||
                        document.querySelector('form.b_searchbox') ||
                        document.querySelector('form[action*="search"]');
        }

        return { searchBox, searchForm };
    }

    // Simulate typing
    async function simulateTyping(element, text) {
        // Clear existing text
        element.value = '';
        element.focus();

        // Trigger input event for clearing
        element.dispatchEvent(new Event('input', { bubbles: true }));

        // Type each character
        for (let i = 0; i < text.length; i++) {
            if (!isRunning) break;

            element.value += text[i];

            // Trigger events
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keydown', { key: text[i], bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { key: text[i], bubbles: true }));

            // Random delay between keystrokes
            const delay = CONFIG.MIN_TYPING_DELAY + Math.random() * (CONFIG.MAX_TYPING_DELAY - CONFIG.MIN_TYPING_DELAY);
            await sleep(delay);
        }
    }

    // Submit search
    function submitSearch(searchForm, searchBox) {
        if (searchForm) {
            // Try multiple submission methods
            const submitButton = searchForm.querySelector('input[type="submit"], button[type="submit"], #sb_form_go');

            if (submitButton) {
                submitButton.click();
            } else {
                searchForm.submit();
            }
        } else {
            // Fallback: simulate Enter key
            searchBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            searchBox.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
            searchBox.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
        }
    }

    // Perform a single search
    async function performSearch() {
        if (!isRunning) return;

        const elements = findSearchElements();

        if (!elements || !elements.searchBox) {
            console.log('Search elements not found, retrying...');
            await sleep(CONFIG.RETRY_DELAY);
            if (isRunning) {
                performSearch();
            }
            return;
        }

        const { searchBox, searchForm } = elements;
        const word = getRandomWord();

        console.log(`Searching for: ${word}`);
        updateUI();

        // Simulate typing
        await simulateTyping(searchBox, word);

        if (!isRunning) return;

        // Submit the search
        submitSearch(searchForm, searchBox);

        // Schedule next search
        if (isRunning) {
            const delay = CONFIG.MIN_SEARCH_DELAY + Math.random() * (CONFIG.MAX_SEARCH_DELAY - CONFIG.MIN_SEARCH_DELAY);
            console.log(`Next search in ${Math.round(delay/1000)} seconds`);
            searchTimeout = setTimeout(() => {
                if (isRunning) {
                    performSearch();
                }
            }, delay);
        }
    }

    // Toggle search automation
    async function toggleSearch() {
        if (isRunning) {
            stopSearching();
        } else {
            await startSearching();
        }
    }

    // Start searching
    async function startSearching() {
        isRunning = true;
        updateUI();

        // Fetch words from GitHub on first start
        if (wordList.length === CONFIG.DEFAULT_WORDS.length) {
            const statusEl = document.getElementById('search-status');
            if (statusEl) {
                statusEl.textContent = 'Status: Loading words...';
            }
            await fetchWordsFromGitHub();
        }

        console.log('Starting automated searches...');
        performSearch();
    }

    // Stop searching
    function stopSearching() {
        isRunning = false;
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        updateUI();
        console.log('Stopped automated searches');
    }

    // Helper function for delays
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Initialize
    function init() {
        console.log('Bing Auto Search Bot initialized');

        // Wait for page to load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createUI);
        } else {
            createUI();
        }

        // Load words on init (but don't block)
        fetchWordsFromGitHub().then(() => {
            console.log('Initial word list loaded');
        });
    }

    // Start the script
    init();

})();

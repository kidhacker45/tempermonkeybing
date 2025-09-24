// ==UserScript==
// @name         Bing Auto Search with UI
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Automatically performs Bing searches with random words (from API or fallback), with UI control, realistic typing, and auto-update support.
// @match        https://www.bing.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/kidhacker45/tempermonkeybing/refs/heads/main/auto-sea.js
// @downloadURL  https://raw.githubusercontent.com/kidhacker45/tempermonkeybing/refs/heads/main/auto-sea.js
// ==/UserScript==

(function() {
    'use strict';

    // ==== CONFIG ====
    const apiUrl = "https://raw.githubusercontent.com/kidhacker45/tempermonkeybing/refs/heads/main/words.txt"; // Replace with your actual GitHub raw wordlist link
    const fallbackWords = ["apple", "banana", "carrot", "dog", "elephant"];
    let words = [];
    let running = false;

    // Load last word
    let lastWord = GM_getValue("lastWord", "");

    // === Utility ===
    function randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function pickRandomWord() {
        let word;
        do {
            word = words[Math.floor(Math.random() * words.length)];
        } while (word === lastWord && words.length > 1);
        lastWord = word;
        GM_setValue("lastWord", lastWord);
        return word;
    }

    // Fetch words from API
    function fetchWordList() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: apiUrl,
                onload: function(response) {
                    if (response.status === 200) {
                        const list = response.responseText.split(/\r?\n/).filter(Boolean);
                        if (list.length > 0) {
                            resolve(list);
                            return;
                        }
                    }
                    resolve(fallbackWords);
                },
                onerror: function() {
                    resolve(fallbackWords);
                }
            });
        });
    }

    // Simulate typing into search box
    async function typeAndSearch(word) {
        const input = document.querySelector("input[name='q'], #sb_form_q");
        const form = document.querySelector("form[name='f'], #sb_form");

        if (!input || !form) {
            console.log("Search box not found, retrying...");
            setTimeout(() => typeAndSearch(word), 1000);
            return;
        }

        input.value = "";
        for (let char of word) {
            input.value += char;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            await new Promise(r => setTimeout(r, randomDelay(80, 100)));
        }

        form.submit();
    }

    // Core loop
    async function searchLoop() {
        if (!running) return;
        const word = pickRandomWord();
        console.log("Searching for:", word);
        await typeAndSearch(word);

        const delay = randomDelay(5000, 10000); // 5–10 seconds
        console.log(`Next search in ${delay/1000} seconds...`);
        setTimeout(searchLoop, delay);
    }

    // === UI Panel ===
    function createUI() {
        const panel = document.createElement("div");
        panel.style.position = "fixed";
        panel.style.bottom = "20px";
        panel.style.right = "20px";
        panel.style.padding = "10px";
        panel.style.background = "rgba(0,0,0,0.7)";
        panel.style.color = "#fff";
        panel.style.borderRadius = "8px";
        panel.style.zIndex = "9999";
        panel.style.fontSize = "14px";

        const btn = document.createElement("button");
        btn.textContent = "Start";
        btn.style.padding = "5px 10px";
        btn.style.cursor = "pointer";

        btn.onclick = async () => {
            if (running) {
                running = false;
                btn.textContent = "Start";
                console.log("Stopped Bing automation.");
            } else {
                if (words.length === 0) {
                    words = await fetchWordList();
                }
                running = true;
                btn.textContent = "Stop";
                console.log("Started Bing automation.");
                searchLoop();
            }
        };

        panel.appendChild(btn);
        document.body.appendChild(panel);
    }

    // Init
    window.addEventListener("load", () => {
        createUI();
    });

})();

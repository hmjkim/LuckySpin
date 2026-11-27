/*
 * Lucky Spin – wheel drawing, spinning and recent-spins list.
 *
 * Everything runs in the browser, so the site is plain static files:
 *   1. Pick a winner with crypto.getRandomValues (fair, unbiased).
 *   2. Animate the wheel so it stops exactly on that segment.
 *   3. Show the winner and save it to this browser's recent spins.
 * The footer reads instance.json (written by the EC2 user data at boot)
 * to show which instance behind the load balancer served the page.
 */
(() => {
    'use strict';

    const MIN_NAMES = 2;
    const MAX_NAMES = 20;
    const MAX_NAME_LEN = 30;
    const HISTORY_SIZE = 10;
    const HISTORY_KEY = 'luckyspin.history';

    const SPIN_MS = 4000;          // animation length
    const EXTRA_TURNS = 5;         // full turns before stopping
    const POINTER = -Math.PI / 2;  // pointer is at 12 o'clock
    const TAU = Math.PI * 2;

    const COLORS = ['#ef476f', '#f78c6b', '#ffd166', '#06d6a0',
                    '#118ab2', '#7b5cff', '#f15bb5', '#00bbf9'];

    const canvas = document.getElementById('wheel');
    const ctx = canvas.getContext('2d');
    const namesInput = document.getElementById('names');
    const countEl = document.getElementById('name-count');
    const errorEl = document.getElementById('form-error');
    const spinBtn = document.getElementById('spin-btn');
    const historyList = document.getElementById('history-list');
    const historyEmpty = document.getElementById('history-empty');
    const clearBtn = document.getElementById('clear-history');
    const servedBy = document.getElementById('served-by');
    const modal = document.getElementById('winner-modal');
    const winnerName = document.getElementById('winner-name');
    const modalClose = document.getElementById('modal-close');

    let names = [];       // names currently on the wheel
    let rotation = 0;     // current wheel rotation in radians
    let spinning = false;

    // ---- Names ---------------------------------------------------------

    /** Names from the textarea: one per line, trimmed, blank lines ignored. */
    function parseNames() {
        return namesInput.value
            .split('\n')
            .map((n) => n.trim())
            .filter((n) => n !== '');
    }

    /** Returns an error message, or '' when the list is valid. */
    function validate(list) {
        if (list.length < MIN_NAMES) return `Enter at least ${MIN_NAMES} names.`;
        if (list.length > MAX_NAMES) return `You can enter at most ${MAX_NAMES} names.`;
        const tooLong = list.find((n) => [...n].length > MAX_NAME_LEN);
        if (tooLong) return `"${tooLong}" is longer than ${MAX_NAME_LEN} characters.`;
        return '';
    }

    function showError(message) {
        errorEl.textContent = message;
        errorEl.hidden = message === '';
    }

    function onNamesChanged() {
        names = parseNames();
        countEl.textContent = `${names.length} / ${MAX_NAMES}`;
        countEl.classList.toggle('bad', names.length < MIN_NAMES || names.length > MAX_NAMES);
        if (!errorEl.hidden) showError(validate(names));
        drawWheel();
    }

    // ---- Drawing -------------------------------------------------------

    function segmentColor(i, n) {
        // Avoid the first and last segment having the same color.
        if (n > 1 && i === n - 1 && i % COLORS.length === 0) return COLORS[2];
        return COLORS[i % COLORS.length];
    }

    /** Dark text on light colors, white text on dark colors. */
    function textColorFor(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#1f2937' : '#ffffff';
    }

    /** Shorten text with "…" so it fits within maxWidth pixels. */
    function fitText(text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        const chars = [...text];
        while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > maxWidth) {
            chars.pop();
        }
        return chars.join('') + '…';
    }

    /** Match the canvas resolution to its on-screen size (sharp on retina). */
    function resizeCanvas() {
        const size = canvas.clientWidth;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawWheel();
    }

    function drawWheel() {
        const size = canvas.clientWidth;
        const c = size / 2;              // center
        const radius = c - 10;
        const n = names.length;

        ctx.clearRect(0, 0, size, size);

        if (n === 0) {
            // Empty placeholder wheel.
            ctx.beginPath();
            ctx.arc(c, c, radius, 0, TAU);
            ctx.fillStyle = '#e5e7eb';
            ctx.fill();
        } else {
            const seg = TAU / n;
            const fontSize = Math.max(11, Math.min(size * 0.05, radius * seg * 0.4));

            for (let i = 0; i < n; i++) {
                const start = rotation + i * seg;
                const color = segmentColor(i, n);

                // Slice
                ctx.beginPath();
                ctx.moveTo(c, c);
                ctx.arc(c, c, radius, start, start + seg);
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.stroke();

                // Label, written along the middle of the slice
                ctx.save();
                ctx.translate(c, c);
                ctx.rotate(start + seg / 2);
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = textColorFor(color);
                ctx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
                ctx.fillText(fitText(names[i], radius * 0.68), radius - 18, 0);
                ctx.restore();
            }
        }

        // Outer rim
        ctx.beginPath();
        ctx.arc(c, c, radius, 0, TAU);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Center hub
        ctx.beginPath();
        ctx.arc(c, c, radius * 0.11, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(c, c, radius * 0.06, 0, TAU);
        ctx.fillStyle = '#312e81';
        ctx.fill();

        // Pointer at the top (does not rotate)
        const w = Math.max(14, size * 0.035);
        ctx.beginPath();
        ctx.moveTo(c - w, 2);
        ctx.lineTo(c + w, 2);
        ctx.lineTo(c, w * 2.4);
        ctx.closePath();
        ctx.fillStyle = '#312e81';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    }

    // ---- Spinning ------------------------------------------------------

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    /** Animate the wheel so the pointer stops on segment `index`. */
    function animateTo(index) {
        const seg = TAU / names.length;
        // Land somewhere inside the segment (not always dead center).
        const jitter = (Math.random() - 0.5) * seg * 0.7;
        // Segment i covers [rotation + i*seg, rotation + (i+1)*seg],
        // so its middle is under the pointer when rotation = POINTER - (i + 0.5) * seg.
        const target = POINTER - (index + 0.5) * seg + jitter;

        const from = rotation;
        const delta = (((target - from) % TAU) + TAU) % TAU; // forward distance
        const to = from + delta + EXTRA_TURNS * TAU;
        const startTime = performance.now();

        return new Promise((resolve) => {
            function frame(now) {
                const t = Math.min(1, (now - startTime) / SPIN_MS);
                rotation = from + (to - from) * easeOutCubic(t);
                drawWheel();
                if (t < 1) {
                    requestAnimationFrame(frame);
                } else {
                    rotation = to % TAU; // keep the number small
                    resolve();
                }
            }
            requestAnimationFrame(frame);
        });
    }

    /** Unbiased random integer in [0, max), using the browser's secure RNG. */
    function randomIndex(max) {
        const limit = Math.floor(0x100000000 / max) * max; // reject the uneven tail
        const buf = new Uint32Array(1);
        do {
            crypto.getRandomValues(buf);
        } while (buf[0] >= limit);
        return buf[0] % max;
    }

    function setBusy(busy) {
        spinning = busy;
        spinBtn.disabled = busy;
        namesInput.disabled = busy;
        spinBtn.textContent = busy ? 'SPINNING…' : 'SPIN';
    }

    async function spin() {
        if (spinning) return;

        const list = parseNames();
        const error = validate(list);
        showError(error);
        if (error) return;

        names = list;
        setBusy(true);

        const index = randomIndex(list.length);
        await animateTo(index);
        showWinner(list[index]);
        addToHistory({ winner: list[index], options_count: list.length, created_at: new Date().toISOString() });
        setBusy(false);
    }

    // ---- Winner popup --------------------------------------------------

    function showWinner(name) {
        winnerName.textContent = name;
        modal.hidden = false;
        modalClose.focus();
    }

    function closeWinner() {
        modal.hidden = true;
        spinBtn.focus();
    }

    // ---- Recent spins (localStorage, this browser only) ----------------

    // Storage can be blocked (private mode, strict settings), so every
    // access is wrapped and the page still works without it.
    function loadHistory() {
        try {
            const data = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            return Array.isArray(data) ? data.slice(0, HISTORY_SIZE) : [];
        } catch (err) {
            return [];
        }
    }

    let history = loadHistory();

    function saveHistory() {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch (err) {
            // Not saved, but the list still shows for this visit.
        }
    }

    function addToHistory(spin) {
        history = [spin, ...history].slice(0, HISTORY_SIZE);
        saveHistory();
        renderHistory();
    }

    function clearHistory() {
        history = [];
        saveHistory();
        renderHistory();
    }

    function formatTime(iso) {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '';
        const sameDay = date.toDateString() === new Date().toDateString();
        return sameDay
            ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
            : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    /** Build the list with textContent only, so names can never inject HTML. */
    function renderHistory() {
        historyList.replaceChildren();
        for (const spin of history) {
            const li = document.createElement('li');

            const winner = document.createElement('span');
            winner.className = 'winner';
            winner.textContent = String(spin.winner);

            const meta = document.createElement('span');
            meta.className = 'meta';
            meta.textContent = `${Number(spin.options_count)} options · ${formatTime(spin.created_at)}`;

            li.append(winner, meta);
            historyList.appendChild(li);
        }
        historyEmpty.hidden = history.length > 0;
        clearBtn.hidden = history.length === 0;
    }

    // ---- Which instance served this page --------------------------------

    function codeEl(text) {
        const el = document.createElement('code');
        el.textContent = text;
        return el;
    }

    /** instance.json only exists on EC2, so locally the footer stays "local". */
    async function loadInstance() {
        try {
            const res = await fetch('instance.json', { cache: 'no-store' });
            if (!res.ok) return;
            const info = await res.json();
            if (!info || typeof info.id !== 'string') return;
            servedBy.replaceChildren(codeEl(info.id), ' in ', codeEl(String(info.az || 'unknown')));
        } catch (err) {
            // Keep "local".
        }
    }

    // ---- Wire everything up -------------------------------------------

    namesInput.addEventListener('input', onNamesChanged);
    spinBtn.addEventListener('click', spin);
    clearBtn.addEventListener('click', clearHistory);
    modalClose.addEventListener('click', closeWinner);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeWinner(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) closeWinner();
    });
    window.addEventListener('resize', resizeCanvas);

    onNamesChanged();
    resizeCanvas();
    renderHistory();
    loadInstance();
})();

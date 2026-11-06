/*hello*/

"use strict";

/* ==========================================================
   SETTINGS - change these to personalise the page
   ========================================================== */
const CONFIG = {
    messages: [
        { text: "My Beautiful Sister 💞", style: "title" },
        { text: "Happy Birthday 🎈", style: "heading" },
        { text: "May Allah bless you with endless joy, good health and a heart full of peace. 🍀", style: "wish" },
        { text: "You make every day brighter just by being you. 💕", style: "wish" },
        { text: "Hope today is as wonderful as you are. ❤️😘", style: "closing" },
    ],
    // Optional signature shown at the end, e.g. "Your brother". Leave empty to hide it.
    from: "",
    // The clock counts up from this date (use any date you like)
    startDate: "2025-04-07T00:00:00",
    bloomCount: 700,   // number of hearts on the tree
    typeSpeed: 70,     // ms per typed character
};

/* ==========================================================
   Constants
   ========================================================== */
const W = 1100;
const H = 680;
const TRUNK_COLOR = "rgb(35, 31, 32)";
const SEED_COLOR = "rgb(190, 26, 37)";
const BLOOM_COLORS = ["#ff4d6d", "#ff758f", "#ff8fa3", "#ffb3c1", "#e5383b", "#c9184a", "#ff6b9d"];

// Each branch: [startX, startY, controlX, controlY, endX, endY, radius, frames, children?]
const BRANCH_DATA = [
    [535, 680, 570, 250, 500, 200, 30, 100, [
        [540, 500, 455, 417, 340, 400, 13, 100, [
            [450, 435, 434, 430, 394, 395, 2, 40],
        ]],
        [550, 445, 600, 356, 680, 345, 12, 100, [
            [578, 400, 648, 409, 661, 426, 3, 80],
        ]],
        [539, 281, 537, 248, 534, 217, 3, 40],
        [546, 397, 413, 247, 328, 244, 9, 80, [
            [427, 286, 383, 253, 371, 205, 2, 40],
            [498, 345, 435, 315, 395, 330, 4, 60],
        ]],
        [546, 357, 608, 252, 678, 221, 6, 100, [
            [590, 293, 646, 277, 648, 271, 2, 80],
        ]],
    ]],
];

/* ==========================================================
   Elements & canvas setup
   ========================================================== */
const scene = document.getElementById("scene");
const canvas = document.getElementById("canvas");
const hint = document.getElementById("hint");
const linesEl = document.getElementById("lines");
const clockEl = document.getElementById("clock");
const audio = document.getElementById("myAudio");

const dpr = Math.min(window.devicePixelRatio || 1, 2);

function makeCanvas() {
    const c = document.createElement("canvas");
    c.width = W * dpr;
    c.height = H * dpr;
    const x = c.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
}

canvas.width = W * dpr;
canvas.height = H * dpr;
const ctx = canvas.getContext("2d");
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

// Off-screen layer that keeps the drawn trunk and branches
const treeLayer = makeCanvas();
const tctx = treeLayer.getContext("2d");
tctx.setTransform(dpr, 0, 0, dpr, 0, 0);

/* ==========================================================
   Helpers
   ========================================================== */
const rand = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Heart shape (unit size, centred around 0,0)
const HEART = (() => {
    const p = new Path2D();
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        if (i === 0) p.moveTo(x / 16, y / 16);
        else p.lineTo(x / 16, y / 16);
    }
    p.closePath();
    return p;
})();

function drawHeart(c, x, y, size, color, rotation = 0) {
    c.save();
    c.translate(x, y);
    c.rotate(rotation);
    c.scale(size, size);
    c.fillStyle = color;
    c.fill(HEART);
    c.restore();
}

function quadPoint(b, t) {
    const u = 1 - t;
    return {
        x: u * u * b.x0 + 2 * u * t * b.cx + t * t * b.x1,
        y: u * u * b.y0 + 2 * u * t * b.cy + t * t * b.y1,
    };
}

/* ==========================================================
   Branches
   ========================================================== */
const branches = [];

function buildBranches(list, parent = null) {
    for (const d of list) {
        const [x0, y0, cx, cy, x1, y1, r, len, kids] = d;
        const b = { x0, y0, cx, cy, x1, y1, r, len, parent, progress: 0, done: false, attachT: 0 };

        if (parent) {
            // Find where on the parent's curve this branch starts
            let best = Infinity;
            for (let i = 0; i <= 200; i++) {
                const t = i / 200;
                const p = quadPoint(parent, t);
                const dist = (p.x - x0) ** 2 + (p.y - y0) ** 2;
                if (dist < best) {
                    best = dist;
                    b.attachT = t;
                }
            }
        }

        branches.push(b);
        if (kids) buildBranches(kids, b);
    }
}
buildBranches(BRANCH_DATA);

function growBranch(b) {
    const prev = b.progress;
    b.progress = Math.min(1, prev + 1 / b.len);
    const sub = 4;
    for (let k = 1; k <= sub; k++) {
        const t = prev + ((b.progress - prev) * k) / sub;
        const p = quadPoint(b, t);
        const radius = Math.max(0.8, b.r * (1 - t));
        tctx.fillStyle = TRUNK_COLOR;
        tctx.beginPath();
        tctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        tctx.fill();
    }
    if (b.progress >= 1) b.done = true;
}

/* ==========================================================
   Blooms (hearts on the tree)
   ========================================================== */
const blooms = [];

function createBlooms() {
    const cx = 540, cy = 330, hw = 260, hh = 185;
    while (blooms.length < CONFIG.bloomCount) {
        const x = rand(cx - hw * 1.2, cx + hw * 1.2);
        const y = rand(cy - hh * 1.4, cy + hh * 1.1);
        const u = (x - cx) / hw;
        const v = (cy - y) / hh;
        // Heart-shaped area test
        if ((u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0) {
            blooms.push({
                x, y,
                size: rand(5, 11),
                color: BLOOM_COLORS[Math.floor(Math.random() * BLOOM_COLORS.length)],
                rot: rand(-0.5, 0.5),
                s: 0,
            });
        }
    }
}
createBlooms();

let bloomIndex = 0;
const petals = [];

/* ==========================================================
   Seed & ground
   ========================================================== */
const seed = { x: 535, y: 300, scale: 2, pulse: 0, vy: 0 };
const SEED_SIZE = 12;
let groundWidth = 0;

function seedHit(px, py) {
    const r = SEED_SIZE * seed.scale * 1.2;
    return Math.hypot(px - seed.x, py - (seed.y + 4)) <= r;
}

/* ==========================================================
   State machine
   ========================================================== */
let phase = "idle"; // idle -> shrink -> drop -> grow -> bloom -> done
let frame = 0;

function update() {
    frame++;

    switch (phase) {
        case "idle":
            seed.pulse = Math.sin(performance.now() / 300) * 0.06;
            break;

        case "shrink":
            seed.scale *= 0.95;
            if (seed.scale <= 0.7) {
                seed.scale = 0.7;
                phase = "drop";
            }
            break;

        case "drop":
            seed.vy += 0.35;
            seed.y += seed.vy;
            groundWidth = Math.min(1200, groundWidth + 10);
            if (seed.y >= H - 12) {
                seed.y = H - 12;
                phase = "grow";
            }
            break;

        case "grow": {
            groundWidth = Math.min(1200, groundWidth + 10);
            for (const b of branches) {
                if (b.done) continue;
                if (b.parent && b.parent.progress < b.attachT) continue;
                growBranch(b);
            }
            if (branches.every((b) => b.done)) phase = "bloom";
            break;
        }

        case "bloom":
            bloomIndex = Math.min(blooms.length, bloomIndex + 3);
            for (let i = 0; i < bloomIndex; i++) {
                if (blooms[i].s < 1) blooms[i].s = Math.min(1, blooms[i].s + 0.04);
            }
            if (blooms[blooms.length - 1].s >= 1) finish();
            break;

        case "done":
            if (frame % 6 === 0) spawnPetal();
            break;
    }

    // Falling petals
    for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i];
        p.x += p.vx + Math.sin((frame + p.seed) / 25) * 0.4;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > H - 8) petals.splice(i, 1);
    }
}

function spawnPetal() {
    const b = blooms[Math.floor(Math.random() * blooms.length)];
    petals.push({
        x: b.x, y: b.y,
        vx: rand(-0.3, 0.3),
        vy: rand(0.6, 1.4),
        rot: rand(0, Math.PI),
        vr: rand(-0.03, 0.03),
        size: rand(4, 8),
        color: b.color,
        seed: rand(0, 100),
    });
}

/* ==========================================================
   Rendering
   ========================================================== */
function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(treeLayer, 0, 0, W, H);

    // Ground line
    if (groundWidth > 0) {
        ctx.fillStyle = TRUNK_COLOR;
        ctx.fillRect(W / 2 - groundWidth / 2, H - 5, groundWidth, 5);
    }

    // Hearts on the tree
    for (let i = 0; i < bloomIndex; i++) {
        const b = blooms[i];
        if (b.s <= 0) continue;
        const ease = 1 - (1 - b.s) ** 3;
        drawHeart(ctx, b.x, b.y, b.size * ease, b.color, b.rot);
    }

    // Falling petals
    for (const p of petals) drawHeart(ctx, p.x, p.y, p.size, p.color, p.rot);

    // Seed
    if (phase === "idle" || phase === "shrink" || phase === "drop") {
        drawHeart(ctx, seed.x, seed.y, SEED_SIZE * (seed.scale + seed.pulse), SEED_COLOR);
    }
}

function loop() {
    update();
    render();
    requestAnimationFrame(loop);
}

/* ==========================================================
   Interaction
   ========================================================== */
function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: ((e.clientX - rect.left) * W) / rect.width,
        y: ((e.clientY - rect.top) * H) / rect.height,
    };
}

function playAudio() {
    if (!audio) return;
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
}

canvas.addEventListener("pointermove", (e) => {
    if (phase !== "idle") return;
    const p = canvasPoint(e);
    canvas.classList.toggle("hand", seedHit(p.x, p.y));
});

canvas.addEventListener("pointerdown", (e) => {
    if (phase !== "idle") return;
    const p = canvasPoint(e);
    if (!seedHit(p.x, p.y)) return;
    playAudio();
    hint.classList.add("hidden");
    canvas.classList.remove("hand");
    phase = "shrink";
});

/* ==========================================================
   Finish: message + clock
   ========================================================== */
function finish() {
    phase = "done";
    scene.classList.add("done");
    setTimeout(typeMessages, 900);
    startClock();
}

async function typeMessages() {
    const lines = [...CONFIG.messages];
    if (CONFIG.from) lines.push({ text: "— " + CONFIG.from, style: "from" });

    // Build every line up front (full text kept invisible) so the layout never jumps while typing
    const items = lines.map(({ text, style }) => {
        const el = document.createElement("div");
        el.className = "say " + style;

        const typed = document.createElement("span");
        const caret = document.createElement("span");
        caret.className = "caret";
        const rest = document.createElement("span");
        rest.className = "rest";
        rest.textContent = text;

        el.append(typed, caret, rest);
        linesEl.appendChild(el);
        return { el, typed, rest, chars: Array.from(text) };
    });

    for (const it of items) {
        it.el.classList.add("typing");
        let out = "";
        for (let i = 0; i < it.chars.length; i++) {
            out += it.chars[i];
            it.typed.textContent = out;
            it.rest.textContent = it.chars.slice(i + 1).join("");
            await sleep(CONFIG.typeSpeed);
        }
        it.el.classList.remove("typing");
        it.el.classList.add("typed");
        await sleep(350);
    }
}

function startClock() {
    const start = new Date(CONFIG.startDate).getTime();
    if (Number.isNaN(start)) return;

    const tick = () => {
        let s = Math.floor(Math.abs(Date.now() - start) / 1000);
        const d = Math.floor(s / 86400); s %= 86400;
        const h = Math.floor(s / 3600);  s %= 3600;
        const m = Math.floor(s / 60);
        s %= 60;
        clockEl.textContent = `${d} days ${h} hours ${m} minutes ${s} seconds`;
    };
    tick();
    setInterval(tick, 1000);
}

/* ==========================================================
   Go
   ========================================================== */
requestAnimationFrame(loop);
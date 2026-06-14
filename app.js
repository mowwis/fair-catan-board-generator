const CONFIG = {
    landPool: { desert: 1, brick: 3, ore: 3, grain: 4, wool: 4, lumber: 4 },
    tokens: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
    ports: ['brick', 'lumber', 'ore', 'grain', 'wool'],
    getProb: (n) => (n && n !== 7) ? (6 - Math.abs(7 - n)) / 36 * 100 : 0
};

const RULE_SETTINGS = [
    {
        id: "des_wat",
        name: "No Desert by Water",
        enabled: false,
        min: 0,
        max: 1,
        weight: 3,
        fn: (b) => b.land.some(t => t.res === 'desert' && b.getN(t).some(n => n.isWater)) ? 1 : 0
    },
    {
        id: "same_tok_same_res",
        name: "No Same Numbers on Same Resource (incl. 6/8)",
        enabled: true,
        min: 0,
        max: 6,
        weight: 2,
        fn: (b) => b.land.reduce((sum, t) => sum + (t.tok === 7 ? 0 : b.land.filter(o => o.id < t.id && o.res === t.res && (o.tok === t.tok || ((o.tok === 6 || o.tok === 8) && (t.tok === 6 || t.tok === 8)))).length), 0)
    },
    {
        id: "max_res",
        name: "Max Same Resources at Intersection",
        enabled: true,
        min: 0,
        max: 20,
        weight: 1,
        params: { maxAllowed: 1 },
        fn: (b, params) => b.intersections.reduce((sum, inter) => {
            const resList = inter.filter(t => !t.isWater && t.res !== 'desert').map(t => t.res);
            return sum + Math.max(0, resList.filter((res, i) => resList.indexOf(res) !== i).length - (params.maxAllowed - 1));
        }, 0)
    },
    {
        id: "dist_same_tok",
        name: "Maximize Distance of Same Numbers (incl. 6/8)",
        enabled: true,
        min: 0,
        max: 16,
        weight: 3,
        fn: (b) => b.land.reduce((sum, t) => {
            const isRed = (tok) => tok === 6 || tok === 8;
            if (t.tok === 7) return sum;
            const matches = b.land.filter(o => o.id < t.id && o.tok !== 7 && (o.tok === t.tok || (isRed(t.tok) && isRed(o.tok))));
            return sum + matches.reduce((p, o) => {
                const d = (Math.abs(t.q - o.q) + Math.abs(t.r - o.r) + Math.abs(t.s - o.s)) / 2;
                const mult = isRed(t.tok) && isRed(o.tok) ? (t.tok === o.tok ? 5 : 3) : 1;
                return p + (mult / (d * d));
            }, 0);
        }, 0)
    },
    {
        id: "adjacent_tok",
        name: "No Same Numbers Adjacent (incl. 6/8)",
        enabled: false,
        min: 0,
        max: 8,
        weight: 3,
        fn: (b) => b.land.reduce((sum, t) => sum + (t.tok === 7 ? 0 : b.getLandN(t).filter(n => n.id < t.id && (n.tok === t.tok || ((n.tok === 6 || n.tok === 8) && (t.tok === 6 || t.tok === 8)))).length), 0)
    },
    {
        id: "tok_lumber_brick",
        name: "No Same Numbers on Lumber and Brick",
        enabled: true,
        min: 0,
        max: 2,
        weight: 1,
        fn: (b) => b.land.filter(t => t.res === 'lumber' && t.tok !== 7).reduce((sum, l) => sum + b.land.filter(o => o.res === 'brick' && o.tok === l.tok).length, 0)
    },
    {
        id: "global_res_balance",
        name: "Global Resource Balance",
        enabled: true,
        min: 0,
        max: 500,
        weight: 1,
        fn: (b) => {
            const yields = Object.values(b.getYields());
            const avg = yields.reduce((a, b) => a + b, 0) / yields.length;
            return yields.reduce((sum, y) => sum + Math.pow(y - avg, 2), 0);
        }
    },
    {
        id: "fair_inter",
        name: "Intersection Fairness",
        enabled: true,
        min: 0,
        max: 150000,
        weight: 3,
        fn: (b) => {
            const weights = { 3: 100, 2: 50, 1: 20 }, groups = { 3: [], 2: [], 1: [] };
            b.intersections.forEach(inter => {
                const landCount = inter.filter(t => !t.isWater).length;
                if (landCount === 0) return;
                groups[landCount].push(inter.reduce((s, t) => s + ((t.isWater || t.tok === 7) ? 0 : CONFIG.getProb(t.tok)), 0));
            });
            return Object.entries(groups).reduce((total, [count, list]) => {
                if (!list.length) return total;
                const avg = list.reduce((a, b) => a + b, 0) / list.length;
                return total + list.reduce((s, p) => s + Math.pow(p - avg, 2), 0) * weights[count];
            }, 0);
        }
    },
];

const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

class CatanBoard {
    constructor() {
        this.tiles = [];
        this.intersections = [];
        this._buildGrid();
        this.land = this.tiles.filter(t => !t.isWater);
        this.generatePorts();
        this._buildIntersections();
    }

    _buildGrid() {
        let id = 0;
        for (let q = -3; q <= 3; q++) {
            const rMin = Math.max(-3, -3 - q), rMax = Math.min(3, 3 - q);
            for (let r = rMin; r <= rMax; r++) {
                const s = -q - r;
                this.tiles.push({
                    id: id++, q, r, s,
                    isWater: Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === 3
                });
            }
        }
        this.tiles.sort((a, b) => (a.r + a.q / 2) - (b.r + b.q / 2) || a.q - b.q);
    }

    _buildIntersections() {
        const map = new Map();
        this.tiles.forEach(t1 => {
            const neighbors = this.getN(t1);
            neighbors.forEach(t2 => {
                neighbors.forEach(t3 => {
                    if (t2.id < t3.id && this.getN(t2).includes(t3)) {
                        const key = [t1.id, t2.id, t3.id].sort((a, b) => a - b).join('|');
                        map.set(key, [t1, t2, t3]);
                    }
                });
            });
        });

        const score = (arr) => arr.reduce((s, t) => s + (t.r + t.q / 2), 0);
        const qScore = (arr) => arr.reduce((s, t) => s + t.q, 0);
        this.intersections = Array.from(map.values()).sort((a, b) => score(a) - score(b) || qScore(a) - qScore(b));
    }

    generatePorts() {
        const water = this.tiles.filter(t => t.isWater).sort((a, b) => Math.atan2(a.r, a.q) - Math.atan2(b.r, b.q));
        const ports = shuffle([...CONFIG.ports]);
        water.forEach((t, i) => i % 2 === 0 && (t.port = (i / 2) % 2 === 0 ? ports.pop() : '3:1'));
    }

    getN(t) { return this.tiles.filter(o => (Math.abs(t.q - o.q) + Math.abs(t.r - o.r) + Math.abs(t.s - o.s)) === 2); }
    getLandN(t) { return this.getN(t).filter(n => !n.isWater); }
    getIntersectionProbs() { return this.intersections.map(inter => inter.reduce((sum, t) => sum + CONFIG.getProb(t.tok), 0)); }

    getYields() {
        const yields = Object.fromEntries(Object.keys(CONFIG.landPool).filter(k => k !== 'desert').map(k => [k, 0]));
        this.land.forEach(t => { if (t.res !== 'desert') yields[t.res] += CONFIG.getProb(t.tok); });
        return yields;
    }
}

class IterativeOptimizer {
    _state(b) { return b.land.map(t => ({ res: t.res, tok: t.tok })); }

    _score(b, activeRules, prioritySum) {
        if (prioritySum === 0) return 0;
        return activeRules.reduce((sum, rule) => {
            const min = rule.min || 0, max = rule.max || 1;
            let normalizedLoss = (rule.fn(b, rule.params) - min) / ((max - min) || 1);
            normalizedLoss = Math.max(0, Math.min(1.5, normalizedLoss));
            const scaledWeight = (rule.weight / prioritySum) * 1000;
            return sum + (normalizedLoss * scaledWeight);
        }, 0);
    }

    _swap(t1, t2, mode, b) {
        [t1[mode], t2[mode]] = [t2[mode], t1[mode]];
        const s = b.land.find(t => t.tok === 7);
        const d = b.land.find(t => t.res === 'desert');
        if (d.tok !== 7) [d.tok, s.tok] = [7, d.tok];
    }

    _initBoard(b) {
        const res = shuffle(Object.entries(CONFIG.landPool).flatMap(([k, c]) => Array(c).fill(k)));
        const toks = shuffle([...CONFIG.tokens]);
        let tIdx = 0;
        b.land.forEach((t, i) => {
            t.res = res[i];
            t.tok = (t.res === 'desert') ? 7 : toks[tIdx++];
        });
    }

    optimize(b, maxIterations = 50000, startTemp = 150, coolingRate = 0.9993, patienceThreshold = 8000) {
        b.generatePorts();
        this._initBoard(b);

        const activeRules = RULE_SETTINGS.filter(r => r.enabled);
        const prioritySum = activeRules.reduce((sum, r) => sum + r.weight, 0);

        let temp = startTemp;
        let current = this._score(b, activeRules, prioritySum);
        let best = current;
        let bestState = this._state(b);
        let noImprovement = 0, actualIterations = 0;
        const lossHistory = [];

        for (let i = 0; i < maxIterations; i++) {
            actualIterations = i;
            const A = b.land[Math.floor(Math.random() * b.land.length)];
            const B = b.land[Math.floor(Math.random() * b.land.length)];
            if (A === B) continue;

            const mode = Math.random() < 0.5 ? 'res' : 'tok';
            this._swap(A, B, mode, b);
            const next = this._score(b, activeRules, prioritySum);

            if (next < current || Math.random() < Math.exp((current - next) / temp)) {
                current = next;
                if (current < best) {
                    best = current;
                    bestState = this._state(b);
                    noImprovement = 0;
                } else noImprovement++;
            } else {
                this._swap(A, B, mode, b);
                noImprovement++;
            }

            temp *= coolingRate;
            lossHistory.push({ iteration: i, loss: current, best, temp });
            if (best === 0 || noImprovement > patienceThreshold) break;
        }

        b.land.forEach((t, i) => { t.res = bestState[i].res; t.tok = bestState[i].tok; });
        return { lossHistory, finalScore: best, iterationsUsed: actualIterations };
    }
}

class CatanUIRenderer {
    render(board) {
        const boardEl = document.getElementById('board');
        const overlayEl = document.getElementById('overlay');
        boardEl.innerHTML = overlayEl.innerHTML = '';

        let idx = 0;
        [1, 2, 3, 4, 3, 4, 3, 4, 3, 4, 3, 2, 1].forEach(len => {
            const rowEl = document.createElement('div');
            rowEl.className = 'row flex flex--center';

            for (let i = 0; i < len; i++) {
                const tile = board.tiles[idx++];
                const clone = document.getElementById('tile-template').content.cloneNode(true);
                const div = clone.querySelector('.tile');
                const tokEl = clone.querySelector('.token');

                div.classList.add(tile.res || 'water');
                if (tile.isWater) {
                    if (tile.port) {
                        div.classList.add(tile.port);
                        tokEl.outerHTML = `<span class="label">${tile.port.includes('3:1') ? '3:1' : '2:1'}</span>`
                    };
                } else {
                    div.classList.add(`t${tile.tok}`);
                    tokEl.textContent = tile.tok;
                    const prob = tile.res != 'desert' ? CONFIG.getProb(tile.tok).toFixed(1) : 16.6
                    div.setAttribute('data-prob', `${tile.res.charAt(0).toUpperCase() + tile.res.slice(1)}: ${prob}%`);
                }
                rowEl.appendChild(clone);
            }
            boardEl.appendChild(rowEl);
        });

        const yields = board.getYields();
        const yieldsValues = Object.values(yields);
        const yieldsAvg = yieldsValues.reduce((a, b) => a + b, 0) / (yieldsValues.length || 1);
        Object.entries(yields).forEach(([k, v]) => {
            const el = document.querySelector(`#stats .${k}`);
            el.textContent = v.toFixed(0);
            el.style.color = this._getColor(v, yieldsAvg, 8);
        });

        const interValues = board.intersections.map(inter => inter ? inter.reduce((s, t) => s + CONFIG.getProb(t.tok), 0) : 0);
        const interAvg = interValues.reduce((a, b) => a + b, 0) / (interValues.length || 1);

        let vIdx = 0;
        [2, 4, 6, 6, 6, 6, 6, 6, 6, 4, 2].forEach(count => {
            const rEl = document.createElement('div');
            rEl.className = 'row flex flex--center';
            for (let i = 0; i < count; i++) {
                const pEl = document.createElement('div');
                pEl.className = 'point flex flex--center';
                const probSum = interValues[vIdx++];
                pEl.textContent = probSum.toFixed(0);
                pEl.style.background = this._getColor(probSum, interAvg, 5);
                rEl.appendChild(pEl);
            }
            overlayEl.appendChild(rEl);
        });
    }

    buildSettingsMenu() {
        const settingsMenu = document.getElementById("settings-menu");
        const container = settingsMenu.querySelector(".content");

        container.innerHTML = RULE_SETTINGS.map(rule => `
            <div class="flex items--center" data-id="${rule.id}">
                <label class="checkbox">
                    <input type="checkbox" class="rule-toggle" ${rule.enabled ? 'checked' : ''}>
                    <span></span>
                    ${rule.name}
                </label>
                <div class="settings-params flex">
                    ${Object.entries(rule.params || {}).map(([key, val]) => `
                        <input type="number" class="rule-param" data-key="${key}" value="${val}" min="1" max="3">
                    `).join('')}
                </div>
            </div>
        `).join('');

        container.onchange = (e) => {
            const item = e.target.closest("[data-id]");
            const rule = RULE_SETTINGS.find(r => r.id === item.dataset.id);
            settingsMenu.hasChanges = true;

            if (e.target.classList.contains("rule-toggle")) {
                rule.enabled = e.target.checked;
            } else if (e.target.classList.contains("rule-param")) {
                rule.params[e.target.dataset.key] = parseInt(e.target.value) || 1;
            }
        };
    };

    _getColor(value, target, factor = 12) {
        const hue = Math.max(0, Math.min(120, 60 + (value - target) * factor));
        return `hsl(${hue}, 90%, 45%)`;
    };
}

// let activeChart = null;
// function plotLoss(history) {
//     const canvas = document.getElementById('lossChart');
//     const bestLosses = history.map(h => h.best);
//     const currentLosses = history.map(h => h.loss);
//     if (!activeChart) {
//         activeChart = new Chart(canvas, {
//             type: 'line',
//             data: {
//                 labels: history.map(h => h.iteration),
//                 datasets: [
//                     { data: currentLosses, borderColor: 'rgb(239, 68, 68)', borderWidth: 1, pointRadius: 0, fill: false },
//                     { data: bestLosses, borderColor: '#0284c7', borderWidth: 3, pointRadius: 0, fill: false }
//                 ]
//             },
//             options: {
//                 responsive: true,
//                 maintainAspectRatio: false,
//                 scales: { x: { display: false }, y: { beginAtZero: true } },
//                 plugins: { legend: { display: false } }
//             }
//         });
//     } else {
//         activeChart.data.labels = history.map(h => h.iteration);
//         activeChart.data.datasets[0].data = currentLosses;
//         activeChart.data.datasets[1].data = bestLosses;
//         activeChart.update();
//     }
//     const first = history[0], last = history[history.length - 1];
//     document.getElementById('loss-info').innerHTML =
//         `Start-Loss: <span style="color:#ef4444">${first.loss.toFixed(0)}</span> | ` +
//         `End-Best-Loss: <span style="color:#0284c7">${last.best.toFixed(0)}</span>`;
// }

document.addEventListener("DOMContentLoaded", () => {
    const board = new CatanBoard()
    const renderer = new CatanUIRenderer();
    const optimizer = new IterativeOptimizer()

    const dice = document.getElementById("dice");
    const boardEl = document.getElementById("board");
    const statsBtn = document.getElementById("toggle-stats");
    const wrapperEl = document.getElementById('board-wrapper');
    const settingsMenu = document.getElementById("settings-menu");

    const handleGeneration = () => {
        wrapperEl.classList.add('loading');
        boardEl.removeAttribute('data-roll-val');
        setTimeout(() => {
            const result = optimizer.optimize(board);
            renderer.render(board);
            // plotLoss(result.lossHistory);
            wrapperEl.classList.remove('loading');
        }, 0);
    };

    document.getElementById('trigger').onclick = handleGeneration;
    document.getElementById("dice-reset").onclick = (e) => {
        e.stopPropagation();
        boardEl.removeAttribute('data-roll-val');
    };

    statsBtn.onclick = () => {
        statsBtn.classList.toggle('btn--primary');
        wrapperEl.classList.toggle('hide-stats');
    };

    settingsMenu.onclick = (e) => { if (e.target === settingsMenu) settingsMenu.close(); };
    settingsMenu.onclose = () => { if (settingsMenu.hasChanges) handleGeneration(); };
    document.getElementById("toggle-settings").onclick = () => {
        settingsMenu.hasChanges = false;
        settingsMenu.showModal();
    };

    dice.onclick = () => {
        let total = 0;
        dice.querySelectorAll("div").forEach(die => {
            die.classList.remove("rolling");
            void die.offsetWidth;
            const roll = Math.floor(Math.random() * 6) + 1;
            total += roll;
            die.className = `d${roll} rolling`;
        });
        boardEl.dataset.rollVal = total;
    };

    renderer.buildSettingsMenu();
    handleGeneration();
});
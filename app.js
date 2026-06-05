const CONFIG = {
    landPool: { desert: 1, brick: 3, ore: 3, grain: 4, wool: 4, lumber: 4 },
    tokens: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
    ports: ['brick', 'lumber', 'ore', 'grain', 'wool'],
    getProb: (n) => (n && n !== 7) ? (6 - Math.abs(7 - n)) / 36 * 100 : 0
};

const RULES = [
    // 1. Keine Wüste an das Wasser
    b => {
        const d = b.land.find(t => t.res === 'desert');
        return (d && b.getN(d).some(n => n.isWater) ? 1 : 0) * 10000;
    },
    // 2. Maximal 2 gleiche Ressourcen nebeneinander
    b => b.land.reduce((sum, t) => sum + Math.max(0, b.getN(t).filter(n => n.res === t.res).length - 2), 0) * 8000,
    // 3. KEINE gleichen Zahlen nebeneinander (nicht nur rote Zahlen!)
    b => b.land.reduce((sum, t) => sum + b.getN(t).filter(n => n.tok === t.tok && t.tok !== 7).length, 0) * 12000,
    // 4. Gleiche Zahlen dürfen nicht auf derselben Ressourcen-Art liegen (z.B. keine zwei 5er auf Erz)
    b => {
        let penalty = 0;
        const seen = {};
        b.land.forEach(t => {
            if (t.tok === 7) return;
            if (!seen[t.res]) seen[t.res] = [];
            if (seen[t.res].includes(t.tok)) penalty++;
            seen[t.res].push(t.tok);
        });
        return penalty * 5000;
    },
    // 5. Die gleiche Zahl darf nicht gleichzeitig auf Holz (lumber) und Lehm (brick) liegen
    b => {
        const lumberTokens = b.land.filter(t => t.res === 'lumber').map(t => t.tok);
        const brickTokens = b.land.filter(t => t.res === 'brick').map(t => t.tok);
        return lumberTokens.filter(tok => tok !== 7 && brickTokens.includes(tok)).length * 1500;
    },
    // 6. Intersection Fairness (Kreuzungspunkte balancieren)
    b => {
        const probs = b.intersections.map(i => i.reduce((s, t) => s + CONFIG.getProb(t.tok), 0));
        const avg = probs.reduce((a, x) => a + x, 0) / probs.length;
        return probs.reduce((sum, p) => sum + Math.abs(p - avg), 0) * 15;
    },
    // 7. Globale Ressourcen-Balance (Gesamtwahrscheinlichkeit aller Rohstoffe angleichen)
    b => {
        const yields = { lumber: 0, wool: 0, grain: 0, ore: 0, brick: 0 };
        b.land.forEach(t => { if (t.res !== 'desert') yields[t.res] += CONFIG.getProb(t.tok); });
        const values = Object.values(yields);
        return (Math.max(...values) - Math.min(...values)) * 80;
    }
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
        let id = 0;
        for (let q = -3; q <= 3; q++) {
            for (let r = Math.max(-3, -3 - q); r <= Math.min(3, 3 - q); r++) {
                const s = -q - r
                this.tiles.push({
                    id: id++,
                    q, r, s,
                    isWater: Math.max(Math.abs(q),
                        Math.abs(r),
                        Math.abs(s)) === 3
                });
            }
        }

        this.tiles.sort((a, b) => (a.r + a.q / 2) - (b.r + b.q / 2) || a.q - b.q);
        this.land = this.tiles.filter(t => !t.isWater);

        this._generatePorts();
        this.intersections = this._buildIntersections();
    }

    getN(t) {
        return this.tiles.filter(o => (Math.abs(t.q - o.q) + Math.abs(t.r - o.r) + Math.abs(t.s - o.s)) === 2);
    }

    _generatePorts() {
        const water = this.tiles.filter(t => t.isWater).sort((a, b) => Math.atan2(a.r, a.q) - Math.atan2(b.r, b.q));
        const ports = shuffle([...CONFIG.ports]);

        water.forEach((t, i) => i % 2 === 0 && (t.port = (i / 2) % 2 === 0 ? ports.pop() : '3:1'));
    }

    _buildIntersections() {
        const map = new Map();
        this.tiles.forEach(t1 => {
            const n1 = this.getN(t1);
            n1.forEach(t2 => {
                n1.forEach(t3 => {
                    if (t2 !== t3 && this.getN(t2).includes(t3)) {
                        map.set([t1.id, t2.id, t3.id].sort((a, b) => a - b).join('|'), [t1, t2, t3]);
                    }
                });
            });
        });
        return Array.from(map.values()).sort((a, b) => (a.reduce((s, t) => s + (t.r + t.q / 2), 0) - b.reduce((s, t) => s + (t.r + t.q / 2), 0)) || (a.reduce((s, t) => s + t.q, 0) - b.reduce((s, t) => s + t.q, 0)));
    }
}

class IterativeOptimizer {
    _score(b) { return RULES.reduce((sum, rule) => sum + rule(b), 0); }
    _state(b) { return b.land.map(t => ({ res: t.res, tok: t.tok })); }
    _load(b, s) { b.land.forEach((t, i) => { t.res = s[i].res; t.tok = s[i].tok; }); }

    optimize(b) {
        b._generatePorts();
        const res = shuffle(Object.entries(CONFIG.landPool).flatMap(([k, c]) => Array(c).fill(k)));
        const toks = shuffle([...CONFIG.tokens]);

        let tIdx = 0;
        b.land.forEach((t, i) => { t.res = res[i]; t.tok = (t.res === 'desert') ? 7 : toks[tIdx++]; });

        let temp = 1500;
        let current = this._score(b);
        let bestState = this._state(b);
        let best = current;

        for (let i = 0; i < 40000; i++) {
            const backup = this._state(b);
            const A = b.land[Math.floor(Math.random() * b.land.length)];
            const B = b.land[Math.floor(Math.random() * b.land.length)];

            if (Math.random() < 0.5) [A.res, B.res] = [B.res, A.res];
            else[A.tok, B.tok] = [B.tok, A.tok];

            const s = b.land.find(t => t.tok === 7);
            const d = b.land.find(t => t.res === 'desert');
            if (d && d.tok !== 7 && s) [d.tok, s.tok] = [7, d.tok];

            const next = this._score(b);
            if (next < current || Math.random() < Math.exp((current - next) / temp)) {
                current = next;
                if (current < best) {
                    best = current;
                    bestState = this._state(b);
                }
            } else {
                this._load(b, backup);
            }
            temp *= 0.9992;
        }
        this._load(b, bestState);
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

        const stats = { lumber: 0, wool: 0, grain: 0, ore: 0, brick: 0 };
        board.land.filter(t => t.res !== 'desert').forEach(t => stats[t.res] += CONFIG.getProb(t.tok));
        const statsValues = Object.values(stats);
        const statsAvg = statsValues.reduce((a, b) => a + b, 0) / statsValues.length;
        Object.entries(stats).forEach(([k, v]) => {
            const el = document.querySelector(`#stats .${k}`);
            el.textContent = v.toFixed(0);
            el.style.color = this._getColor(v, statsAvg, 8);
        });

        const interValues = board.intersections.map(inter =>
            inter ? inter.reduce((s, t) => s + CONFIG.getProb(t.tok), 0) : 0
        );
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

    _getColor(value, target, factor = 12) {
        const hue = Math.max(0, Math.min(120, 60 + (value - target) * factor));
        return `hsl(${hue}, 90%, 45%)`;
    };
}

document.addEventListener("DOMContentLoaded", () => {
    const board = new CatanBoard()
    const renderer = new CatanUIRenderer();
    const optimizer = new IterativeOptimizer()
    const dice = document.getElementById("dice");
    const boardEl = document.getElementById("board");
    const statsBtn = document.getElementById("toggle-stats");
    const wrapperEl = document.getElementById('board-wrapper');

    const handleGeneration = () => {
        wrapperEl.classList.add('loading');
        boardEl.removeAttribute('data-roll-val');
        setTimeout(() => {
            optimizer.optimize(board);
            renderer.render(board);
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

    handleGeneration();
});
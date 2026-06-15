import { getProbability } from "../core/utils.js";

export class CatanUIRenderer {
    static TILE_ROW_PATTERN = [1, 2, 3, 4, 3, 4, 3, 4, 3, 4, 3, 2, 1];
    static INTERSECTION_ROW_PATTERN = [2, 4, 6, 6, 6, 6, 6, 6, 6, 4, 2];

    constructor() { this.activeChart = null; }

    render(board) {
        const boardEl = document.getElementById('board');
        const overlayEl = document.getElementById('overlay');
        boardEl.innerHTML = overlayEl.innerHTML = '';

        let idx = 0;
        CatanUIRenderer.TILE_ROW_PATTERN.forEach(len => {
            const rowEl = document.createElement('div');
            rowEl.className = 'row flex flex--center';

            for (let i = 0; i < len; i++) {
                const tile = board.grid.tiles[idx++];
                const state = board.states[tile.id];
                const clone = document.getElementById('tile-template').content.cloneNode(true);
                const div = clone.querySelector('.tile');
                const tokEl = clone.querySelector('.token');

                div.classList.add(state.res || 'water');
                if (tile.isWater && state.port) {
                    div.classList.add(state.port);
                    tokEl.outerHTML = `<span class="label">${state.port.includes('3:1') ? '3:1' : '2:1'}</span>`;
                } else if (!tile.isWater) {
                    div.classList.add(`t${state.tok}`);
                    tokEl.textContent = state.tok;
                    const p = state.res !== 'desert' ? getProbability(state.tok).toFixed(1) : 16.6;
                    div.setAttribute('data-prob', `${state.res.charAt(0).toUpperCase() + state.res.slice(1)}: ${p}%`);
                }
                rowEl.appendChild(clone);
            }
            boardEl.appendChild(rowEl);
        });
        this._renderStats(board, overlayEl);
    }

    _renderStats(board, overlayEl) {
        const yields = board.getYields();
        const values = Object.values(yields);
        const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
        Object.entries(yields).forEach(([k, v]) => {
            const el = document.querySelector(`#stats .${k}`);
            el.textContent = v.toFixed(0);
            el.style.color = this._getColor(v, avg, 8);
        });

        const probs = board.getIntersectionProbs();
        const pAvg = probs.reduce((a, b) => a + b, 0) / (probs.length || 1);
        let vIdx = 0;
        CatanUIRenderer.INTERSECTION_ROW_PATTERN.forEach(count => {
            const rEl = document.createElement('div');
            rEl.className = 'row flex flex--center';
            for (let i = 0; i < count; i++) {
                const pEl = document.createElement('div');
                pEl.className = 'point flex flex--center';
                const pSum = probs[vIdx++];
                pEl.textContent = pSum.toFixed(0);
                pEl.style.background = this._getColor(pSum, pAvg, 5);
                rEl.appendChild(pEl);
            }
            overlayEl.appendChild(rEl);
        });
    }

    buildSettingsMenu(bm, onConfigChanged) {
        const menu = document.getElementById("settings-menu").querySelector(".content");
        menu.innerHTML = bm.rules.map(r => `
            <div class="flex items--center" data-id="${r.id}">
                <label class="checkbox">
                    <input type="checkbox" class="rule-toggle" ${r.enabled ? 'checked' : ''}>
                    <span></span>
                    ${r.name}
                </label>
                <div class="settings-params flex">
                    ${Object.entries(r.params || {}).map(([k, v]) => `
                        <input type="number" class="rule-param" data-key="${k}" value="${v}" min="1" max="3">
                    `).join('')}
                </div>
            </div>
        `).join('');

        menu.onchange = (e) => {
            const r = bm.rules.find(rule => rule.id === e.target.closest("[data-id]").dataset.id);
            if (e.target.classList.contains("rule-toggle")) r.enabled = e.target.checked;
            else if (e.target.classList.contains("rule-param")) r.params[e.target.dataset.key] = parseInt(e.target.value) || 1;
            onConfigChanged();
        };
    }

    plotLoss(history) {
        const canvas = document.getElementById('lossChart');
        const bestLosses = history.map(h => h.best);
        const currentLosses = history.map(h => h.loss);

        if (!this.activeChart) {
            this.activeChart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: history.map(h => h.iteration),
                    datasets: [
                        { data: currentLosses, borderColor: 'rgb(239, 68, 68)', borderWidth: 1, pointRadius: 0, fill: false },
                        { data: bestLosses, borderColor: '#0284c7', borderWidth: 3, pointRadius: 0, fill: false }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { x: { display: false }, y: { beginAtZero: true } },
                    plugins: { legend: { display: false } }
                }
            });
        } else {
            this.activeChart.data.labels = history.map(h => h.iteration);
            this.activeChart.data.datasets[0].data = currentLosses;
            this.activeChart.data.datasets[1].data = bestLosses;
            this.activeChart.update();
        }

        const first = history[0];
        const last = history[history.length - 1];
        const infoEl = document.getElementById('loss-info');
        infoEl.innerHTML =
            `Start-Loss: <span style="color:#ef4444">${first.loss.toFixed(0)}</span> | ` +
            `End-Best-Loss: <span style="color:#0284c7">${last.best.toFixed(0)}</span>`;
    }

    _getColor(v, t, f = 12) { return `hsl(${Math.max(0, Math.min(120, 60 + (v - t) * f))}, 90%, 45%)`; }
}
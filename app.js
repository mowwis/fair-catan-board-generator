class HexCoord {
    constructor(q, r) {
        this.q = q;
        this.r = r;
        Object.freeze(this);
    }

    key() { return `${this.q},${this.r}`; }

    distanceFromCenter() {
        return (Math.abs(this.q) + Math.abs(this.q + this.r) + Math.abs(this.r)) / 2;
    }

    getNeighbors() {
        const directions = [[1, -1], [0, -1], [-1, 0], [-1, 1],,];
        return directions.map(([dq, dr]) => new HexCoord(this.q + dq, this.r + dr));
    }
}

class CatanBoard {
    constructor(config) {
        this.config = config;
        this.tiles = new Map();
    }

    clear() { this.tiles.clear(); }
    setTile(key, tileData) { this.tiles.set(key, tileData); }
    getTile(key) { return this.tiles.get(key); }
    getAllTiles() { return Array.from(this.tiles.values()); }
}

class CatanBoardGenerator {
    constructor(config) {
        this.config = config;
    }

    _shuffle(array) {
        return [...array].sort(() => Math.random() - 0.5);
    }

    /**
     * Main Generation Entry Point
     */
    generate(board) {
        const landCoords = this._getLandCoordinates();
        
        // Phase 1: Fast initial layout
        this._generateInitialLayout(board, landCoords);
        
        // Phase 2: Combined iterative optimization
        let optimized = false;
        for (let globalPass = 0; globalPass < 500; globalPass++) {
            if (this._optimizeTokensAndResources(board)) {
                optimized = true;
                break;
            }
            this._jiggleLayout(board);
        }

        if (!optimized) return false;

        this._injectOptimizedWaterRing(board);
        return true;
    }

    _generateInitialLayout(board, coords) {
        board.clear();
        const landPool = this._shuffle(Object.entries(this.config.land).flatMap(([key, s]) => Array(s.count).fill(key)));
        coords.forEach((coord, i) => {
            const resKey = landPool[i];
            board.setTile(coord.key(), { coord, resource: resKey, name: this.config.land[resKey].name, token: null });
        });
    }

    _jiggleLayout(board) {
        const tiles = board.getAllTiles().filter(t => t.resource !== 'wa');
        const t1 = tiles[Math.floor(Math.random() * tiles.length)];
        const t2 = tiles[Math.floor(Math.random() * tiles.length)];
        if (t1 !== t2) {
            const tempRes = t1.resource; const tempName = t1.name;
            t1.resource = t2.resource; t1.name = t2.name;
            t2.resource = tempRes; t2.name = tempName;
            
            // KORREKTUR: Tokens nach dem Jiggle resetten, damit sie neu ausgewürfelt werden
            t1.token = null;
            t2.token = null;
        }
    }

    _optimizeTokensAndResources(board) {
        const landTiles = board.getAllTiles();
        const maxRadius = Math.max(...landTiles.map(t => t.coord.distanceFromCenter()));

        // 1. STRUKTURELLE REPARATUR (NUR Ressourcen tauschen, KEINE Tokens mitwandern lassen)
        for (let pass = 0; pass < 200; pass++) {
            let layoutConflicts = false;

            for (const tile of landTiles) {
                const neighbors = tile.coord.getNeighbors().map(c => board.getTile(c.key())).filter(Boolean);
                const isOuterDesert = (tile.resource === 'de' && tile.coord.distanceFromCenter() === maxRadius);
                const isCluster = (tile.resource !== 'de' && neighbors.filter(n => n.resource === tile.resource).length >= 2);

                if (isOuterDesert || isCluster) {
                    layoutConflicts = true;
                    const target = landTiles[Math.floor(Math.random() * landTiles.length)];
                    
                    // KORREKTUR: Wir tauschen NUR die Ressourceneigenschaften, das Token bleibt starr auf der Koordinate!
                    const tempRes = tile.resource; const tempName = tile.name;
                    tile.resource = target.resource; tile.name = target.name;
                    target.resource = tempRes; target.name = tempName;
                }
            }
            if (!layoutConflicts) break;
        }

        // 2. INITIALE TOKEN-VERTEILUNG (NUR auf aktiven Feldern, Wüste bleibt leer)
        const activeTiles = landTiles.filter(t => this.config.land[t.resource].active !== false);
        const desertTiles = landTiles.filter(t => this.config.land[t.resource].active === false);
        
        // Wüste explizit leeren
        desertTiles.forEach(t => t.token = null);

        // Tokens frisch mischen und verteilen
        const shuffledTokens = this._shuffle(this.config.tokens);
        activeTiles.forEach((tile, i) => tile.token = shuffledTokens[i]);

        // 3. TOKEN REPARATUR (Greedy Swap nur auf aktiven Feldern)
        for (let pass = 0; pass < 600; pass++) {
            let tokenConflicts = false;

            for (const tile of activeTiles) {
                if (this._hasTokenConflict(tile, board)) {
                    tokenConflicts = true;
                    const targetTile = activeTiles[Math.floor(Math.random() * activeTiles.length)];
                    
                    const temp = tile.token;
                    tile.token = targetTile.token;
                    targetTile.token = temp;
                }
            }

            // Gegenkontrolle: Wüste darf niemals ein Token erhalten haben
            desertTiles.forEach(t => t.token = null);

            if (!tokenConflicts && this._validateGlobalVariance(board)) {
                return true; // Spielfeld ist perfekt
            }
        }
        return false;
    }

    _hasTokenConflict(tile, board) {
        const neighbors = tile.coord.getNeighbors().map(c => board.getTile(c.key())).filter(Boolean);
        const token = tile.token;

        if (!token) return false; // Keine Zahl = kein Konflikt

        if (neighbors.some(n => n.token === token)) return true;
        if ((token === 6 || token === 8) && neighbors.some(n => n.token === 6 || n.token === 8)) return true;

        if (token === 6 || token === 8) {
            const sameResourceTiles = board.getAllTiles().filter(t => t.resource === tile.resource && t !== tile);
            if (sameResourceTiles.some(t => t.token === 6 || t.token === 8)) return true;
        }

        const currentPips = this.config.pips[token];
        for (let j = 0; j < neighbors.length; j++) {
            for (let k = j + 1; k < neighbors.length; k++) {
                const n1 = neighbors[j], n2 = neighbors[k];
                if (n1.token && n2.token && n1.coord.getNeighbors().some(c => c.key() === n2.coord.key())) {
                    if ((currentPips + this.config.pips[n1.token] + this.config.pips[n2.token]) > 11) return true;
                }
            }
        }
        return false;
    }

    _validateGlobalVariance(board) {
        const weights = {};
        board.getAllTiles().forEach(t => {
            if (t.resource !== 'de' && t.resource !== 'wa') {
                weights[t.resource] = (weights[t.resource] || 0) + (this.config.pips[t.token] || 0);
            }
        });
        const values = Object.values(weights);
        return (Math.max(...values) - Math.min(...values)) <= 2;
    }

    _getLandCoordinates() {
        const landPool = Object.entries(this.config.land).flatMap(([key, s]) => Array(s.count).fill(key));
        const landRadius = Math.round((Math.sqrt(12 * landPool.length - 3) - 3) / 6);
        const landCoords = [];
        for (let q = -landRadius; q <= landRadius; q++) {
            for (let r = -landRadius; r <= landRadius; r++) {
                const coord = new HexCoord(q, r);
                if (coord.distanceFromCenter() <= landRadius) landCoords.push(coord);
            }
        }
        return landCoords;
    }

    _injectOptimizedWaterRing(board) {
        const landTiles = board.getAllTiles();
        const landRadius = Math.max(...landTiles.map(t => t.coord.distanceFromCenter()));
        const waterRadius = landRadius + 1;
        const waterCoords = [];

        for (let q = -waterRadius; q <= waterRadius; q++) {
            for (let r = -waterRadius; r <= waterRadius; r++) {
                const coord = new HexCoord(q, r);
                if (coord.distanceFromCenter() === waterRadius) waterCoords.push(coord);
            }
        }
        waterCoords.sort((a, b) => Math.atan2(a.r, a.q) - Math.atan2(b.r, b.q));

        const ports31 = this.config.ports.filter(p => p.startsWith('3:1'));
        const ports21 = this._shuffle(this.config.ports.filter(p => p.startsWith('2:1')));
        let idx31 = 0, idx21 = 0;

        waterCoords.forEach((coord, i) => {
            let label = '';
            if (i % 2 === 0) {
                if ((i / 2) % 2 === 0 && idx31 < ports31.length) label = ports31[idx31++];
                else if (idx21 < ports21.length) label = ports21[idx21++];
                else if (idx31 < ports31.length) label = ports31[idx31++];
            }
            board.setTile(coord.key(), { coord, resource: 'wa', name: 'Water', label: label, token: null });
        });
    }
}


// class CatanUIRenderer {
//     constructor(targetId) {
//         this.container = document.getElementById(targetId);
//     }

//     render(board) {
//         this.container.innerHTML = '';

//         const rows = {};
//         board.getAllTiles().forEach(tile => {
//             const rowIndex = tile.coord.r;
//             if (!rows[rowIndex]) rows[rowIndex] = [];
//             rows[rowIndex].push(tile);
//         });

//         Object.keys(rows).sort((a, b) => Number(a) - Number(b)).forEach(rowIndex => {
//             const rowEl = document.createElement('div');
//             rowEl.className = 'hex-row';

//             rows[rowIndex].sort((a, b) => a.coord.q - b.coord.q).forEach(tile => {
//                 const el = document.createElement('div');
//                 el.className = `hex ${tile.resource}`;

//                 if (tile.resource === 'wa') {
//                     el.innerHTML = `<span class="label">${tile.label}</span>`;
//                 } else {
//                     const hasToken = tile.token ? `<div class="token ${tile.token === 6 || tile.token === 8 ? 'red' : ''}">${tile.token}</div>` : '';
//                     el.innerHTML = `${hasToken}<span class="label">${tile.name}</span>`;
//                 }
//                 rowEl.appendChild(el);
//             });
//             this.container.appendChild(rowEl);
//         });
//     }
// }

class CatanUIRenderer {
    constructor(targetId, statsId, config) {
        this.container = document.getElementById(targetId);
        this.statsContainer = document.getElementById(statsId);
        this.config = config;
    }

    /**
     * Helper mapping values to a smooth HSL gradient (0 = Red, 60 = Yellow, 120 = Green)
     * @private
     */
    _getColorForDeviation(val, avg, maxDev = 0.08) {
        if (avg === 0) return 'hsl(60, 95%, 45%)';
        const deviation = (val - avg) / avg;
        let factor = Math.max(-1, Math.min(1, deviation / maxDev));
        let hue = 60 + (factor * 60); 
        return `hsl(${hue}, 90%, 45%)`;
    }

    /**
     * Renders placeholder hex tiles to deliver instant visual loading feedback.
     */
    showLoadingSkeleton(board) {
        this.container.innerHTML = '';
        const rows = {};
        board.getAllTiles().forEach(tile => {
            if (!rows[tile.coord.r]) rows[tile.coord.r] = [];
            rows[tile.coord.r].push(tile);
        });

        Object.keys(rows).sort((a, b) => Number(a) - Number(b)).forEach(rowIndex => {
            const rowEl = document.createElement('div');
            rowEl.className = 'tile-row';
            rows[rowIndex].sort((a, b) => a.coord.q - b.coord.q).forEach(() => {
                const el = document.createElement('div');
                el.className = 'tile';
                el.innerHTML = `<div class="hex skeleton"></span>`;
                rowEl.appendChild(el);
            });
            this.container.appendChild(rowEl);
        });
    }

    /**
     * Renders the complete finalized node mappings onto the target containers.
     */
    render(board, showHeatmap) {
        this.container.innerHTML = '';
        this._renderStats(board);

        const rows = {};
        board.getAllTiles().forEach(tile => {
            if (!rows[tile.coord.r]) rows[tile.coord.r] = [];
            rows[tile.coord.r].push(tile);
        });

        Object.keys(rows).sort((a, b) => Number(a) - Number(b)).forEach(rowIndex => {
            const rowEl = document.createElement('div');
            rowEl.className = 'tile-row';

            rows[rowIndex].sort((a, b) => a.coord.q - b.coord.q).forEach(tile => {
                const el = document.createElement('div');
                el.className = `tile ${tile.resource}`;
                
                const pips = this.config.pips[tile.token] || 0;
                const probPct = ((pips / 36) * 100).toFixed(2) + '%';

                if (tile.resource !== 'wa' && tile.resource !== 'de' && tile.token) {
                    el.setAttribute('data-prob', `Dice Chance: ${probPct}`);
                }

                if (tile.resource === 'wa') {
                    el.innerHTML = `<span class="label port-label">${tile.label}</span>`;
                } else {
                    const hasToken = tile.token ? `<div class="token ${tile.token === 6 || tile.token === 8 ? 'red' : ''}">${tile.token}${tile.token === 6 || tile.token === 9 ? '.' : ''}</div>` : '';
                    // el.innerHTML = `${hasToken}<span class="label">${tile.name}</span>`;
                    el.innerHTML = `${hasToken}`;
                }
                el.innerHTML += `<div class="hex ${tile.resource}"></span>`
                rowEl.appendChild(el);
            });
            this.container.appendChild(rowEl);
        });

        if (showHeatmap) {
            this._renderIntersectionLayer(board);
        }
    }

    /**
     * Aggregates total adjacent intersection probabilities into a single, unique text badge per vertex.
     * Fixed duplicate rendering bug via proximity snapping.
     * @private
     */
    _renderIntersectionLayer(board) {
        const corners = new Map();
        const hexWidth = 104, hexHeight = 93;  
        const snapTolerance = 10; // Pixels threshold to merge identical corner nodes

        board.getAllTiles().forEach(tile => {
            if (tile.resource === 'wa') return;
            const prob = (this.config.pips[tile.token] || 0) / 36;
            const x = (tile.coord.q + tile.coord.r / 2) * hexWidth;
            const y = tile.coord.r * hexHeight;

            const angleOffsets = [
                { dx: 0, dy: -57.5 }, { dx: 50, dy: -28.75 }, { dx: 50, dy: 28.75 },
                { dx: 0, dy: 57.5 }, { dx: -50, dy: 28.75 }, { dx: -50, dy: -28.75 }
            ];

            angleOffsets.forEach(offset => {
                const cx = Math.round(x + offset.dx);
                const cy = Math.round(y + offset.dy);
                
                // CRITICAL FIX: Scan existing corners for a matching close-proximity vertex
                let matchedKey = null;
                for (const existingKey of corners.keys()) {
                    const [ex, ey] = existingKey.split(',').map(Number);
                    if (Math.abs(ex - cx) <= snapTolerance && Math.abs(ey - cy) <= snapTolerance) {
                        matchedKey = existingKey;
                        break;
                    }
                }

                // If no nearby corner exists, initialize a new unique point
                if (!matchedKey) {
                    matchedKey = `${cx},${cy}`;
                    corners.set(matchedKey, { cx, cy, totalProb: 0 });
                }
                
                corners.get(matchedKey).totalProb += prob;
            });
        });

        const cornerArr = Array.from(corners.values());
        const avgVertexProb = cornerArr.reduce((acc, c) => acc + c.totalProb, 0) / cornerArr.length;

        corners.forEach(c => {
            const dot = document.createElement('div');
            dot.className = 'intersection-dot';
            dot.style.left = `calc(50% + ${c.cx}px - 16px)`;
            dot.style.top = `calc(50% + ${c.cy}px - 10px)`;
            
            dot.style.backgroundColor = this._getColorForDeviation(c.totalProb, avgVertexProb, 0.4);
            
            // Displays the aggregated mathematical sum (0% - 100%) exactly once per intersection
            dot.textContent = `${(c.totalProb * 100).toFixed(0)}%`;
            this.container.appendChild(dot);
        });
    }

    /**
     * Formats global statistics into color-coded margin tags beneath the hex grids.
     * @private
     */
    _renderStats(board) {
        const stats = {};
        let activeCategoriesCount = 0;
        let combinedProbSum = 0;

        board.getAllTiles().forEach(t => {
            if (t.resource !== 'wa' && t.resource !== 'de') {
                stats[t.name] = (stats[t.name] || 0) + ((this.config.pips[t.token] || 0) / 36);
            }
        });

        Object.values(stats).forEach(v => { combinedProbSum += v; activeCategoriesCount++; });
        const avgCategoryProb = combinedProbSum / activeCategoriesCount;
        
        this.statsContainer.innerHTML = ``;
        Object.entries(stats).forEach(([name, totalProb]) => {
            const percentage = (totalProb * 100).toFixed(1) + '%';
            const badgeColor = this._getColorForDeviation(totalProb, avgCategoryProb, 0.1);
            
            this.statsContainer.innerHTML += `
                <div class="stat-badge" style="border-left: 4px solid ${badgeColor}; padding-left: 6px;">
                    <strong>${name}:</strong> ${percentage}
                </div>`;
        });
    }
}
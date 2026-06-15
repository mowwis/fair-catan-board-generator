export class HexGrid {
    constructor(radius = 3) {
        this.tiles = [];
        this.intersections = [];
        this._neighborCache = new Map();
        this._buildGrid(radius);
        this._buildIntersections();
    }

    _buildGrid(radius) {
        let id = 0;
        for (let q = -radius; q <= radius; q++) {
            const rMin = Math.max(-radius, -radius - q);
            const rMax = Math.min(radius, radius - q);
            for (let r = rMin; r <= rMax; r++) {
                this.tiles.push({ id: id++, q, r, s: -q - r, isWater: Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) === radius });
            }
        }
        this.tiles.sort((a, b) => (a.r + a.q / 2) - (b.r + b.q / 2) || a.q - b.q);
        this.tiles.forEach((tile, index) => tile.id = index);
    }

    _buildIntersections() {
        const map = new Map();
        this.tiles.forEach(t1 => {
            const neighbors = this.getNeighbors(t1);
            neighbors.forEach(t2 => {
                neighbors.forEach(t3 => {
                    if (t2.id < t3.id && this.getNeighbors(t2).includes(t3)) {
                        const key = [t1.id, t2.id, t3.id].sort((a, b) => a - b).join('|');
                        map.set(key, [t1, t2, t3]); 
                    }
                });
            });
        });
        this.intersections = Array.from(map.values()).sort((a, b) => {
            const score = (tiles) => tiles.reduce((acc, t) => acc + (t.r + t.q / 2), 0);
            // const qScore = (ids) => ids.reduce((acc, id) => acc + this.tiles[id].q, 0);
            return score(a) - score(b);
        });
    }

    getNeighbors(tile) {
        if (this._neighborCache.has(tile.id)) return this._neighborCache.get(tile.id);
        const n = this.tiles.filter(o => (Math.abs(tile.q - o.q) + Math.abs(tile.r - o.r) + Math.abs(tile.s - o.s)) === 2);
        this._neighborCache.set(tile.id, n);
        return n;
    }
}
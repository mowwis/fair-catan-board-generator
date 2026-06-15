import { shuffle, getProbability } from "./core/utils.js";

export class CatanBoard {
    constructor(grid, config) {
        this.grid = grid;
        this.config = config;
        this.states = new Array(grid.tiles.length).fill(null).map(() => ({ res: null, tok: null, port: null }));
        this._initPorts();
    }

    get landTileIds() { return this.grid.tiles.filter(t => !t.isWater).map(t => t.id); }

    _initPorts() {
        const water = this.grid.tiles.filter(t => t.isWater).sort((a, b) => Math.atan2(a.r, a.q) - Math.atan2(b.r, b.q));
        const ports = shuffle(this.config.ports);
        water.forEach((t, i) => i % 2 === 0 && (this.states[t.id].port = (i / 2) % 2 === 0 ? ports.pop() : '3:1'));
    }

    getLandNeighbors(id) { return this.grid.getNeighbors(this.grid.tiles[id]).filter(n => !n.isWater).map(n => n.id); }

    getIntersectionProbs() {
        return this.grid.intersections.map(tiles => tiles.reduce((sum, t) => sum + (t.isWater ? 0 : getProbability(this.states[t.id].tok)), 0));
    }

    getYields() {
        const yields = Object.fromEntries(Object.keys(this.config.landPool).filter(k => k !== 'desert').map(k => [k, 0]));
        this.grid.tiles.forEach(t => {
            if (t.isWater) return;
            const s = this.states[t.id];
            if (s.res && s.res !== 'desert') yields[s.res] += getProbability(s.tok);
        });
        return yields;
    }
}
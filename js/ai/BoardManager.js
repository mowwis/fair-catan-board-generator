import { shuffle } from "../core/utils.js";

export class BoardManager {
    constructor(rules) {
        this.rules = JSON.parse(JSON.stringify(rules)).map((r, i) => ({ ...r, fn: rules[i].fn }));
    }

    getState(b) { return b.states.map(s => ({ res: s.res, tok: s.tok })); }
    setState(b, s) {
        b.states.forEach((state, i) => {
            state.res = s[i].res;
            state.tok = s[i].tok;
        });
    }

    initBoard(b) {
        const res = shuffle(Object.entries(b.config.landPool).flatMap(([k, c]) => Array(c).fill(k)));
        const toks = shuffle(b.config.tokens);
        let tIdx = 0;
        b.landTileIds.forEach((id, i) => {
            b.states[id].res = res[i];
            b.states[id].tok = (res[i] === 'desert') ? 7 : toks[tIdx++];
        });
    }

    randomSwap(b) {
        const ids = b.landTileIds;
        const idA = ids[Math.floor(Math.random() * ids.length)];
        const idB = ids[Math.floor(Math.random() * ids.length)];
        if (idA === idB) return () => { };
        const mode = Math.random() < 0.5 ? 'res' : 'tok';
        this._execSwap(idA, idB, mode, b);
        return () => this._execSwap(idA, idB, mode, b);
    }

    _execSwap(idA, idB, mode, b) {
        [b.states[idA][mode], b.states[idB][mode]] = [b.states[idB][mode], b.states[idA][mode]];
        const dId = b.grid.tiles.find(t => !t.isWater && b.states[t.id].res === 'desert').id;
        const tSevenId = b.grid.tiles.find(t => !t.isWater && b.states[t.id].tok === 7).id;
        if (dId !== tSevenId) [b.states[dId].tok, b.states[tSevenId].tok] = [b.states[tSevenId].tok, b.states[dId].tok];
    }

    calculateScore(b, rawRuleId = null) {
        const active = this.rules.filter(r => r.enabled || r.id === rawRuleId);
        if (rawRuleId) return active.find(r => r.id === rawRuleId)?.fn(b, active.find(r => r.id === rawRuleId).params) || 0;
        const sumW = active.reduce((s, r) => s + r.weight, 0);
        if (sumW === 0) return 0;

        return active.reduce((sum, rule) => {
            let norm = (rule.fn(b, rule.params) - rule.min) / ((rule.max - rule.min) || 1);
            return sum + (Math.max(0, Math.min(1.5, norm)) * ((rule.weight / sumW) * 1000));
        }, 0);
    }
}
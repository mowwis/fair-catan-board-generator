import { getProbability } from "../core/utils.js";

const isRed = (tok) => tok === 6 || tok === 8;
const isRare = (tok) => tok === 2 || tok === 12;
const bothRed = (ta, tb) => isRed(ta) && isRed(tb);
const bothRare = (ta, tb) => isRare(ta) && isRare(tb);

export const RULES = [
    {
        id: "des_wat",
        name: "No Desert by Water",
        enabled: false,
        weight: 3,
        min: 0, max: 1, params: {},
        fn: (board) => {
            return board.grid.tiles.some(t => {
                if (t.isWater) return false;
                if (board.states[t.id].res !== 'desert') return false;
                return board.grid.getNeighbors(t).some(n => n.isWater);
            }) ? 1 : 0;
        }
    },
    {
        id: "same_tok_same_res",
        name: "No Same Numbers on Same Resource (incl. 6/8 and 2/12)",
        enabled: true,
        weight: 2,
        min: 0, max: 4, params: {},
        fn: (board) => {
            return board.grid.tiles.reduce((sum, t) => {
                if (t.isWater) return sum;
                const sA = board.states[t.id];
                if (sA.tok === 7) return sum;

                const matchCount = board.grid.tiles.filter(o => {
                    if (o.isWater || o.id >= t.id) return false;
                    const sB = board.states[o.id];
                    if (sB.res !== sA.res) return false;
                    return sB.tok === sA.tok || bothRed(sA.tok, sB.tok) || bothRare(sA.tok, sB.tok);
                }).length;

                return sum + matchCount;
            }, 0);
        }
    },
    {
        id: "max_res",
        name: "Max Same Resources at Intersection",
        enabled: true,
        weight: 1,
        min: 0, max: 18, params: { maxAllowed: 1 },
        fn: (board, params) => {
            return board.grid.intersections.reduce((sum, tiles) => {
                const resList = [];
                for(let i=0; i<tiles.length; i++) {
                    const t = tiles[i];
                    if (t.isWater) continue;
                    const res = board.states[t.id].res;
                    if (res && res !== 'desert') resList.push(res);
                }
                const duplicates = resList.filter((res, i) => resList.indexOf(res) !== i).length;
                return sum + Math.max(0, duplicates - (params.maxAllowed - 1));
            }, 0);
        }
    },
    {
        id: "dist_same_tok",
        name: "Maximize Distance of Same Numbers (incl. 6/8 and 2/12)",
        enabled: true,
        weight: 3,
        min: 2.6, max: 16.5, params: {},
        fn: (board) => {
            return board.grid.tiles.reduce((sum, t) => {
                if (t.isWater) return sum;
                const sA = board.states[t.id];
                if (sA.tok === 7) return sum;

                const matches = board.grid.tiles.filter(o => {
                    if (o.isWater || o.id >= t.id) return false;
                    const sB = board.states[o.id];
                    return sB.tok !== 7 && (sB.tok === sA.tok || bothRed(sA.tok, sB.tok) || bothRare(sA.tok, sB.tok));
                });

                return sum + matches.reduce((p, o) => {
                    const sB = board.states[o.id];
                    const d = (Math.abs(t.q - o.q) + Math.abs(t.r - o.r) + Math.abs(t.s - o.s)) / 2;
                    let mult = 1;
                    if (bothRed(sA.tok, sB.tok)) mult = (sA.tok === sB.tok) ? 5 : 3;
                    else if (bothRare(sA.tok, sB.tok)) mult = 0.5;
                    return p + (mult / (d * d));
                }, 0);
            }, 0);
        }
    },
    {
        id: "adjacent_tok",
        name: "No Same Numbers Adjacent (incl. 6/8 and 2/12)",
        enabled: false,
        weight: 3,
        min: 0, max: 6, params: {},
        fn: (board) => {
            return board.grid.tiles.reduce((sum, t) => {
                if (t.isWater) return sum;
                const sA = board.states[t.id];
                if (sA.tok === 7) return sum;

                const matchCount = board.getLandNeighbors(t.id).filter(nId => {
                    if (nId >= t.id) return false;
                    const sB = board.states[nId];
                    return sB.tok === sA.tok || bothRed(sA.tok, sB.tok) || bothRare(sA.tok, sB.tok);
                }).length;

                return sum + matchCount;
            }, 0);
        }
    },
    {
        id: "tok_lumber_brick",
        name: "No Same Numbers on Lumber and Brick",
        enabled: true,
        weight: 1,
        min: 0, max: 2, params: {},
        fn: (board) => {
            const landIds = board.landTileIds;
            const lumberTiles = landIds.filter(id => board.states[id].res === 'lumber');
            const brickTiles = landIds.filter(id => board.states[id].res === 'brick');

            return lumberTiles.reduce((sum, lId) => {
                const sL = board.states[lId];
                const matchCount = brickTiles.filter(bId => board.states[bId].tok === sL.tok).length;
                return sum + matchCount;
            }, 0);
        }
    },
    {
        id: "global_res_balance",
        name: "Global Resource Balance",
        enabled: true,
        weight: 1,
        min: 9, max: 640, params: {},
        fn: (board) => {
            const yields = Object.values(board.getYields());
            const avg = yields.reduce((a, b) => a + b, 0) / (yields.length || 1);
            return yields.reduce((sum, y) => sum + Math.pow(y - avg, 2), 0);
        }
    },
    {
        id: "fair_inter",
        name: "Intersection Fairness",
        enabled: true,
        weight: 2,
        min: 500, max: 7500, params: {},
        fn: (board) => {
            const weights = { 3: 4, 2: 2, 1: 1 };
            const groups = { 3: [], 2: [], 1: [] };

            board.grid.intersections.forEach(tiles => {
                const landCount = tiles.filter(t => !t.isWater).length;
                if (landCount === 0) return;

                const interProbSum = tiles.reduce((sum, t) => {
                    if (t.isWater) return sum;
                    return sum + getProbability(board.states[t.id].tok);
                }, 0);
                groups[landCount].push(interProbSum);
            });

            return Object.entries(groups).reduce((total, [count, list]) => {
                if (!list.length) return total;
                const avg = list.reduce((a, b) => a + b, 0) / list.length;
                const varianceSum = list.reduce((s, p) => s + Math.pow(p - avg, 2), 0);
                return total + (varianceSum * weights[count]);
            }, 0);
        }
    },
];
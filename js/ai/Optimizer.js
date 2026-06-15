import { shuffle } from "../core/utils.js";

export class SimulatedAnnealingEngine {
    constructor(options = {}) {
        this.maxIterations = options.maxIterations || 50000;
        this.startTemp = options.startTemp || 150;
        this.coolingRate = options.coolingRate || 0.9993;
        this.patienceThreshold = options.patienceThreshold || 8000;
    }

    run(board, scoreFn, swapFn, getStateFn, setStateFn) {
        let temp = this.startTemp;
        let current = scoreFn(board);
        let best = current;
        let bestState = getStateFn(board);
        let noImprovement = 0, actualIterations = 0;
        const lossHistory = [];
        lossHistory.push({ iteration: 0, loss: current, best, temp });

        for (let i = 1; i < this.maxIterations; i++) {
            actualIterations = i;
            const undo = swapFn(board);
            const next = scoreFn(board);
            const delta = current - next;

            if (next < current || Math.random() < Math.exp(delta / temp)) {
                current = next;
                if (current < best) {
                    best = current;
                    bestState = getStateFn(board);
                    noImprovement = 0;
                }
                else noImprovement++;
            } else {
                undo();
                noImprovement++;
            }

            temp *= this.coolingRate;
            if (i % 500 === 0) lossHistory.push({ iteration: i, loss: current, best, temp });
            if (best === 0 || noImprovement > this.patienceThreshold) break;
        }
        setStateFn(board, bestState);
        return { lossHistory, finalScore: best, iterationsUsed: actualIterations };
    }
}

export class RuleCalibrator {
    constructor(bm) { this.bm = bm; }

    calibrate(b, iterations = 100000) {
        console.log("Calibrating...");

        const orig = this.bm.getState(b);
        const samples = Object.fromEntries(this.bm.rules.map(r => [r.id, []]));
        for (let i = 0; i < iterations; i++) {
            this.bm.initBoard(b);
            this.bm.rules.forEach(r => samples[r.id].push(r.fn(b, r.params)));
        }

        const engine = new SimulatedAnnealingEngine({
            // maxIterations: 3000,
            // startTemp: 500,
            // coolingRate: 0.994,
            // patienceThreshold: 600
        });

        this.bm.rules.forEach(r => {
            const arr = samples[r.id].sort((a, b) => a - b);
            const sampleMax = arr[arr.length - 1] || 1;
            let absMin = arr[0] || 0;
            if (absMin > 0) {
                engine.run(b,
                    (board) => this.bm.calculateScore(board, r.id),
                    (board) => this.bm.randomSwap(board),
                    (board) => this.bm.getState(board),
                    (board, s) => this.bm.setState(board, s)
                );
                absMin = r.fn(b, r.params);
            }
            
            r.min = parseFloat(absMin.toFixed(4));
            r.max = parseFloat((arr[Math.floor(arr.length * 0.95)] || sampleMax).toFixed(4));
            if (r.max <= r.min) r.max = r.min + (sampleMax > r.min ? parseFloat((sampleMax - r.min).toFixed(4)) : 1);
        });
        this.bm.setState(b, orig);

        console.log("Calibration done:", Object.fromEntries(this.bm.rules.map(r => [r.id, { min: r.min, max: r.max }])));
    }
}
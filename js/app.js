import { CATAN_BASE_CONFIG } from './config.js';
import { RULES } from './ai/rules.js';
import { HexGrid } from './core/HexGrid.js';
import { CatanBoard } from './CatanBoard.js';
import { BoardManager } from './ai/BoardManager.js';
import { SimulatedAnnealingEngine, RuleCalibrator } from './ai/Optimizer.js';
import { CatanUIRenderer } from './ui/Renderer.js';

document.addEventListener("DOMContentLoaded", () => {
    const grid = new HexGrid(CATAN_BASE_CONFIG.radius);
    const board = new CatanBoard(grid, CATAN_BASE_CONFIG);
    const boardManager = new BoardManager(RULES);

    const calibrator = new RuleCalibrator(boardManager);
    const renderer = new CatanUIRenderer();
    const engine = new SimulatedAnnealingEngine({
        maxIterations: 120000,
        startTemp: 40,
        coolingRate: 0.99991,
        patienceThreshold: 25000
    });

    const dice = document.getElementById("dice");
    const boardEl = document.getElementById("board");
    const statsBtn = document.getElementById("toggle-stats");
    const wrapperEl = document.getElementById('board-wrapper');
    const settingsMenu = document.getElementById("settings-menu");

    const runPipeline = (forceRecalibrate = false) => {
        wrapperEl.classList.add('loading');
        boardEl.removeAttribute('data-roll-val');

        setTimeout(() => {
            if (forceRecalibrate) calibrator.calibrate(board);

            boardManager.initBoard(board);
            const result = engine.run(
                board,
                (b) => boardManager.calculateScore(b),
                (b) => boardManager.randomSwap(b),
                (b) => boardManager.getState(b),
                (b, state) => boardManager.setState(b, state)
            );

            renderer.render(board);
            // renderer.plotLoss(result.lossHistory);
            wrapperEl.classList.remove('loading');
        }, 0);
    };

    document.getElementById('trigger').onclick = () => runPipeline();
    document.getElementById("dice-reset").onclick = (e) => {
        e.stopPropagation();
        boardEl.removeAttribute('data-roll-val');
    };

    statsBtn.onclick = () => {
        statsBtn.classList.toggle('btn--primary');
        wrapperEl.classList.toggle('hide-stats');
    };

    settingsMenu.onclick = (e) => { if (e.target === settingsMenu) settingsMenu.close(); };
    settingsMenu.onclose = () => { if (settingsMenu.hasChanges) runPipeline(); };
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

    renderer.buildSettingsMenu(boardManager, () => settingsMenu.hasChanges = true);
    runPipeline(false);
});
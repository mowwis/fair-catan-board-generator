export function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

export function getDots(token) {
    if (!token || token === 7) return 0;
    return 6 - Math.abs(7 - token);
}

export function getProbability(token) {
    return (getDots(token) / 36) * 100;
}
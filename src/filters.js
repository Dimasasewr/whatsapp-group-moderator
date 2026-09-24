const config = require("./config");

function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function containsBadWord(text) {
    if (!text) {
        return false;
    }

    const normalized = normalizeText(text);

    return config.BAD_WORDS.some(word => {
        const regex = new RegExp(
            `(^|\\s)${word}(\\s|$)`,
            "i"
        );

        return regex.test(normalized);
    });
}

module.exports = {
    normalizeText,
    containsBadWord
};

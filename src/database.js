const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");

const VIOLATION_FILE = path.join(
    DATA_DIR,
    "violations.json"
);

const INFO_FILE = path.join(
    DATA_DIR,
    "info_used.json"
);

function ensureData() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, {
            recursive: true
        });
    }

    if (!fs.existsSync(VIOLATION_FILE)) {
        fs.writeFileSync(
            VIOLATION_FILE,
            "{}",
            "utf8"
        );
    }

    if (!fs.existsSync(INFO_FILE)) {
        fs.writeFileSync(
            INFO_FILE,
            "{}",
            "utf8"
        );
    }
}

function readJSON(file) {
    ensureData();

    try {
        return JSON.parse(
            fs.readFileSync(file, "utf8")
        );
    } catch {
        return {};
    }
}

function writeJSON(file, data) {
    ensureData();

    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

/* =========================
   VIOLATIONS
========================= */

function getViolation(groupId, userId) {
    const data = readJSON(VIOLATION_FILE);

    if (!data[groupId]) {
        return 0;
    }

    return data[groupId][userId] || 0;
}

function addViolation(groupId, userId) {
    const data = readJSON(VIOLATION_FILE);

    if (!data[groupId]) {
        data[groupId] = {};
    }

    if (!data[groupId][userId]) {
        data[groupId][userId] = 0;
    }

    data[groupId][userId]++;

    writeJSON(
        VIOLATION_FILE,
        data
    );

    return data[groupId][userId];
}

function resetViolation(groupId, userId) {
    const data = readJSON(VIOLATION_FILE);

    if (
        data[groupId] &&
        data[groupId][userId]
    ) {
        delete data[groupId][userId];
    }

    writeJSON(
        VIOLATION_FILE,
        data
    );
}

/* =========================
   INFO USAGE
========================= */

function hasUsedInfo(userId) {
    const data = readJSON(INFO_FILE);

    return Boolean(data[userId]);
}

function markInfoUsed(userId) {
    const data = readJSON(INFO_FILE);

    data[userId] = {
        used: true,
        timestamp: new Date().toISOString()
    };

    writeJSON(
        INFO_FILE,
        data
    );
}

module.exports = {
    getViolation,
    addViolation,
    resetViolation,
    hasUsedInfo,
    markInfoUsed
};

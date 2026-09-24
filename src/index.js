const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const P = require("pino");
const qrcode = require("qrcode-terminal");

const config = require("./config");
const { containsBadWord } = require("./filters");
const { moderate } = require("./moderator");
const { handleCommand } = require("./commands");

const stickerTracker = new Map();

async function startBot() {

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(
        "auth"
    );

    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(
                state.keys,
                P({ level: "silent" })
            )
        },

        logger: P({
            level: "silent"
        }),

        printQRInTerminal: false,

        browser: [
            "DIMAS MODERATOR",
            "Chrome",
            "1.0.0"
        ]
    });

    sock.ev.on(
        "creds.update",
        saveCreds
    );

    sock.ev.on(
        "connection.update",
        async update => {

            const {
                connection,
                lastDisconnect,
                qr
            } = update;

            if (qr) {
                console.log(
                    "\nScan QR berikut menggunakan WhatsApp:\n"
                );

                qrcode.generate(
                    qr,
                    {
                        small: true
                    }
                );
            }

            if (
                connection === "open"
            ) {
                console.log(
                    "\n================================"
                );

                console.log(
                    "🤖 WhatsApp Moderator aktif"
                );

                console.log(
                    "👨‍💻 DIMAS PUTRA PRATAMA"
                );

                console.log(
                    "================================\n"
                );
            }

            if (
                connection === "close"
            ) {

                const statusCode =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode;

                const shouldReconnect =
                    statusCode !==
                    DisconnectReason.loggedOut;

                console.log(
                    "Koneksi terputus."
                );

                if (shouldReconnect) {
                    console.log(
                        "Menghubungkan kembali..."
                    );

                    startBot();
                } else {
                    console.log(
                        "WhatsApp logout."
                    );
                }
            }
        }
    );

    sock.ev.on(
        "messages.upsert",
        async ({ messages }) => {

            const message =
                messages[0];

            if (!message) {
                return;
            }

            if (
                !message.message
            ) {
                return;
            }

            if (
                message.key.fromMe
            ) {
                return;
            }

            const remoteJid =
                message.key.remoteJid;

            // Hanya grup
            if (
                !remoteJid ||
                !remoteJid.endsWith("@g.us")
            ) {
                return;
            }

            const userId =
                message.key.participant;

            if (!userId) {
                return;
            }

            /* =========================
               TEXT
            ========================= */

            const text =
                message.message.conversation ||
                message.message.extendedTextMessage
                    ?.text ||
                message.message.imageMessage
                    ?.caption ||
                message.message.videoMessage
                    ?.caption ||
                "";

            /* =========================
               COMMAND
            ========================= */

            try {

                const commandHandled =
                    await handleCommand(
                        sock,
                        message,
                        text
                    );

                if (commandHandled) {
                    return;
                }

            } catch (error) {

                console.error(
                    "Command error:",
                    error
                );
            }

            /* =========================
               EXCLUDED GROUP
            ========================= */

            if (
                config.EXCLUDED_GROUPS.includes(
                    remoteJid
                )
            ) {
                return;
            }

            /* =========================
               BAD WORD FILTER
            ========================= */

            if (
                text &&
                containsBadWord(text)
            ) {

                await moderate(
                    sock,
                    message,
                    "Menggunakan kata/kalimat yang dilarang"
                );

                return;
            }

            /* =========================
               STICKER SPAM
            ========================= */

            const sticker =
                message.message.stickerMessage;

            if (sticker) {

                const now =
                    Date.now();

                if (
                    !stickerTracker.has(
                        remoteJid
                    )
                ) {

                    stickerTracker.set(
                        remoteJid,
                        {}
                    );
                }

                const groupData =
                    stickerTracker.get(
                        remoteJid
                    );

                if (
                    !groupData[userId]
                ) {

                    groupData[userId] = [];
                }

                groupData[userId] =
                    groupData[userId].filter(
                        timestamp =>
                            now - timestamp <
                            config.STICKER_WINDOW
                    );

                groupData[userId].push(
                    now
                );

                const stickerCount =
                    groupData[userId].length;

                console.log(
                    `[STICKER] ${userId}: ${stickerCount}`
                );

                if (
                    stickerCount >=
                    config.STICKER_LIMIT
                ) {

                    groupData[userId] = [];

                    await moderate(
                        sock,
                        message,
                        "Spam stiker"
                    );

                    return;
                }
            }

            /* =========================
               AUTO REPLY
            ========================= */

            const lowerText =
                text
                    .toLowerCase()
                    .trim();

            if (
                lowerText === "bot"
            ) {

                await sock.sendMessage(
                    remoteJid,
                    {
                        text:
                            "🤖 Ya, saya aktif.\n\n" +
                            "Ketik .menu untuk melihat perintah."
                    }
                );

                return;
            }

            if (
                lowerText === "halo bot"
            ) {

                await sock.sendMessage(
                    remoteJid,
                    {
                        text:
                            "👋 Halo!\n" +
                            "Saya WhatsApp Group Moderator."
                    }
                );

                return;
            }
        }
    );
}

startBot().catch(
    console.error
);

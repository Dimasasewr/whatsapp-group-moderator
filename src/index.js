const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const P = require("pino");

const config = require("./config");
const { containsBadWord } = require("./filters");
const { moderate } = require("./moderator");
const { handleCommand } = require("./commands");

const stickerTracker = new Map();

async function startBot() {

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState("auth");

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

    /*
    ====================================
    PAIRING CODE
    ====================================
    */

    if (
        !state.creds.registered
    ) {

        const phoneNumber =
            process.env.WA_NUMBER;

        if (!phoneNumber) {

            console.log(
                "================================"
            );

            console.log(
                "❌ WA_NUMBER belum diset."
            );

            console.log(
                "Masukkan nomor WhatsApp Business"
            );

            console.log(
                "di Railway Variables."
            );

            console.log(
                "Contoh: 628123456789"
            );

            console.log(
                "================================"
            );

            return;
        }

        try {

            const code =
                await sock.requestPairingCode(
                    phoneNumber
                );

            console.log(
                "================================"
            );

            console.log(
                "📱 WHATSAPP PAIRING CODE"
            );

            console.log(
                "================================"
            );

            console.log(
                `Nomor: ${phoneNumber}`
            );

            console.log(
                `PAIRING CODE: ${code}`
            );

            console.log(
                "================================"
            );

            console.log(
                "Buka WhatsApp Business:"
            );

            console.log(
                "Perangkat tertaut"
            );

            console.log(
                "→ Tautkan perangkat"
            );

            console.log(
                "→ Tautkan dengan nomor telepon"
            );

            console.log(
                "→ Masukkan pairing code"
            );

            console.log(
                "================================"
            );

        } catch (error) {

            console.error(
                "❌ Gagal membuat pairing code:",
                error
            );
        }
    }

    /*
    ====================================
    CONNECTION
    ====================================
    */

    sock.ev.on(
        "connection.update",
        async update => {

            const {
                connection,
                lastDisconnect
            } = update;

            if (
                connection === "open"
            ) {

                console.log(
                    "================================"
                );

                console.log(
                    "🤖 WHATSAPP MODERATOR AKTIF"
                );

                console.log(
                    "👨‍💻 DIMAS PUTRA PRATAMA"
                );

                console.log(
                    "================================"
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
                    "Koneksi WhatsApp terputus."
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

    /*
    ====================================
    MESSAGE HANDLER
    ====================================
    */

    sock.ev.on(
        "messages.upsert",
        async ({ messages }) => {

            const message =
                messages[0];

            if (!message) return;

            if (!message.message) return;

            if (message.key.fromMe) return;

            const remoteJid =
                message.key.remoteJid;

            if (
                !remoteJid ||
                !remoteJid.endsWith("@g.us")
            ) {
                return;
            }

            const userId =
                message.key.participant;

            if (!userId) return;

            /*
            ==============================
            TEXT
            ==============================
            */

            const text =
                message.message.conversation ||
                message.message.extendedTextMessage
                    ?.text ||
                message.message.imageMessage
                    ?.caption ||
                message.message.videoMessage
                    ?.caption ||
                "";

            /*
            ==============================
            COMMAND
            ==============================
            */

            try {

                const handled =
                    await handleCommand(
                        sock,
                        message,
                        text
                    );

                if (handled) return;

            } catch (error) {

                console.error(
                    "Command error:",
                    error
                );
            }

            /*
            ==============================
            EXCLUDED GROUP
            ==============================
            */

            if (
                config.EXCLUDED_GROUPS.includes(
                    remoteJid
                )
            ) {
                return;
            }

            /*
            ==============================
            BAD WORD
            ==============================
            */

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

            /*
            ==============================
            STICKER SPAM
            ==============================
            */

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

                if (
                    groupData[userId].length >=
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

            /*
            ==============================
            AUTO REPLY
            ==============================
            */

            const lowerText =
                text.toLowerCase().trim();

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

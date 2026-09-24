const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestWaWebVersion
} = require("@whiskeysockets/baileys");

const P = require("pino");

const config = require("./config");

const {
    containsBadWord
} = require("./filters");

const {
    moderate
} = require("./moderator");

const {
    handleCommand
} = require("./commands");


/* =========================================================
   GLOBAL
========================================================= */

let isStarting = false;
let reconnectTimer = null;

const stickerTracker = new Map();


/* =========================================================
   DELAY
========================================================= */

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


/* =========================================================
   NORMALIZE NOMOR
========================================================= */

function normalizePhoneNumber(number) {

    if (!number) {
        return null;
    }

    return String(number)
        .replace(/\D/g, "");
}


/* =========================================================
   START BOT
========================================================= */

async function startBot() {

    if (isStarting) {
        return;
    }

    isStarting = true;


    try {

        console.log("");
        console.log("========================================");
        console.log("🔄 MEMULAI KONEKSI WHATSAPP");
        console.log("========================================");


        /* =====================================================
           AUTH
        ===================================================== */

        const {
            state,
            saveCreds
        } = await useMultiFileAuthState("auth");


        /* =====================================================
           AMBIL VERSI WHATSAPP WEB TERBARU
        ===================================================== */

        let waVersion;


        try {

            const result =
                await fetchLatestWaWebVersion();


            if (
                result &&
                result.version
            ) {

                waVersion =
                    result.version;


                console.log(
                    `🌐 WhatsApp Web Version: ${waVersion.join(".")}`
                );

                console.log(
                    `🌐 Latest: ${result.isLatest}`
                );

            } else {

                console.log(
                    "⚠️ Gagal mendapatkan versi WhatsApp Web."
                );

            }

        } catch (error) {

            console.log(
                "⚠️ Gagal mengambil versi WhatsApp Web:"
            );

            console.log(
                error?.message || error
            );
        }


        /* =====================================================
           SOCKET CONFIG
        ===================================================== */

        const socketConfig = {

            auth: {
                creds: state.creds,

                keys: makeCacheableSignalKeyStore(
                    state.keys,
                    P({
                        level: "silent"
                    })
                )
            },

            logger: P({
                level: "silent"
            }),

            printQRInTerminal: false,

            browser: [
                "Chrome",
                "Windows"
            ],

            markOnlineOnConnect: false,

            connectTimeoutMs: 60000,

            defaultQueryTimeoutMs: 60000,

            keepAliveIntervalMs: 25000,

            generateHighQualityLinkPreview: false
        };


        /*
         * Hanya masukkan version jika berhasil
         * mendapatkan versi terbaru.
         */

        if (waVersion) {

            socketConfig.version =
                waVersion;
        }


        /* =====================================================
           CREATE SOCKET
        ===================================================== */

        const sock =
            makeWASocket(
                socketConfig
            );


        isStarting = false;


        /* =====================================================
           SAVE CREDENTIALS
        ===================================================== */

        sock.ev.on(
            "creds.update",
            saveCreds
        );


        /* =====================================================
           CONNECTION UPDATE
        ===================================================== */

        sock.ev.on(
            "connection.update",
            async update => {

                const {
                    connection,
                    lastDisconnect,
                    qr
                } = update;


                /* =================================================
                   PAIRING CODE
                ================================================= */

                if (
                    qr &&
                    !state.creds.registered
                ) {

                    const phoneNumber =
                        normalizePhoneNumber(
                            process.env.WA_NUMBER
                        );


                    if (!phoneNumber) {

                        console.log("");
                        console.log(
                            "========================================"
                        );
                        console.log(
                            "❌ WA_NUMBER BELUM DISET"
                        );
                        console.log(
                            "========================================"
                        );
                        console.log(
                            "Railway → Variables"
                        );
                        console.log(
                            "WA_NUMBER=628xxxxxxxxxx"
                        );
                        console.log(
                            "========================================"
                        );
                        console.log("");

                        return;
                    }


                    /*
                     * Beri waktu socket menyelesaikan
                     * proses handshake awal.
                     */

                    await sleep(2000);


                    try {

                        const code =
                            await sock.requestPairingCode(
                                phoneNumber
                            );


                        const formattedCode =
                            String(code)
                                .match(/.{1,4}/g)
                                ?.join("-") ||
                            code;


                        console.log("");
                        console.log(
                            "========================================"
                        );
                        console.log(
                            "📱 WHATSAPP PAIRING CODE"
                        );
                        console.log(
                            "========================================"
                        );
                        console.log(
                            `Nomor : ${phoneNumber}`
                        );
                        console.log(
                            `Kode  : ${formattedCode}`
                        );
                        console.log(
                            "========================================"
                        );
                        console.log(
                            "BUKA WHATSAPP BUSINESS"
                        );
                        console.log(
                            "Setelan"
                        );
                        console.log(
                            "→ Perangkat tertaut"
                        );
                        console.log(
                            "→ Tautkan perangkat"
                        );
                        console.log(
                            "→ Tautkan dengan nomor telepon"
                        );
                        console.log(
                            "→ Masukkan kode di atas"
                        );
                        console.log(
                            "========================================"
                        );
                        console.log("");

                    } catch (error) {

                        console.log("");
                        console.log(
                            "❌ GAGAL MEMBUAT PAIRING CODE"
                        );
                        console.log(
                            error?.message || error
                        );
                        console.log("");

                    }
                }


                /* =================================================
                   OPEN
                ================================================= */

                if (
                    connection === "open"
                ) {

                    console.log("");
                    console.log(
                        "========================================"
                    );
                    console.log(
                        "✅ WHATSAPP BERHASIL TERHUBUNG"
                    );
                    console.log(
                        "========================================"
                    );
                    console.log(
                        "🤖 DIMAS WHATSAPP GROUP MODERATOR"
                    );
                    console.log(
                        "👨‍💻 DIMAS PUTRA PRATAMA"
                    );
                    console.log(
                        "📡 STATUS: ONLINE"
                    );
                    console.log(
                        "========================================"
                    );
                    console.log("");

                    return;
                }


                /* =================================================
                   CLOSE
                ================================================= */

                if (
                    connection === "close"
                ) {

                    const statusCode =
                        lastDisconnect
                            ?.error
                            ?.output
                            ?.statusCode;


                    console.log("");
                    console.log(
                        "========================================"
                    );
                    console.log(
                        "⚠️ KONEKSI WHATSAPP TERPUTUS"
                    );
                    console.log(
                        `Status Code: ${statusCode || "unknown"}`
                    );
                    console.log(
                        "========================================"
                    );


                    /*
                     * Logout permanen.
                     */

                    if (
                        statusCode ===
                        DisconnectReason.loggedOut
                    ) {

                        console.log(
                            "❌ WhatsApp logout."
                        );

                        console.log(
                            "Session auth harus dihapus"
                        );

                        console.log(
                            "sebelum mencoba pairing ulang."
                        );

                        return;
                    }


                    /*
                     * Jangan membuat reconnect
                     * bertumpuk.
                     */

                    if (
                        reconnectTimer
                    ) {

                        return;
                    }


                    console.log(
                        "🔄 Reconnect dalam 7 detik..."
                    );


                    reconnectTimer =
                        setTimeout(
                            async () => {

                                reconnectTimer =
                                    null;

                                await startBot();

                            },
                            7000
                        );
                }

            }
        );


        /* =========================================================
           MESSAGE HANDLER
        ========================================================= */

        sock.ev.on(
            "messages.upsert",
            async ({
                messages
            }) => {

                try {

                    const message =
                        messages?.[0];


                    if (!message) {
                        return;
                    }


                    if (
                        !message.message
                    ) {
                        return;
                    }


                    /*
                     * Abaikan pesan dari bot sendiri.
                     */

                    if (
                        message.key?.fromMe
                    ) {
                        return;
                    }


                    const remoteJid =
                        message.key?.remoteJid;


                    /*
                     * Hanya group.
                     */

                    if (
                        !remoteJid ||
                        !remoteJid.endsWith("@g.us")
                    ) {

                        return;
                    }


                    /*
                     * GROUP EXCEPTION
                     *
                     * Semua fitur bot benar-benar
                     * tidak bekerja di grup ini.
                     */

                    if (
                        config.EXCLUDED_GROUPS.includes(
                            remoteJid
                        )
                    ) {

                        return;
                    }


                    const userId =
                        message.key?.participant;


                    if (!userId) {
                        return;
                    }


                    /* =================================================
                       TEXT
                    ================================================= */

                    const text =
                        message.message
                            ?.conversation ||

                        message.message
                            ?.extendedTextMessage
                            ?.text ||

                        message.message
                            ?.imageMessage
                            ?.caption ||

                        message.message
                            ?.videoMessage
                            ?.caption ||

                        message.message
                            ?.documentMessage
                            ?.caption ||

                        "";


                    /* =================================================
                       COMMAND
                    ================================================= */

                    try {

                        const commandHandled =
                            await handleCommand(
                                sock,
                                message,
                                text
                            );


                        if (
                            commandHandled
                        ) {

                            return;
                        }

                    } catch (error) {

                        console.error(
                            "❌ Command error:",
                            error
                        );
                    }


                    /* =================================================
                       FILTER KATA
                    ================================================= */

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


                    /* =================================================
                       STICKER SPAM
                    ================================================= */

                    const sticker =
                        message.message
                            ?.stickerMessage;


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

                            groupData[userId] =
                                [];
                        }


                        groupData[userId] =
                            groupData[userId].filter(
                                timestamp =>
                                    now -
                                    timestamp <
                                    config.STICKER_WINDOW
                            );


                        groupData[userId].push(
                            now
                        );


                        const stickerCount =
                            groupData[userId]
                                .length;


                        console.log(
                            `[STICKER] ${userId}: ${stickerCount}`
                        );


                        if (
                            stickerCount >=
                            config.STICKER_LIMIT
                        ) {

                            groupData[userId] =
                                [];


                            await moderate(
                                sock,
                                message,
                                "Spam stiker"
                            );

                            return;
                        }
                    }


                    /* =================================================
                       AUTO REPLY
                    ================================================= */

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
                                    "Saya WhatsApp Group Moderator.\n\n" +
                                    "Ketik .menu untuk melihat perintah."
                            }
                        );

                        return;
                    }


                } catch (error) {

                    console.error(
                        "❌ Message handler error:",
                        error
                    );

                }

            }
        );


    } catch (error) {

        isStarting = false;


        console.error("");
        console.error(
            "========================================"
        );
        console.error(
            "❌ ERROR START BOT"
        );
        console.error(
            "========================================"
        );
        console.error(
            error
        );
        console.error(
            "========================================"
        );


        if (
            !reconnectTimer
        ) {

            reconnectTimer =
                setTimeout(
                    async () => {

                        reconnectTimer =
                            null;

                        await startBot();

                    },
                    7000
                );
        }
    }
}


/* =========================================================
   START
========================================================= */

console.log("");
console.log(
    "========================================"
);
console.log(
    "🤖 DIMAS WHATSAPP GROUP MODERATOR"
);
console.log(
    "👨‍💻 DIMAS PUTRA PRATAMA"
);
console.log(
    "========================================"
);
console.log(
    "🚀 STARTING..."
);
console.log(
    "========================================"
);
console.log("");


startBot().catch(
    error => {

        console.error(
            "FATAL ERROR:",
            error
        );

    }
);

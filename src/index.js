const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore
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

const stickerTracker = new Map();

let reconnecting = false;


/* =========================================================
   NORMALIZE NOMOR WHATSAPP
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

    try {

        const {
            state,
            saveCreds
        } = await useMultiFileAuthState("auth");


        const sock = makeWASocket({

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

            markOnlineOnConnect: false

        });


        /* =====================================================
           SAVE SESSION
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
                            "Buka Railway → Variables"
                        );
                        console.log(
                            "Tambahkan:"
                        );
                        console.log(
                            "WA_NUMBER = 628xxxxxxxxxx"
                        );
                        console.log(
                            "========================================"
                        );
                        console.log("");

                        return;
                    }


                    /*
                     * Tunggu sebentar agar koneksi
                     * Baileys benar-benar siap.
                     */

                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                1500
                            )
                    );


                    try {

                        const pairingCode =
                            await sock.requestPairingCode(
                                phoneNumber
                            );


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
                            `Nomor: ${phoneNumber}`
                        );
                        console.log(
                            `PAIRING CODE: ${pairingCode}`
                        );
                        console.log(
                            "========================================"
                        );
                        console.log(
                            "BUKA WHATSAPP BUSINESS"
                        );
                        console.log(
                            "→ Setelan"
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
                            "→ Masukkan pairing code"
                        );
                        console.log(
                            "========================================"
                        );
                        console.log("");

                    } catch (error) {

                        console.error("");
                        console.error(
                            "❌ GAGAL MEMBUAT PAIRING CODE"
                        );
                        console.error(
                            error?.message || error
                        );
                        console.error("");

                    }
                }


                /* =================================================
                   CONNECTION OPEN
                ================================================= */

                if (
                    connection === "open"
                ) {

                    reconnecting = false;

                    console.log("");
                    console.log(
                        "========================================"
                    );
                    console.log(
                        "🤖 WHATSAPP MODERATOR AKTIF"
                    );
                    console.log(
                        "👨‍💻 DIMAS PUTRA PRATAMA"
                    );
                    console.log(
                        "========================================"
                    );
                    console.log(
                        "Status: ONLINE"
                    );
                    console.log(
                        "========================================"
                    );
                    console.log("");
                }


                /* =================================================
                   CONNECTION CLOSED
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


                    const loggedOut =
                        statusCode ===
                        DisconnectReason.loggedOut;


                    if (loggedOut) {

                        console.log(
                            "❌ WhatsApp logout."
                        );

                        console.log(
                            "Hapus session auth jika ingin login ulang."
                        );

                        return;
                    }


                    if (!reconnecting) {

                        reconnecting = true;

                        console.log(
                            "🔄 Mencoba menghubungkan kembali..."
                        );


                        setTimeout(
                            () => {

                                reconnecting = false;

                                startBot().catch(
                                    error => {
                                        console.error(
                                            "Reconnect error:",
                                            error
                                        );
                                    }
                                );

                            },
                            5000
                        );
                    }
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
                     * Abaikan pesan yang dikirim
                     * oleh bot sendiri.
                     */

                    if (
                        message.key?.fromMe
                    ) {
                        return;
                    }


                    const remoteJid =
                        message.key?.remoteJid;


                    /*
                     * Hanya bekerja di GROUP
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
                     * Grup yang ada di daftar ini
                     * benar-benar diabaikan bot.
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
                       AMBIL TEXT
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
                       BAD WORD FILTER
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


                        /*
                         * Hapus catatan sticker
                         * yang sudah melewati window.
                         */

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
                            `[STICKER] ${userId} → ${stickerCount}`
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


                    /*
                     * "bot"
                     */

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


                    /*
                     * "halo bot"
                     */

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

        console.error("");
        console.error(
            "========================================"
        );
        console.error(
            "❌ GAGAL MENJALANKAN BOT"
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


        if (!reconnecting) {

            reconnecting = true;

            setTimeout(
                () => {

                    reconnecting = false;

                    startBot().catch(
                        console.error
                    );

                },
                5000
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
    "🚀 Starting bot..."
);
console.log(
    "========================================"
);
console.log("");

startBot().catch(
    console.error
);

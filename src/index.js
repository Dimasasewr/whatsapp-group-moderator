const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestWaWebVersion
} = require("@whiskeysockets/baileys");

const P = require("pino");
const http = require("http");
const QRCode = require("qrcode");

const config = require("./config");
const { containsBadWord } = require("./filters");
const { moderate } = require("./moderator");
const { handleCommand } = require("./commands");


/* =========================================================
   GLOBAL
========================================================= */

let currentQR = null;
let botStatus = "STARTING";
let reconnectTimer = null;
let starting = false;

const stickerTracker = new Map();


/* =========================================================
   HTTP SERVER
   Railway perlu aplikasi mendengarkan PORT
========================================================= */

const PORT = Number(process.env.PORT || 8080);

const server = http.createServer(async (req, res) => {

    if (req.url === "/") {

        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8"
        });

        res.end(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WhatsApp Bot</title>

<style>
body {
    margin: 0;
    background: #111318;
    color: white;
    font-family: Arial, sans-serif;
    text-align: center;
}

.container {
    max-width: 500px;
    margin: 40px auto;
    padding: 25px;
}

.card {
    background: #1c1f26;
    border-radius: 20px;
    padding: 25px;
}

img {
    width: 300px;
    max-width: 90%;
    background: white;
    padding: 12px;
    border-radius: 12px;
}

.status {
    margin: 15px;
    padding: 12px;
    border-radius: 10px;
    background: #292d36;
}

button {
    padding: 12px 20px;
    border: 0;
    border-radius: 10px;
    font-size: 16px;
}
</style>

<script>
setTimeout(() => {
    location.reload();
}, 5000);
</script>

</head>

<body>

<div class="container">

<div class="card">

<h2>🤖 WhatsApp Group Moderator</h2>

<p>DIMAS PUTRA PRATAMA</p>

<div class="status">
Status: ${botStatus}
</div>

${
    currentQR
    ?
    `<img src="${currentQR}">`
    :
    `<p>QR belum tersedia.</p>`
}

<p>
Buka WhatsApp Business →
Perangkat tertaut →
Tautkan perangkat →
Scan QR
</p>

</div>

</div>

</body>
</html>
        `);

        return;
    }


    if (req.url === "/health") {

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            status: botStatus
        }));

        return;
    }


    res.writeHead(404);

    res.end("Not Found");
});


server.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("========================================");
    console.log("🌐 HTTP SERVER AKTIF");
    console.log(`PORT: ${PORT}`);
    console.log("========================================");
});


/* =========================================================
   DELAY
========================================================= */

function sleep(ms) {

    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });

}


/* =========================================================
   START WHATSAPP
========================================================= */

async function startBot() {

    if (starting) {
        return;
    }

    starting = true;

    try {

        botStatus = "CONNECTING";

        console.log("");
        console.log("========================================");
        console.log("🔄 MEMULAI WHATSAPP");
        console.log("========================================");


        /* =====================================================
           AUTH
        ===================================================== */

        const {
            state,
            saveCreds
        } = await useMultiFileAuthState("auth");


        /* =====================================================
           WA WEB VERSION
        ===================================================== */

        let version = undefined;

        try {

            const latest =
                await fetchLatestWaWebVersion();

            if (latest?.version) {

                version = latest.version;

                console.log(
                    `🌐 WA Web Version: ${version.join(".")}`
                );

            }

        } catch (error) {

            console.log(
                "⚠️ Tidak bisa mengambil WA Web version."
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

            /*
             * QR kita tangani sendiri melalui
             * connection.update.
             */

            printQRInTerminal: false,

            browser: [
                "Chrome",
                "Windows"
            ],

            markOnlineOnConnect: false,

            connectTimeoutMs: 60000,

            defaultQueryTimeoutMs: 60000,

            keepAliveIntervalMs: 25000
        };


        if (version) {
            socketConfig.version = version;
        }


        const sock =
            makeWASocket(socketConfig);


        starting = false;


        /* =====================================================
           SAVE AUTH
        ===================================================== */

        sock.ev.on(
            "creds.update",
            saveCreds
        );


        /* =====================================================
           CONNECTION
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
                   QR
                ================================================= */

                if (qr) {

                    try {

                        currentQR =
                            await QRCode.toDataURL(
                                qr,
                                {
                                    width: 400,
                                    margin: 2
                                }
                            );


                        botStatus =
                            "MENUNGGU SCAN QR";


                        console.log("");
                        console.log(
                            "========================================"
                        );
                        console.log(
                            "📱 QR WHATSAPP TERSEDIA"
                        );
                        console.log(
                            "========================================"
                        );
                        console.log(
                            "Buka domain Railway kamu"
                        );
                        console.log(
                            "lalu scan QR tersebut."
                        );
                        console.log(
                            "========================================"
                        );
                        console.log("");

                    } catch (error) {

                        console.error(
                            "❌ Gagal membuat QR:",
                            error
                        );

                    }
                }


                /* =================================================
                   CONNECTING
                ================================================= */

                if (
                    connection === "connecting"
                ) {

                    botStatus =
                        "CONNECTING";

                    console.log(
                        "🔄 Connecting..."
                    );
                }


                /* =================================================
                   OPEN
                ================================================= */

                if (
                    connection === "open"
                ) {

                    currentQR = null;

                    botStatus = "ONLINE";

                    console.log("");
                    console.log(
                        "========================================"
                    );
                    console.log(
                        "✅ WHATSAPP BERHASIL TERTAUT"
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
                        "⚠️ WHATSAPP TERPUTUS"
                    );
                    console.log(
                        `Status: ${statusCode || "unknown"}`
                    );
                    console.log(
                        "========================================"
                    );


                    botStatus =
                        "DISCONNECTED";


                    /*
                     * Kalau logout permanen,
                     * jangan reconnect tanpa batas.
                     */

                    if (
                        statusCode ===
                        DisconnectReason.loggedOut
                    ) {

                        console.log(
                            "❌ WhatsApp logout."
                        );

                        botStatus =
                            "LOGGED OUT";

                        return;
                    }


                    if (
                        reconnectTimer
                    ) {

                        return;
                    }


                    console.log(
                        "🔄 Reconnect 7 detik lagi..."
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


                    if (!message.message) {
                        return;
                    }


                    if (
                        message.key?.fromMe
                    ) {
                        return;
                    }


                    const remoteJid =
                        message.key?.remoteJid;


                    if (
                        !remoteJid ||
                        !remoteJid.endsWith("@g.us")
                    ) {
                        return;
                    }


                    /* =================================================
                       EXCLUDED GROUP
                    ================================================= */

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

                        const handled =
                            await handleCommand(
                                sock,
                                message,
                                text
                            );


                        if (handled) {
                            return;
                        }

                    } catch (error) {

                        console.error(
                            "Command error:",
                            error
                        );
                    }


                    /* =================================================
                       BAD WORD
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


                        const count =
                            groupData[userId].length;


                        if (
                            count >=
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

                    }

                } catch (error) {

                    console.error(
                        "Message handler error:",
                        error
                    );

                }

            }
        );


    } catch (error) {

        starting = false;

        botStatus =
            "ERROR";


        console.error(
            "❌ START ERROR:",
            error
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

startBot();

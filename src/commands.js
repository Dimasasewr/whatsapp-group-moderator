const config = require("./config");

const {
    hasUsedInfo,
    markInfoUsed
} = require("./database");

async function handleCommand(
    sock,
    message,
    text
) {
    const groupId =
        message.key.remoteJid;

    const userId =
        message.key.participant;

    if (!text) {
        return false;
    }

    if (
        !text.startsWith(
            config.PREFIX
        )
    ) {
        return false;
    }

    const command =
        text
            .trim()
            .split(/\s+/)[0]
            .toLowerCase();

    /* =========================
       .INFO
    ========================= */

    if (command === ".info") {

        // Satu user hanya bisa berhasil
        // menggunakan .info satu kali
        if (hasUsedInfo(userId)) {

            await sock.sendMessage(
                groupId,
                {
                    text:
                        "ℹ️ Kamu sudah pernah menggunakan perintah .info.\n\n" +
                        "Perintah ini hanya dapat digunakan satu kali oleh setiap user."
                }
            );

            return true;
        }

        markInfoUsed(userId);

        const infoText = `
╭━━━〔 🤖 BOT INFO 〕━━━╮

🤖 Nama Bot
WhatsApp Group Moderator

👨‍💻 Dibuat Oleh
DIMAS PUTRA PRATAMA

🛡️ Fitur
• Auto Reply
• Anti Spam Stiker
• Filter Kata / Kalimat
• Sistem Peringatan
• Auto Kick Pelanggar
• Moderasi Grup
• Pengecualian Grup

⚠️ Sistem Pelanggaran

Pelanggaran pertama:
→ Pesan dihapus
→ Peringatan diberikan

Pelanggaran berikutnya:
→ Pesan dihapus
→ Anggota dikeluarkan

ℹ️ Ketentuan
Perintah .info hanya dapat
berhasil digunakan satu kali
oleh setiap user.

╰━━━━━━━━━━━━━━━━━━━━╯
`;

        await sock.sendMessage(
            groupId,
            {
                text: infoText
            }
        );

        return true;
    }

    /* =========================
       .PING
    ========================= */

    if (command === ".ping") {

        await sock.sendMessage(
            groupId,
            {
                text: "🏓 Pong!\nBot aktif."
            }
        );

        return true;
    }

    /* =========================
       .MENU
    ========================= */

    if (command === ".menu") {

        const menu = `
╭━━━〔 🤖 MENU BOT 〕━━━╮

📌 Perintah:

.info
→ Informasi bot

.ping
→ Cek status bot

.menu
→ Menampilkan menu

🛡️ Moderasi otomatis:

• Anti spam stiker
• Filter kata kasar
• Warning otomatis
• Kick otomatis

👨‍💻 DIMAS PUTRA PRATAMA

╰━━━━━━━━━━━━━━━━━━━━╯
`;

        await sock.sendMessage(
            groupId,
            {
                text: menu
            }
        );

        return true;
    }

    return false;
}

module.exports = {
    handleCommand
};

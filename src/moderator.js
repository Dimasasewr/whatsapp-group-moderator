const config = require("./config");

const {
    getViolation,
    addViolation,
    resetViolation
} = require("./database");

async function isGroupAdmin(sock, groupId, userId) {
    try {
        const metadata =
            await sock.groupMetadata(groupId);

        const participant =
            metadata.participants.find(
                p => p.id === userId
            );

        if (!participant) {
            return false;
        }

        return (
            participant.admin === "admin" ||
            participant.admin === "superadmin"
        );

    } catch (error) {
        console.error(
            "Gagal mengecek admin:",
            error
        );

        return false;
    }
}

async function deleteMessage(sock, message) {
    try {
        await sock.sendMessage(
            message.key.remoteJid,
            {
                delete: message.key
            }
        );

        return true;

    } catch (error) {
        console.error(
            "Gagal menghapus pesan:",
            error
        );

        return false;
    }
}

async function moderate(
    sock,
    message,
    reason
) {
    const groupId =
        message.key.remoteJid;

    const userId =
        message.key.participant;

    if (!groupId || !userId) {
        return;
    }

    // Grup yang dikecualikan
    if (
        config.EXCLUDED_GROUPS.includes(
            groupId
        )
    ) {
        return;
    }

    // Bot tidak dimoderasi
    if (
        config.IGNORE_BOT &&
        userId === sock.user.id
    ) {
        return;
    }

    // Admin tidak dimoderasi
    if (
        config.IGNORE_ADMINS &&
        await isGroupAdmin(
            sock,
            groupId,
            userId
        )
    ) {
        return;
    }

    await deleteMessage(
        sock,
        message
    );

    const violation =
        addViolation(
            groupId,
            userId
        );

    console.log(
        `[MODERATION] ${userId} | ${reason} | Pelanggaran: ${violation}`
    );

    // Pelanggaran pertama
    if (
        violation <= config.MAX_WARNINGS
    ) {
        await sock.sendMessage(
            groupId,
            {
                text:
                    `${config.WARNING_MESSAGE}\n\n` +
                    `Pelanggaran: ${reason}\n` +
                    `Jumlah pelanggaran: ${violation}`
            }
        );

        return;
    }

    // Pelanggaran berikutnya
    await sock.sendMessage(
        groupId,
        {
            text:
                `${config.KICK_MESSAGE}\n\n` +
                `Alasan: ${reason}`
        }
    );

    try {
        await sock.groupParticipantsUpdate(
            groupId,
            [userId],
            "remove"
        );

        resetViolation(
            groupId,
            userId
        );

    } catch (error) {
        console.error(
            "Gagal mengeluarkan anggota:",
            error
        );

        await sock.sendMessage(
            groupId,
            {
                text:
                    "❌ Bot gagal mengeluarkan anggota.\n" +
                    "Pastikan bot merupakan admin grup."
            }
        );
    }
}

module.exports = {
    moderate,
    isGroupAdmin
};

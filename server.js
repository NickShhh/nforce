require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, TextInputBuilder, ModalBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');

const app = express();
app.use(express.json());

const port = process.env.PORT;

// Configuración de la base de datos (Railway)
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool; // Declarada aquí para que sea accesible globalmente

// Discord Bot setup (movido antes de startApplication para mejor estructura)
const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const REPORT_CHANNEL_ID = process.env.REPORT_CHANNEL_ID;
const MOD_ROLES_IDS = process.env.MOD_ROLES_IDS ? process.env.MOD_ROLES_IDS.split(',') : [];

discordClient.once('ready', () => {
    console.log(`Bot de Discord listo como ${discordClient.user.tag}!`);
});

// Función para obtener el nombre de usuario de Roblox dado un userId
async function getRobloxUsername(userId) {
    try {
        const response = await axios.post(
            'https://users.roblox.com/v1/users',
            { userIds: [parseInt(userId)], excludeBannedUsers: false }
        );

        if (response.data && response.data.data && response.data.data.length > 0) {
            return response.data.data[0].name;
        }
    } catch (error) {
        console.error(`Error al obtener username de Roblox para ID ${userId}:`, error.message);
    }
    return `User_${userId}`; // Fallback si no se puede obtener el nombre
}

async function startApplication() {
    try {
        pool = mysql.createPool(dbConfig);
        console.log('Conectado al pool de la base de datos MySQL.');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS banned_players (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL UNIQUE,
                username VARCHAR(255) NOT NULL,
                reason TEXT NOT NULL,
                banned_by VARCHAR(255) NOT NULL,
                banned_by_id VARCHAR(255),
                ban_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Tabla banned_players asegurada/creada.');

        discordClient.login(process.env.DISCORD_BOT_TOKEN);

        const server = app.listen(port, () => {
            console.log(`Backend server corriendo en el puerto ${port}`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`Error: El puerto ${port} ya está en uso. Esta instancia saldrá.`);
                process.exit(1);
            } else {
                console.error('Error al iniciar el servidor Express:', err);
                process.exit(1);
            }
        });

    } catch (err) {
        console.error('Error FATAL al iniciar la aplicación (DB o servidor):', err);
        process.exit(1);
    }
}

// --- Rutas del API ---

// Ruta para recibir reportes de Roblox
app.post('/report', async (req, res) => {
    const data = req.body;
    console.log('Reporte recibido de Roblox:', data.playerUsername, 'Tipo:', data.detectionType);

    const thumbnailUrl = "https://i.imgur.com/HIhlNEk.png";
    const avatarUrl = "https://i0.wp.com/insightcrime.org/wp-content/uploads/2017/10/17-10-11-Brazil-Skull.jpg?w=350&quality=100&ssl=1";

    const embed = new EmbedBuilder()
        .setTitle("🚨 N-FORCE: Exploit Attempt Detected")
        .setColor(0xFF0000)
        .setThumbnail(thumbnailUrl)
        .addFields(
            {
                name: "👤 Player Profile",
                value: `**Username:** ${data.playerUsername}\n**Display Name:** ${data.playerDisplayName}\n**User ID:** ${data.playerUserId}\n**Account Age:** ${data.playerAccountAge} days\n**Premium:** ${data.playerPremium ? "Yes" : "No"}\n**Team:** ${data.playerTeam}\n**Device:** ${data.deviceUsed}`,
                inline: false
            },
            {
                name: "⏳ Session Information",
                value: `> Time in Server: ${data.sessionPlaytime}s\n> Game ID: ${data.gameId}\n> Place ID: ${data.placeId}`,
                inline: false
            },
            {
                name: `⚠️ Detection Type: **${data.detectionType || "Unknown"}**`,
                value: data.detectionDetails || "No specific details provided.",
                inline: false
            },
            {
                name: "📊 Behavior Analysis",
                value: data.behaviorAnalysis,
                inline: false
            },
            {
                name: "🗯️ 'Roast' Report",
                value: data.roastLine,
                inline: false
            }
        )
        .setFooter({ text: `Case logged by N-FORCE • ${new Date().toLocaleString()}` });

    const banButton = new ButtonBuilder()
        .setCustomId(`ban_${data.playerUserId}`)
        .setLabel('🚫 Ban Player')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(banButton);

    try {
        const channel = await discordClient.channels.fetch(REPORT_CHANNEL_ID);
        if (channel) {
            await channel.send({
                embeds: [embed],
                components: [row],
                username: "N-FORCE INTELLIGENCE",
                avatarURL: avatarUrl
            });
            res.status(200).send('Report sent to Discord.');
        } else {
            console.error('Canal de Discord no encontrado.');
            res.status(500).send('Error: Discord channel not found.');
        }
    } catch (error) {
        console.error('Error al enviar reporte a Discord:', error);
        res.status(500).send('Error sending report to Discord.');
    }
});


// --- Manejo de Interacciones de Discord (Botones y Comandos) ---

discordClient.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('ban_')) {
            const member = interaction.guild.members.cache.get(interaction.user.id);
            const hasModRole = MOD_ROLES_IDS.some(roleId => member.roles.cache.has(roleId));

            if (!hasModRole) {
                await interaction.reply({ content: 'You do not have permission to ban players.', ephemeral: true });
                return;
            }

            const userIdToBan = interaction.customId.split('_')[1];
            await interaction.showModal({
                customId: `banModal_${userIdToBan}`,
                title: `Ban Player ${userIdToBan}`,
                components: [
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('banReason')
                            .setLabel('Reason for ban:')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('Enter the reason for the ban here...')
                            .setRequired(true)
                    ),
                ],
            });
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('banModal_')) {
            const userIdToBan = interaction.customId.split('_')[1];
            const banReason = interaction.fields.getTextInputValue('banReason');
            const moderatorUsername = interaction.user.tag;
            const moderatorId = interaction.user.id;

            let playerUsername = await getRobloxUsername(userIdToBan);

            try {
                await pool.query(
                    'INSERT INTO banned_players (user_id, username, reason, banned_by, banned_by_id, ban_date) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE reason = VALUES(reason), banned_by = VALUES(banned_by), banned_by_id = VALUES(banned_by_id), ban_date = CURRENT_TIMESTAMP',
                    [userIdToBan, playerUsername, banReason, moderatorUsername, moderatorId]
                );

                await interaction.reply({ content: `Player **${userIdToBan}** (${playerUsername}) has been banned by ${moderatorUsername} for the reason: **${banReason}**.`, ephemeral: false });

                if (interaction.message) {
                    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
                    originalEmbed.addFields({
                        name: "✅ Ban Status",
                        value: `**Banned by:** ${moderatorUsername}\n**Reason:** ${banReason}\n**Date:** ${new Date().toLocaleString()}`,
                        inline: false
                    });
                    await interaction.message.edit({ embeds: [originalEmbed], components: [] });
                }

            } catch (error) {
                console.error('Error al banear jugador desde modal:', error);
                await interaction.reply({ content: 'There was an error trying to ban the player.', ephemeral: true });
            }
        }
    } else if (interaction.isCommand()) {
        const { commandName } = interaction;

        const member = interaction.guild.members.cache.get(interaction.user.id);
        const hasModRole = MOD_ROLES_IDS.some(roleId => member.roles.cache.has(roleId));

        if (!hasModRole && commandName !== 'help') { // Assuming 'help' command doesn't require mod role
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }

        switch (commandName) {
            case 'ban':
                const userIdBan = interaction.options.getString('userid');
                const reasonBan = interaction.options.getString('reason');
                const moderatorUsernameBan = interaction.user.tag;
                const moderatorIdBan = interaction.user.id;

                const usernameBan = await getRobloxUsername(userIdBan);

                try {
                    await pool.query(
                        'INSERT INTO banned_players (user_id, username, reason, banned_by, banned_by_id, ban_date) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE reason = VALUES(reason), banned_by = VALUES(banned_by), banned_by_id = VALUES(banned_by_id), ban_date = CURRENT_TIMESTAMP',
                        [userIdBan, usernameBan, reasonBan, moderatorUsernameBan, moderatorIdBan]
                    );
                    await interaction.reply({ content: `Player **${usernameBan}** (ID: ${userIdBan}) has been banned by ${moderatorUsernameBan} for the reason: **${reasonBan}**.`, ephemeral: false });
                } catch (error) {
                    console.error('Error al banear desde comando:', error);
                    await interaction.reply({ content: 'There was an error trying to ban the player.', ephemeral: true });
                }
                break;

            case 'unban':
                const userIdUnban = interaction.options.getString('userid');
                const usernameUnban = await getRobloxUsername(userIdUnban);
                try {
                    const [result] = await pool.query('DELETE FROM banned_players WHERE user_id = ?', [userIdUnban]);
                    if (result.affectedRows > 0) {
                        await interaction.reply({ content: `Player **${usernameUnban}** (ID: ${userIdUnban}) has been unbanned.`, ephemeral: false });
                    } else {
                        await interaction.reply({ content: `Player with ID **${userIdUnban}** was not found in the banned list.`, ephemeral: true });
                    }
                } catch (error) {
                    console.error('Error al desbanear:', error);
                    await interaction.reply({ content: 'There was an error trying to unban the player.', ephemeral: true });
                }
                break;

            case 'listbans':
                try {
                    const [rows] = await pool.query('SELECT user_id, username, reason, banned_by, ban_date FROM banned_players ORDER BY ban_date DESC LIMIT 10');
                    if (rows.length === 0) {
                        await interaction.reply({ content: 'No players are currently banned.', ephemeral: false });
                        return;
                    }

                    let banList = rows.map(row =>
                        `**${row.username}** (ID: ${row.user_id})\nReason: *${row.reason}*\nBanned by: ${row.banned_by} on ${new Date(row.ban_date).toLocaleString()}\n---`
                    ).join('\n');

                    await interaction.reply({ content: `**Banned Players List (last 10):**\n\n${banList}`, ephemeral: false });
                } catch (error) {
                    console.error('Error al listar baneos:', error);
                    await interaction.reply({ content: 'There was an error getting the ban list.', ephemeral: true });
                }
                break;

            case 'topbans':
                try {
                    const [rows] = await pool.query('SELECT banned_by, COUNT(*) AS banCount FROM banned_players GROUP BY banned_by ORDER BY banCount DESC LIMIT 5');
                    if (rows.length === 0) {
                        await interaction.reply({ content: 'No one has banned anyone yet.', ephemeral: false });
                        return;
                    }

                    let topBansList = rows.map((row, index) =>
                        `${index + 1}. **${row.banned_by}**: ${row.banCount} bans`
                    ).join('\n');

                    await interaction.reply({ content: `**Top 5 Moderators with Most Bans:**\n\n${topBansList}`, ephemeral: false });
                } catch (error) {
                    console.error('Error al obtener top baneos:', error);
                    await interaction.reply({ content: 'There was an error getting the top bans.', ephemeral: true });
                }
                break;

            default:
                await interaction.reply({ content: 'Unknown command.', ephemeral: true });
        }
    }
});

startApplication();

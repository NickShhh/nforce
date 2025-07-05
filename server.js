require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, TextInputBuilder, ModalBuilder } = require('discord.js');

const app = express();
const port = process.env.PORT;

// Configuración de la base de datos (Railway)
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT, // Asegúrate de que esta línea esté presente
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool; // Declarada aquí para que sea accesible globalmente

// *** Mueve la inicialización de la base de datos al inicio, antes del bot ***
async function startApplication() {
    try {
        pool = mysql.createPool(dbConfig);
        console.log('Conectado al pool de la base de datos MySQL.');

        // Crear la tabla banned_players si no existe
        await pool.query(`
            CREATE TABLE IF NOT EXISTS banned_players (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL UNIQUE,
                username VARCHAR(255) NOT NULL,
                reason TEXT NOT NULL,
                banned_by VARCHAR(255) NOT NULL,
                ban_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Tabla banned_players asegurada/creada.');

        // Ahora que la DB está lista, podemos iniciar el bot de Discord
        discordClient.login(process.env.DISCORD_BOT_TOKEN);

        // Y también el servidor Express
        const server = app.listen(port, () => {
            console.log(`Backend server corriendo en el puerto ${port}`);
        });

    } catch (err) {
        console.error('Error FATAL al iniciar la aplicación (DB o servidor):', err);
        process.exit(1); // Sale del proceso si no puede conectar a la DB
    }
}

// Discord Bot setup
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

discordClient.once('ready', () => { // Ya no necesitamos await initializeDatabase() aquí
    console.log(`Bot de Discord listo como ${discordClient.user.tag}!`);
});



// --- Rutas del API ---

// Ruta para recibir reportes de Roblox
app.post('/report', async (req, res) => {
    const data = req.body;
    console.log('Reporte recibido de Roblox:', data.playerUsername, 'Tipo:', data.detectionType);

    const thumbnailUrl = "https://i.imgur.com/HIhlNEk.png"; 
    const avatarUrl = "https://i0.wp.com/insightcrime.org/wp-content/uploads/2017/10/17-10-11-Brazil-Skull.jpg?w=350&quality=100&ssl=1"; 

    const embed = new EmbedBuilder()
        .setTitle("🚨 N-FORCE: Intento de Exploit Detectado") // Título más general
        .setColor(0xFF0000)
        .setThumbnail(thumbnailUrl)
        .addFields(
            {
                name: "👤 Perfil del Jugador",
                value: `**Usuario:** ${data.playerUsername}\n**Nombre Visible:** ${data.playerDisplayName}\n**ID de Usuario:** ${data.playerUserId}\n**Edad de la Cuenta:** ${data.playerAccountAge} días\n**Premium:** ${data.playerPremium ? "Sí" : "No"}\n**Equipo:** ${data.playerTeam}\n**Dispositivo:** ${data.deviceUsed}`,
                inline: false
            },
            {
                name: "⏳ Información de Sesión",
                value: `> Tiempo en servidor: ${data.sessionPlaytime}s\n> ID del Juego: ${data.gameId}\n> ID del Lugar: ${data.placeId}`,
                inline: false
            },
            // ! NUEVOS CAMPOS DE DETECCIÓN
            {
                name: `⚠️ Tipo de Detección: **${data.detectionType || "Desconocido"}**`,
                value: data.detectionDetails || "No se proporcionaron detalles específicos.",
                inline: false
            },
            {
                name: "📊 Análisis de Comportamiento",
                value: data.behaviorAnalysis,
                inline: false
            },
            {
                name: "🗯️ Informe de 'Roast'",
                value: data.roastLine,
                inline: false
            }
        )
        .setFooter({ text: `Caso registrado por N-FORCE • ${new Date().toLocaleString()}` });

    const banButton = new ButtonBuilder()
        .setCustomId(`ban_${data.playerUserId}`)
        .setLabel('🚫 Banear Jugador')
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
            res.status(200).send('Reporte enviado a Discord.');
        } else {
            console.error('Canal de Discord no encontrado.');
            res.status(500).send('Error: Canal de Discord no encontrado.');
        }
    } catch (error) {
        console.error('Error al enviar reporte a Discord:', error);
        res.status(500).send('Error al enviar reporte a Discord.');
    }
});


// --- Manejo de Interacciones de Discord (Botones y Comandos) ---

discordClient.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('ban_')) {
            // Verificar si el usuario tiene los roles de moderador
            const member = interaction.guild.members.cache.get(interaction.user.id);
            const hasModRole = MOD_ROLES_IDS.some(roleId => member.roles.cache.has(roleId));

            if (!hasModRole) {
                await interaction.reply({ content: 'No tienes permisos para banear jugadores.', ephemeral: true });
                return;
            }

            const userIdToBan = interaction.customId.split('_')[1];
            await interaction.showModal({
                customId: `banModal_${userIdToBan}`,
                title: `Banear Jugador ${userIdToBan}`,
                components: [
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('banReason')
                            .setLabel('Razón del baneo:')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('Ingresa la razón del baneo aquí...')
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

            try {
                // Obtener username del jugador desde un reporte previo o directamente de Roblox si tuvieras un sistema de cache
                // Por simplicidad, aquí usaremos el userId como proxy de username si no lo tenemos inmediatamente
                let playerUsername = `Usuario_${userIdToBan}`; // Placeholder, idealmente deberías obtener el nombre real

                // Si quieres obtener el username real, puedes hacer una consulta adicional a Roblox o si tu sistema de reportes envía el username en el ID del botón.
                // Para este ejemplo, asumiremos que si baneas desde un reporte, el embed ya tiene el nombre.
                // Si no, puedes buscar en la base de datos por el userId o pasar el username desde el botón.

                // Intenta obtener el username de la interacción original del reporte si es posible
                const originalMessage = interaction.message;
                if (originalMessage && originalMessage.embeds.length > 0) {
                    const playerProfileField = originalMessage.embeds[0].fields.find(field => field.name === "👤 Perfil del Jugador");
                    if (playerProfileField) {
                        const match = playerProfileField.value.match(/ID de Usuario:\s*(\d+)/);
                        if (match && match[1] === userIdToBan) {
                            const usernameMatch = playerProfileField.value.match(/Usuario:\s*(\S+)/);
                            if (usernameMatch) {
                                playerUsername = usernameMatch[1];
                            }
                        }
                    }
                }

                await pool.query(
                    'INSERT INTO banned_players (userId, username, reason, bannedBy, bannedById) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), bannedBy = VALUES(bannedBy), bannedById = VALUES(bannedById), timestamp = CURRENT_TIMESTAMP',
                    [userIdToBan, playerUsername, banReason, moderatorUsername, moderatorId]
                );

                await interaction.reply({ content: `Jugador con ID **${userIdToBan}** (${playerUsername}) ha sido baneado por ${moderatorUsername} por la razón: **${banReason}**.`, ephemeral: false });

                // Editar el mensaje original del reporte para indicar que el jugador fue baneado
                if (interaction.message) {
                    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
                    originalEmbed.addFields({
                        name: "✅ Estado de Baneo",
                        value: `**Baneado por:** ${moderatorUsername}\n**Razón:** ${banReason}\n**Fecha:** ${new Date().toLocaleString()}`,
                        inline: false
                    });
                    await interaction.message.edit({ embeds: [originalEmbed], components: [] }); // Eliminar el botón de baneo
                }

            } catch (error) {
                console.error('Error al banear jugador:', error);
                await interaction.reply({ content: 'Hubo un error al intentar banear al jugador.', ephemeral: true });
            }
        }
    } else if (interaction.isCommand()) {
        // Manejo de comandos (ban, unban, listbans, topbans)
        const { commandName } = interaction;

        // Verificar si el usuario tiene los roles de moderador para los comandos
        const member = interaction.guild.members.cache.get(interaction.user.id);
        const hasModRole = MOD_ROLES_IDS.some(roleId => member.roles.cache.has(roleId));

        if (!hasModRole && commandName !== 'help') { // Permitir help para todos
            await interaction.reply({ content: 'No tienes permisos para usar este comando.', ephemeral: true });
            return;
        }

        switch (commandName) {
            case 'ban':
                const userIdBan = interaction.options.getString('userid');
                const usernameBan = interaction.options.getString('username') || `Usuario_${userIdBan}`; // Obtener username si se proporciona, sino un placeholder
                const reasonBan = interaction.options.getString('reason');
                const moderatorUsernameBan = interaction.user.tag;
                const moderatorIdBan = interaction.user.id;

                try {
                    await pool.query(
                        'INSERT INTO banned_players (userId, username, reason, bannedBy, bannedById) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), bannedBy = VALUES(bannedBy), bannedById = VALUES(bannedById), timestamp = CURRENT_TIMESTAMP',
                        [userIdBan, usernameBan, reasonBan, moderatorUsernameBan, moderatorIdBan]
                    );
                    await interaction.reply({ content: `Jugador **${usernameBan}** (ID: ${userIdBan}) ha sido baneado por ${moderatorUsernameBan} por la razón: **${reasonBan}**.`, ephemeral: false });
                } catch (error) {
                    console.error('Error al banear desde comando:', error);
                    await interaction.reply({ content: 'Hubo un error al intentar banear al jugador.', ephemeral: true });
                }
                break;

            case 'unban':
                const userIdUnban = interaction.options.getString('userid');
                try {
                    const [result] = await pool.query('DELETE FROM banned_players WHERE userId = ?', [userIdUnban]);
                    if (result.affectedRows > 0) {
                        await interaction.reply({ content: `Jugador con ID **${userIdUnban}** ha sido desbaneado.`, ephemeral: false });
                    } else {
                        await interaction.reply({ content: `El jugador con ID **${userIdUnban}** no se encontró en la lista de baneados.`, ephemeral: true });
                    }
                } catch (error) {
                    console.error('Error al desbanear:', error);
                    await interaction.reply({ content: 'Hubo un error al intentar desbanear al jugador.', ephemeral: true });
                }
                break;

            case 'listbans':
                try {
                    const [rows] = await pool.query('SELECT userId, username, reason, bannedBy, timestamp FROM banned_players ORDER BY timestamp DESC LIMIT 10'); // Limitar a 10 para no sobrecargar
                    if (rows.length === 0) {
                        await interaction.reply({ content: 'No hay jugadores baneados actualmente.', ephemeral: false });
                        return;
                    }

                    let banList = rows.map(row => 
                        `**${row.username}** (ID: ${row.userId})\nRazón: *${row.reason}*\nBaneado por: ${row.bannedBy} el ${new Date(row.timestamp).toLocaleString()}\n---`
                    ).join('\n');

                    await interaction.reply({ content: `**Lista de Jugadores Baneados (últimos 10):**\n\n${banList}`, ephemeral: false });
                } catch (error) {
                    console.error('Error al listar baneos:', error);
                    await interaction.reply({ content: 'Hubo un error al obtener la lista de baneos.', ephemeral: true });
                }
                break;

            case 'topbans':
                try {
                    const [rows] = await pool.query('SELECT bannedBy, COUNT(*) AS banCount FROM banned_players GROUP BY bannedBy ORDER BY banCount DESC LIMIT 5');
                    if (rows.length === 0) {
                        await interaction.reply({ content: 'Nadie ha baneado a nadie todavía.', ephemeral: false });
                        return;
                    }

                    let topBansList = rows.map((row, index) =>
                        `${index + 1}. **${row.bannedBy}**: ${row.banCount} baneos`
                    ).join('\n');

                    await interaction.reply({ content: `**Top 5 Moderadores con más Baneos:**\n\n${topBansList}`, ephemeral: false });
                } catch (error) {
                    console.error('Error al obtener top baneos:', error);
                    await interaction.reply({ content: 'Hubo un error al obtener el top de baneos.', ephemeral: true });
                }
                break;

            default:
                await interaction.reply({ content: 'Comando desconocido.', ephemeral: true });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend server corriendo en el puerto ${PORT}`);
});

startApplication();

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
// ¡IMPORTANTE! Asegúrate de que TextInputStyle esté importado aquí
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, TextInputBuilder, ModalBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios'); // ¡IMPORTANTE! Asegúrate de que axios esté importado

const app = express();
// ¡IMPORTANTE! Middleware para parsear JSON en las solicitudes POST.
// Esto es CRUCIAL para que app.post('/report') reciba los datos correctamente.
app.use(express.json());

const port = process.env.PORT; // Ya está definido aquí, no necesitas redefinir PORT al final.

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

// --- NUEVA FUNCIÓN: Obtener nombre de usuario de Roblox ---
async function getRobloxUsername(userId) {
    try {
        // La API de Roblox para obtener información de usuarios por ID
        const response = await axios.post(
            'https://users.roblox.com/v1/users',
            { userIds: [parseInt(userId)], excludeBannedUsers: false }
        );

        if (response.data && response.data.data && response.data.data.length > 0) {
            return response.data.data[0].name; // Devuelve el username real
        }
    } catch (error) {
        console.error(`Error al obtener username de Roblox para ID ${userId}:`, error.message);
        // Si hay un error en la API, o el usuario no existe, devuelve un placeholder
    }
    return `Usuario_${userId}`; // Fallback si no se puede obtener el nombre
}

// *** Mueve la inicialización de la base de datos y el inicio del servidor/bot al inicio ***
async function startApplication() {
    try {
        pool = mysql.createPool(dbConfig);
        console.log('Conectado al pool de la base de datos MySQL.');

        // ¡IMPORTANTE! Modificación de la tabla para incluir banned_by_id
        // Si ya tienes datos en tu tabla y no quieres perderlos,
        // puedes ejecutar un ALTER TABLE manualmente en Railway:
        // ALTER TABLE banned_players ADD COLUMN banned_by_id VARCHAR(255);
        // Si no tienes datos importantes, puedes dejar que el script la cree.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS banned_players (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL UNIQUE,
                username VARCHAR(255) NOT NULL,
                reason TEXT NOT NULL,
                banned_by VARCHAR(255) NOT NULL,
                banned_by_id VARCHAR(255), -- ¡NUEVA COLUMNA! Para almacenar el ID del moderador
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

        // Manejo de errores del servidor para EADDRINUSE (aunque ya lo corregimos en el código)
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
        process.exit(1); // Sale del proceso si no puede conectar a la DB
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
        .setTitle("🚨 N-FORCE: Intento de Exploit Detectado")
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
                username: "N-FORCE INTELLIGENCE", // Esto es para el webhook, no el bot
                avatarURL: avatarUrl // Esto es para el webhook, no el bot
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

            // --- CAMBIO AQUÍ: Obtener el username automáticamente ---
            let playerUsername = await getRobloxUsername(userIdToBan);
            // --- FIN CAMBIO ---

            // El código para intentar obtener el username del embed original es bueno,
            // pero si ya estamos llamando a la API de Roblox, esta parte podría ser redundante
            // o usarse como fallback secundario si la API falla de forma inesperada.
            // Por ahora, lo dejamos comentado para priorizar la llamada a la API.
            /*
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
            */

            try {
                // ¡IMPORTANTE! Ajuste de nombres de columnas y adición de banned_by_id
                await pool.query(
                    'INSERT INTO banned_players (user_id, username, reason, banned_by, banned_by_id, ban_date) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE reason = VALUES(reason), banned_by = VALUES(banned_by), banned_by_id = VALUES(banned_by_id), ban_date = CURRENT_TIMESTAMP',
                    [userIdToBan, playerUsername, banReason, moderatorUsername, moderatorId]
                );

                await interaction.reply({ content: `Jugador con ID **${userIdToBan}** (${playerUsername}) ha sido baneado por ${moderatorUsername} por la razón: **${banReason}**.`, ephemeral: false });

                if (interaction.message) {
                    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
                    originalEmbed.addFields({
                        name: "✅ Estado de Baneo",
                        value: `**Baneado por:** ${moderatorUsername}\n**Razón:** ${banReason}\n**Fecha:** ${new Date().toLocaleString()}`,
                        inline: false
                    });
                    await interaction.message.edit({ embeds: [originalEmbed], components: [] });
                }

            } catch (error) {
                console.error('Error al banear jugador desde modal:', error); // Mensaje más específico
                await interaction.reply({ content: 'Hubo un error al intentar banear al jugador.', ephemeral: true });
            }
        }
    } else if (interaction.isCommand()) {
        const { commandName } = interaction;

        const member = interaction.guild.members.cache.get(interaction.user.id);
        const hasModRole = MOD_ROLES_IDS.some(roleId => member.roles.cache.has(roleId));

        if (!hasModRole && commandName !== 'help') {
            await interaction.reply({ content: 'No tienes permisos para usar este comando.', ephemeral: true });
            return;
        }

        switch (commandName) {
            case 'ban':
                const userIdBan = interaction.options.getString('userid');
                const reasonBan = interaction.options.getString('reason');
                const moderatorUsernameBan = interaction.user.tag;
                const moderatorIdBan = interaction.user.id; // Obtener el ID del moderador

                // --- CAMBIO AQUÍ: Obtener el username automáticamente ---
                const usernameBan = await getRobloxUsername(userIdBan);
                // --- FIN CAMBIO ---

                try {
                    // ¡IMPORTANTE! Ajuste de nombres de columnas y adición de banned_by_id
                    await pool.query(
                        'INSERT INTO banned_players (user_id, username, reason, banned_by, banned_by_id, ban_date) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE reason = VALUES(reason), banned_by = VALUES(banned_by), banned_by_id = VALUES(banned_by_id), ban_date = CURRENT_TIMESTAMP',
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
                // --- CAMBIO AQUÍ: Obtener el username automáticamente ---
                const usernameUnban = await getRobloxUsername(userIdUnban);
                // --- FIN CAMBIO ---
                try {
                    // ¡IMPORTANTE! Ajuste de nombre de columna userId a user_id
                    const [result] = await pool.query('DELETE FROM banned_players WHERE user_id = ?', [userIdUnban]);
                    if (result.affectedRows > 0) {
                        await interaction.reply({ content: `Jugador **${usernameUnban}** (ID: ${userIdUnban}) ha sido desbaneado.`, ephemeral: false });
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
                    // ¡IMPORTANTE! Ajuste de nombres de columnas
                    const [rows] = await pool.query('SELECT user_id, username, reason, banned_by, ban_date FROM banned_players ORDER BY ban_date DESC LIMIT 10');
                    if (rows.length === 0) {
                        await interaction.reply({ content: 'No hay jugadores baneados actualmente.', ephemeral: false });
                        return;
                    }

                    let banList = rows.map(row =>
                        `**${row.username}** (ID: ${row.user_id})\nRazón: *${row.reason}*\nBaneado por: ${row.banned_by} el ${new Date(row.ban_date).toLocaleString()}\n---`
                    ).join('\n');

                    await interaction.reply({ content: `**Lista de Jugadores Baneados (últimos 10):**\n\n${banList}`, ephemeral: false });
                } catch (error) {
                    console.error('Error al listar baneos:', error);
                    await interaction.reply({ content: 'Hubo un error al obtener la lista de baneos.', ephemeral: true });
                }
                break;

            case 'topbans':
                try {
                    // ¡IMPORTANTE! Ajuste de nombres de columnas
                    const [rows] = await pool.query('SELECT banned_by, COUNT(*) AS banCount FROM banned_players GROUP BY banned_by ORDER BY banCount DESC LIMIT 5');
                    if (rows.length === 0) {
                        await interaction.reply({ content: 'Nadie ha baneado a nadie todavía.', ephemeral: false });
                        return;
                    }

                    let topBansList = rows.map((row, index) =>
                        `${index + 1}. **${row.banned_by}**: ${row.banCount} baneos`
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

// Llama a startApplication una vez para iniciar todo
startApplication();

require('dotenv').config(); // Para cargar variables de entorno (útil en desarrollo local, Railway/Render las carga automáticamente)
const express = require('express');
const mysql = require('mysql2/promise'); // Usamos la versión con promesas
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, TextInputBuilder, ModalBuilder, TextInputStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const axios = require('axios');

const app = express();
app.use(express.json()); // Middleware para parsear JSON en las peticiones
app.use(express.urlencoded({ extended: true })); // Middleware para parsear datos de URL-encoded (si los usaras)

const port = process.env.PORT || 3000; // Usa el puerto de entorno, o 3000 por defecto

// Configuración de la base de datos (Railway)
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT, // Asegúrate de que esta variable de entorno esté configurada
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool; // Declarado aquí para que sea accesible globalmente

// --- Discord Bot Setup ---
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // El ID de tu aplicación/bot de Discord
const GUILD_ID = process.env.GUILD_ID;   // El ID del servidor (guild) donde registrarás los comandos

const REPORT_CHANNEL_ID = process.env.REPORT_CHANNEL_ID;
// MOD_ROLES_IDS debe ser una cadena de IDs de roles separados por comas, ej: "12345,67890"
const MOD_ROLES_IDS = process.env.MOD_ROLES_IDS ? process.env.MOD_ROLES_IDS.split(',').map(id => id.trim()) : [];

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,           // Necesario para información del servidor
        GatewayIntentBits.GuildMessages,    // Necesario para detectar mensajes
        GatewayIntentBits.MessageContent,   // CRUCIAL: Necesario para leer el contenido de los mensajes (para comandos basados en prefijos si los tuvieras)
        GatewayIntentBits.GuildMembers,     // Necesario para obtener roles de miembros
        GatewayIntentBits.DirectMessages,   // Opcional, si quieres que el bot responda a DMs
    ]
});

discordClient.once('ready', async () => {
    console.log(`Bot de Discord listo como ${discordClient.user.tag}!`);

    // --- Registrar comandos de Slash (si aún no lo has hecho) ---
    const commands = [
        new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Banea a un usuario de Roblox.')
            .addStringOption(option =>
                option.setName('userid')
                    .setDescription('El UserID de Roblox del jugador a banear.')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('La razón del baneo.')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('unban')
            .setDescription('Desbanea a un usuario de Roblox.')
            .addStringOption(option =>
                option.setName('userid')
                    .setDescription('El UserID de Roblox del jugador a desbanear.')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('checkban')
            .setDescription('Verifica el estado de baneo de un usuario de Roblox.')
            .addStringOption(option =>
                option.setName('userid')
                    .setDescription('El UserID de Roblox del jugador a verificar.')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('listbans')
            .setDescription('Lista los baneos más recientes.'),
        new SlashCommandBuilder()
            .setName('topbans')
            .setDescription('Muestra los moderadores con más baneos.'),
        new SlashCommandBuilder()
            .setName('help')
            .setDescription('Muestra los comandos disponibles.'),
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

    try {
        console.log('Empezando a registrar comandos de aplicación (/)');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), // Para comandos de gremio (se actualizan más rápido)
            // Routes.applicationCommands(CLIENT_ID), // Para comandos globales (tardan hasta 1 hora en propagarse)
            { body: commands },
        );
        console.log('Comandos de aplicación (/) registrados exitosamente.');
    } catch (error) {
        console.error('Error al registrar comandos de aplicación (/). Asegúrate de CLIENT_ID y GUILD_ID son correctos y el bot tiene los permisos necesarios:', error);
    }
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

        // Asegurar que la tabla banned_players existe
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

        // Iniciar sesión del bot de Discord
        discordClient.login(DISCORD_BOT_TOKEN).catch(err => {
            console.error("Error al iniciar el bot de Discord:", err);
            console.error("Asegúrate de que DISCORD_BOT_TOKEN es correcto y los Intenciones (Intents) están activados en el Portal de Desarrolladores de Discord (MESSAGE CONTENT INTENT, GUILD MEMBERS).");
            process.exit(1); // Salir si el bot no puede iniciar sesión
        });

        // Iniciar el servidor Express
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
        process.exit(1); // Asegurar que la aplicación se detiene si hay un error crítico al inicio
    }
}

// --- Rutas del API para Roblox ---

// Ruta para recibir reportes de Roblox (detecciones de anti-cheat)
app.post('/report', async (req, res) => {
    const data = req.body;
    console.log('Reporte recibido de Roblox:', data.playerUsername, 'Tipo:', data.detectionType);

    const thumbnailUrl = "https://i.imgur.com/HIhlNEk.png";
    const avatarUrl = "https://i0.wp.com/insightcrime.org/wp-content/uploads/2017/10/17-10-11-Brazil-Skull.jpg?w=350&quality=100&ssl=1";

    const embed = new EmbedBuilder()
        .setTitle("🚨 N-FORCE: Exploit Attempt Detected")
        .setColor(0xFF0000) // Rojo
        .setThumbnail(thumbnailUrl)
        .addFields(
            {
                name: "👤 Player Profile",
                // Asegúrate de que todos estos valores tengan un fallback, incluso si son solo para depuración
                value: `**Username:** ${data.playerUsername || "N/A"}\n` +
                       `**Display Name:** ${data.playerDisplayName || "N/A"}\n` +
                       `**User ID:** ${data.playerUserId || "N/A"}\n` +
                       `**Account Age:** ${data.playerAccountAge || "N/A"} days\n` + // Added fallback
                       `**Premium:** ${data.playerPremium ? "Yes" : "No"}\n` +
                       `**Team:** ${data.playerTeam || "N/A"}\n` + // Added fallback
                       `**Device:** ${data.deviceUsed || "N/A"}`, // Added fallback
                inline: false
            },
            {
                name: "⏳ Session Information",
                // Asegúrate de que todos estos valores tengan un fallback
                value: `> Time in Server: ${data.sessionPlaytime || "N/A"}s\n` + // Added fallback
                       `> Game ID: ${data.gameId || "N/A"}\n` + // Added fallback
                       `> Place ID: ${data.placeId || "N/A"}`, // Added fallback
                inline: false
            },
            {
                name: `⚠️ Detection Type: **${data.detectionType || "Unknown"}**`,
                // Este ya tenía un fallback, pero lo confirmo
                value: data.detectionDetails || "No specific details provided.",
                inline: false
            },
            {
                name: "📊 Behavior Analysis",
                // Este es uno de los que causaba problemas, con fallback
                value: data.behaviorAnalysis || "No behavior analysis provided.",
                inline: false
            },
            {
                name: "🗯️ 'Roast' Report",
                // Este es el otro que causaba problemas, con fallback
                value: data.roastLine || "No specific 'roast' report.",
                inline: false
            }
        )
        .setFooter({ text: `Case logged by N-FORCE • ${new Date().toLocaleString()}` });

    const banButton = new ButtonBuilder()
        .setCustomId(`ban_${data.playerUserId || 'unknown_id'}`) // Fallback for customId too
        .setLabel('🚫 Ban Player')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(banButton);

    try {
        const channel = await discordClient.channels.fetch(REPORT_CHANNEL_ID);
        if (channel) {
            await channel.send({
                embeds: [embed],
                components: [row],
            });
            res.status(200).send('Report sent to Discord.');
        } else {
            console.error('Canal de Discord no encontrado. Asegúrate de que REPORT_CHANNEL_ID es correcto y el bot está en el servidor.');
            res.status(500).send('Error: Discord channel not found.');
        }
    } catch (error) {
        console.error('Error al enviar reporte a Discord:', error);
        // Envía una respuesta de error al remitente de Roblox
        res.status(500).send(`Error sending report to Discord: ${error.message}`);
    }
});

// Ruta para que Roblox verifique el estado de baneo de un jugador
app.post('/checkBanStatus', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'UserID is required.' });
    }

    try {
        // user_id es VARCHAR en la DB, así que no es necesario parseInt
        const [rows] = await pool.query('SELECT reason FROM banned_players WHERE user_id = ?', [userId]);
        if (rows.length > 0) {
            res.status(200).json({ isBanned: true, reason: rows[0].reason });
        } else {
            res.status(200).json({ isBanned: false });
        }
    } catch (error) {
        console.error(`Error al verificar estado de baneo para UserID ${userId}:`, error);
        res.status(500).json({ isBanned: false, error: 'Database error.' });
    }
});

// Ruta de bienvenida simple para verificar que el servidor está funcionando
app.get('/', (req, res) => {
    res.send('N-FORCE Anti-Cheat Backend está funcionando. Envía POST a /report o /checkBanStatus.');
});


// --- Manejo de Interacciones de Discord (Botones y Comandos de Slash) ---

discordClient.on('interactionCreate', async interaction => {
    // Función de ayuda para verificar si el usuario tiene un rol de moderador
    const hasModRole = (member) => {
        if (!member || !member.roles) return false;
        return MOD_ROLES_IDS.some(roleId => member.roles.cache.has(roleId));
    };

    if (interaction.isButton()) {
        if (interaction.customId.startsWith('ban_')) {
            const member = interaction.guild.members.cache.get(interaction.user.id);
            if (!member || !hasModRole(member)) {
                await interaction.reply({ content: 'No tienes permiso para banear jugadores.', ephemeral: true });
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
                            .setLabel('Razón para el baneo:')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('Ingresa la razón del baneo aquí...')
                            .setRequired(true)
                    ),
                ],
            });
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('banModal_')) {
            await interaction.deferReply({ ephemeral: true }); // Deferir la respuesta ya que puede tardar un poco
            const userIdToBan = interaction.customId.split('_')[1];
            const banReason = interaction.fields.getTextInputValue('banReason');
            const moderatorUsername = interaction.user.tag;
            const moderatorId = interaction.user.id;

            let playerUsername = await getRobloxUsername(userIdToBan);

            try {
                await pool.query(
                    'INSERT INTO banned_players (user_id, username, reason, banned_by, banned_by_id, ban_date) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE username = VALUES(username), reason = VALUES(reason), banned_by = VALUES(banned_by), banned_by_id = VALUES(banned_by_id), ban_date = CURRENT_TIMESTAMP',
                    [userIdToBan, playerUsername, banReason, moderatorUsername, moderatorId]
                );

                await interaction.editReply({ content: `✅ Jugador **${userIdToBan}** (${playerUsername}) ha sido baneado por ${moderatorUsername} por la razón: **${banReason}**.`, ephemeral: false });

                // Editar el mensaje original de reporte si existe
                if (interaction.message) {
                    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
                    originalEmbed.addFields({
                        name: "✅ Ban Status",
                        value: `**Banned by:** ${moderatorUsername}\n**Reason:** ${banReason}\n**Date:** ${new Date().toLocaleString()}`,
                        inline: false
                    });
                    // Eliminar el botón después de banear
                    await interaction.message.edit({ embeds: [originalEmbed], components: [] }).catch(e => console.error("Error al editar mensaje original:", e));
                }

            } catch (error) {
                console.error('Error al banear jugador desde modal:', error);
                await interaction.editReply({ content: 'Hubo un error al intentar banear al jugador.', ephemeral: true });
            }
        }
    } else if (interaction.isCommand()) {
        const { commandName } = interaction;

        const member = interaction.guild.members.cache.get(interaction.user.id);
        // El comando 'help' no requiere rol de mod, los demás sí
        if (!hasModRole(member) && commandName !== 'help') {
            await interaction.reply({ content: 'No tienes permiso para usar este comando.', ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true }); // Deferir para todos los comandos

        switch (commandName) {
            case 'ban':
                const userIdBan = interaction.options.getString('userid');
                const reasonBan = interaction.options.getString('reason');
                const moderatorUsernameBan = interaction.user.tag;
                const moderatorIdBan = interaction.user.id;

                const usernameBan = await getRobloxUsername(userIdBan);

                try {
                    await pool.query(
                        'INSERT INTO banned_players (user_id, username, reason, banned_by, banned_by_id, ban_date) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE username = VALUES(username), reason = VALUES(reason), banned_by = VALUES(banned_by), banned_by_id = VALUES(banned_by_id), ban_date = CURRENT_TIMESTAMP',
                        [userIdBan, usernameBan, reasonBan, moderatorUsernameBan, moderatorIdBan]
                    );
                    await interaction.editReply({ content: `✅ Jugador **${usernameBan}** (ID: ${userIdBan}) ha sido baneado por ${moderatorUsernameBan} por la razón: **${reasonBan}**.`, ephemeral: false });
                } catch (error) {
                    console.error('Error al banear desde comando:', error);
                    await interaction.editReply({ content: 'Hubo un error al intentar banear al jugador.', ephemeral: true });
                }
                break;

            case 'unban':
                const userIdUnban = interaction.options.getString('userid');
                const usernameUnban = await getRobloxUsername(userIdUnban);
                try {
                    const [result] = await pool.query('DELETE FROM banned_players WHERE user_id = ?', [userIdUnban]);
                    if (result.affectedRows > 0) {
                        await interaction.editReply({ content: `✅ Jugador **${usernameUnban}** (ID: ${userIdUnban}) ha sido desbaneado.`, ephemeral: false });
                    } else {
                        await interaction.editReply({ content: `❌ Jugador con ID **${userIdUnban}** no encontrado en la lista de baneados.`, ephemeral: true });
                    }
                } catch (error) {
                    console.error('Error al desbanear:', error);
                    await interaction.editReply({ content: 'Hubo un error al intentar desbanear al jugador.', ephemeral: true });
                }
                break;

            case 'checkban':
                const userIdCheck = interaction.options.getString('userid');
                try {
                    const [rows] = await pool.query('SELECT username, reason, ban_date, banned_by FROM banned_players WHERE user_id = ?', [userIdCheck]);
                    if (rows.length > 0) {
                        const banInfo = rows[0];
                        await interaction.editReply({
                            content: `\`\`\`\nEstado de baneo para ${banInfo.username || 'N/A'} (ID: ${userIdCheck}):\n` +
                                     `  Baneado: Sí\n` +
                                     `  Razón: ${banInfo.reason}\n` +
                                     `  Fecha de Baneo: ${new Date(banInfo.ban_date).toLocaleString()}\n` +
                                     `  Baneado Por: ${banInfo.banned_by}\n\`\`\``,
                            ephemeral: true
                        });
                    } else {
                        await interaction.editReply({ content: `✅ Jugador **${userIdCheck}** NO está baneado.`, ephemeral: false });
                    }
                } catch (error) {
                    console.error('Error al chequear baneo desde comando:', error);
                    await interaction.editReply({ content: 'Hubo un error al chequear el baneo.', ephemeral: true });
                }
                break;

            case 'listbans':
                try {
                    const [rows] = await pool.query('SELECT user_id, username, reason, banned_by, ban_date FROM banned_players ORDER BY ban_date DESC LIMIT 10');
                    if (rows.length === 0) {
                        await interaction.editReply({ content: 'No hay jugadores baneados actualmente.', ephemeral: false });
                        return;
                    }

                    let banList = rows.map(row =>
                        `**${row.username}** (ID: ${row.user_id})\nRazón: *${row.reason}*\nBaneado por: ${row.banned_by} el ${new Date(row.ban_date).toLocaleString()}\n---`
                    ).join('\n');

                    await interaction.editReply({ content: `**Lista de Jugadores Baneados (últimos 10):**\n\n${banList}`, ephemeral: false });
                } catch (error) {
                    console.error('Error al listar baneos:', error);
                    await interaction.editReply({ content: 'Hubo un error al obtener la lista de baneos.', ephemeral: true });
                }
                break;

            case 'topbans':
                try {
                    const [rows] = await pool.query('SELECT banned_by, COUNT(*) AS banCount FROM banned_players GROUP BY banned_by ORDER BY banCount DESC LIMIT 5');
                    if (rows.length === 0) {
                        await interaction.editReply({ content: 'Nadie ha baneado a nadie todavía.', ephemeral: false });
                        return;
                    }

                    let topBansList = rows.map((row, index) =>
                        `${index + 1}. **${row.banned_by}**: ${row.banCount} baneos`
                    ).join('\n');

                    await interaction.editReply({ content: `**Top 5 Moderadores con Más Baneos:**\n\n${topBansList}`, ephemeral: false });
                } catch (error) {
                    console.error('Error al obtener top baneos:', error);
                    await interaction.editReply({ content: 'Hubo un error al obtener los top baneos.', ephemeral: true });
                }
                break;

            case 'help':
                await interaction.editReply({
                    content: '**Comandos de N-FORCE Anti-Cheat Bot:**\n' +
                             '`/ban <UserID> <Razón>` - Banea a un usuario de Roblox.\n' +
                             '`/unban <UserID>` - Desbanea a un usuario de Roblox.\n' +
                             '`/checkban <UserID>` - Consulta el estado de baneo de un usuario.\n' +
                             '`/listbans` - Lista los últimos baneos.\n' +
                             '`/topbans` - Muestra los moderadores con más baneos.\n' +
                             '*(Los botones de "Ban Player" en los reportes también funcionan si tienes el rol adecuado.)*',
                    ephemeral: true
                });
                break;

            default:
                await interaction.editReply({ content: 'Comando desconocido.', ephemeral: true });
        }
    }
});

// Inicia la aplicación (conexión a DB, Discord Bot, Express Server)
startApplication();

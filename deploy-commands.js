// deploy-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');

// Define tus comandos slash aquí
const commands = [
    {
        name: 'ban',
        description: 'Banea a un jugador de Roblox.',
        options: [
            {
                name: 'userid',
                type: 3, // String
                description: 'El UserId de Roblox del jugador a banear.',
                required: true,
            },
            {
                name: 'reason',
                type: 3, // String
                description: 'La razón del baneo.',
                required: true,
            },
            {
                name: 'username',
                type: 3, // String
                description: '(Opcional) El nombre de usuario de Roblox.',
                required: false,
            }
        ],
    },
    {
        name: 'unban',
        description: 'Desbanea a un jugador de Roblox.',
        options: [
            {
                name: 'userid',
                type: 3, // String
                description: 'El UserId de Roblox del jugador a desbanear.',
                required: true,
            },
        ],
    },
    {
        name: 'listbans',
        description: 'Muestra una lista de los jugadores baneados.',
    },
    {
        name: 'topbans',
        description: 'Muestra un top de los moderadores que más han baneado.',
    },
];

// Crea una instancia de REST para interactuar con la API de Discord
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

// Función asíncrona para registrar los comandos
(async () => {
    try {
        console.log('Empezando a refrescar (/) comandos de aplicación.');

        // Registra los comandos para una aplicación global (disponibles en todos los servidores donde el bot esté invitado)
        // Puedes cambiar a Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, 'ID_DE_TU_SERVIDOR')
        // si quieres registrar los comandos solo para un servidor específico (útil para pruebas).
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands },
        );

        console.log('Comandos (/) de aplicación recargados exitosamente.');
    } catch (error) {
        console.error('Error al registrar comandos:', error);
    }
})();

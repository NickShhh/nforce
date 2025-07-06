// deploy-commands.js
require('dotenv').config(); // Para cargar variables de entorno (CLIENT_ID, GUILD_ID, DISCORD_BOT_TOKEN)

const { SlashCommandBuilder, REST, Routes } = require('discord.js');

// Asegúrate de que estas variables de entorno están disponibles aquí.
// Si las tienes en un archivo .env local, este script las leerá.
// Si no, asegúrate de pasarlas directamente o que Render las use en un paso de build.
const CLIENT_ID = process.env.CLIENT_ID; 
const GUILD_ID = process.env.GUILD_ID;   
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!CLIENT_ID || !GUILD_ID || !DISCORD_BOT_TOKEN) {
    console.error("Error: CLIENT_ID, GUILD_ID, y/o DISCORD_BOT_TOKEN no están definidos.");
    console.error("Asegúrate de tener un archivo .env con estas variables o de que estén configuradas en tu entorno.");
    process.exit(1);
}

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

(async () => {
    try {
        console.log(`Comenzando a registrar ${commands.length} comandos de aplicación (/) para el gremio ${GUILD_ID}.`);

        // Usa Routes.applicationGuildCommands para comandos específicos de un gremio (actualización rápida)
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );

        console.log(`Se registraron exitosamente ${data.length} comandos de aplicación (/).`);
    } catch (error) {
        console.error('Error al registrar comandos de aplicación (/). Asegúrate de que CLIENT_ID, GUILD_ID y DISCORD_BOT_TOKEN son correctos:', error);
    }
})();

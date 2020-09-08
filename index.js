require("dotenv").config()
const Discord = require("discord.js")
const fs = require("fs")
const client = new Discord.Client()


const serializer = require("./misc/serializeHelper")
const cM = require("./misc/channelManagement")
const c = require("./misc/constants")

// setup bot state
client._state = {};
client._state.lobbies = {};


// load bot state
if(!serializer.loadState(client, process.env.SAVEFILE))
{
	cM.botChannels.forEach(channel => {
		client._state.lobbies[channel] = {};
	});
}

// setup reading messages
fs.readdir("./events/", (err, files) => {
	files.forEach(file => {
		const eventHandler = require(`./events/${file}`)
		const eventName = file.split(".")[0]
		client.on(eventName, (...args) => eventHandler(client, ...args))
	})
})

// login
client.login(process.env.BOT_TOKEN)

// serialize state in case of crash...
const writer = () => {
	serializer.writeState(client._state, process.env.SAVEFILE)
};
setInterval(writer, 15000);
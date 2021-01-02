const c = require("../misc/constants")
const aE = require("../misc/answerEmbedding")
const mH = require("../misc/messageHelper")
const rM = require("../misc/roleManagement")
const lM = require("../misc/lobbyManagement")
const tZ = require("../misc/timeZone")

/**
 * Internal function that creates the embedding for the lobby post
 * @param {Discord.Message} message coaches message that triggered the lobby post
 * @param {mysql.Connection} dbHandle db handle
 * @param {number} lobbyType type of lobby
 * @param {string} lobbyTypeName printing name of that lobby
 * @param {string} footer String to append to embedding
 */
async function postLobby_int(message, dbHandle, lobbyType, lobbyTypeName, footer) {

	// tryout 'region' and role
	var lobbyRegionRole = undefined;
	var beginnerRoleNumbers = [0];

	if(lobbyType !== c.lobbyTypes.tryout)
	{
		// get region role
		var lobbyRegionRole = mH.getLobbyRegionRoleFromMessage(message, 1);
		if (lobbyRegionRole === undefined)
			return mH.reactNegative(message, "Failed to recognize region, has to be any of '" + rM.getRegionalRoleStringsForCommand().join("', '") + "'");

		// get beginner roles
		const minRole = 1;
		const maxRole = 4;
		[res, beginnerRoleNumbers, errormsg] = mH.getNumbersFromMessage(message, 2, minRole, maxRole);
		if(!res) {
			return mH.reactNegative(message, errormsg);
		}
	}

	var lobbyBeginnerRoles = rM.getBeginnerRolesFromNumbers(beginnerRoleNumbers);

	// get zoned time
	const tryoutIndex = 1;
	const allOtherTypesIndex = 3;
	[res, zonedTime, zoneName, errormsg] = mH.getTimeFromMessage(message, lobbyType == c.lobbyTypes.tryout ? tryoutIndex : allOtherTypesIndex);
	if(!res) {
		return mH.reactNegative(message, errormsg);
	}

	var title = "We host a " + lobbyTypeName + " lobby on " + tZ.getTimeString(zonedTime) + " " + zoneName;
	var text = lM.getLobbyPostText(lobbyBeginnerRoles, lobbyType, lobbyRegionRole);
	//"for " + rM.getRoleMentions(lobbyBeginnerRoles) + (lobbyType !== c.lobbyTypes.tryout ? "\nRegion: "+ rM.getRoleMention(lobbyRegionRole) :"");
	var finalFooter = footer
	+ (lobbyType !== c.lobbyTypes.tryout ? ("\n\nPlayers from " + rM.getRegionalRoleString(lobbyRegionRole) + "-region will be moved up."):"")
	+ "\n\nCoaches: Lock and start lobby with 🔒, cancel with ❌";

	// send embedding post to lobby signup-channel
	const _embed = aE.generateEmbedding(title, text, finalFooter);
	const lobbyPostMessage = await message.channel.send(rM.getRoleMentions(lobbyBeginnerRoles), {embed: _embed}); // mentioning roles in message again to ping beginners

	// pin message to channel
	lobbyPostMessage.pin();

	// add emojis
	mH.createLobbyPostReactions(lobbyType, lobbyPostMessage);

	// react to coach's command
	mH.reactPositive(message);

	// create lobby data in database
	lM.createLobby(dbHandle, message.channel.id, lobbyType, lobbyBeginnerRoles, lobbyRegionRole, zonedTime.epoch, lobbyPostMessage.id);
}

var reactionStringBeginner = "Join lobby by clicking 1️⃣, 2️⃣, ... at ingame positions you want.\nClick again to remove a position.\nRemove all positions to withdraw from the lobby."
var reactionStringTryout = "Tryouts: Join lobby by clicking ✅ below.\nClick again to withdraw from the lobby."

/**
 * Checks if lobby exists and posts lobby post depending on lobby type
 * @param {Discord.Message} message coaches message that triggered the lobby post
 * @param {mysql.Connection} dbHandle bot database handle
 */
module.exports = async (message, dbHandle) => {
	var type = mH.getLobbyType(message);
	if(type == undefined)
		return;

	if(type == c.lobbyTypes.tryout)
		postLobby_int(message, dbHandle, type, c.getLobbyNameByType(type), reactionStringTryout);
	else
		postLobby_int(message, dbHandle, type, c.getLobbyNameByType(type), reactionStringBeginner);
}
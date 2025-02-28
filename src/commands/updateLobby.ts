import { DMChannel, Message, NewsChannel, TextChannel } from "discord.js";
import { getLobbyTypeByString, isRoleBasedLobbyType } from "../misc/constants";
import { getNumbersFromString } from "../misc/generics";
import {
  findLobbyByMessage,
  getArguments,
  reactNegative,
  reactPositive,
} from "../misc/messageHelper";
import {
  getBeginnerRolesFromNumbers,
  getRegionalRoleFromString,
} from "../misc/roleManagement";
import { DFZDataBaseClient } from "../logic/database/DFZDataBaseClient";
import { LobbyPostManipulator } from "../logic/lobby/LobbyPostManipulator";
import { Lobby } from "../logic/serializables/lobby";
import { LobbySerializer } from "../logic/serializers/lobbySerializer";

/**
 * Checks if lobby exists and updates lobby post depending on message
 */
export default async (message: Message, dbClient: DFZDataBaseClient) => {
  try {
    await updateLobby(message, dbClient);
    reactPositive(message, "Updated lobby parameters.");
  } catch (error) {
    reactNegative(message, error);
  }
};

async function updateLobby(message: Message, dbClient: DFZDataBaseClient) {
  const lobby = await updateLobbyByMessage(message, dbClient);
  await performLobbyUpdate(lobby, message.channel, dbClient);
}

async function updateLobbyByMessage(
  message: Message,
  dbClient: DFZDataBaseClient
) {
  const args = getUpdateArguments(message);

  const messageId = args[0];
  const lobby = await findLobbyByMessage(
    dbClient,
    message.channel.id,
    messageId
  );

  args.shift();
  updateLobbyParameters(args, lobby);
  return lobby;
}

function getUpdateArguments(message: Message) {
  var args = getArguments(message);
  if (args.length == 0)
    throw "No message ID given. \r\n Add the message ID of the lobby you want to update.";

  return args;
}
export function updateLobbyParameters(args: string[], lobby: Lobby) {
  var updateTiers = false,
    updateType = false,
    updateRegion = false,
    changedLobby = false;

  while (args.length > 0) {
    let arg = args[0];
    args.shift();

    if (arg === "-tiers") {
      updateTiers = true;
      continue;
    }

    if (arg === "-type") {
      updateType = true;
      continue;
    }

    if (arg === "-region") {
      updateRegion = true;
      continue;
    }

    if (updateTiers) {
      updateLobbyTiers(lobby, arg);
      changedLobby = true;
      updateTiers = false;
      continue;
    }

    if (updateType) {
      updateLobbyType(lobby, arg);
      changedLobby = true;
      updateType = false;
      continue;
    }

    if (updateRegion) {
      updateLobbyRegion(lobby, arg);
      changedLobby = true;
      updateRegion = false;
      continue;
    }
  }

  if (!changedLobby) throw "You did not make any changes.";
}

function updateLobbyTiers(lobby: Lobby, tiers: string) {
  const minTier = 0;
  const maxTier = 4;
  const numbers = getNumbersFromString(tiers, minTier, maxTier);

  var roles = getBeginnerRolesFromNumbers(numbers);
  if (roles.length === 0) throw "You provided wrong lobby tiers.";

  lobby.beginnerRoleIds = roles;
}

function updateLobbyRegion(lobby: Lobby, region: string) {
  var regionId = getRegionalRoleFromString(region);
  if (regionId == undefined)
    throw `You did not provide a valid region ID. Region IDs are ${getRegionalRoleFromString}`;

  lobby.regionId = regionId;
}

function updateLobbyType(lobby: Lobby, maybeType: string) {
  var lobbyType = getLobbyTypeByString(maybeType);

  const oldIsRoleBased = isRoleBasedLobbyType(lobbyType);
  const newIsRoleBased = isRoleBasedLobbyType(lobby.type);
  if (oldIsRoleBased !== newIsRoleBased)
    throw "Cannot change role based lobby type into simple lobby type and vice versa";

  lobby.type = lobbyType;
}

async function performLobbyUpdate(
  lobby: Lobby,
  channel: TextChannel | DMChannel | NewsChannel,
  dbClient: DFZDataBaseClient
) {
  try {
    const serializer = new LobbySerializer(dbClient);
    await serializer.update(lobby);
    await LobbyPostManipulator.tryUpdateLobbyPost(lobby, channel);
  } catch (e) {
    console.log("Failed updating lobby. Error: " + e);
  }
}

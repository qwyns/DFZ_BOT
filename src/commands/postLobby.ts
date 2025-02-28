import { GuildMember, Message } from "discord.js";
import {
  isRoleBasedLobbyType,
  lobbyTypes,
  isSimpleLobbyType,
} from "../misc/constants";
import {
  getLobbyRegionRoleFromMessage,
  reactNegative,
  getNumbersFromMessage,
  getTimeFromMessage,
  reactPositive,
  getLobbyTypeFromMessage,
  getArguments,
} from "../misc/messageHelper";
import {
  getBeginnerRolesFromNumbers,
  adminRoles,
  beginnerRoles,
  companionRole,
  findRole,
} from "../misc/roleManagement";
import { DFZDataBaseClient } from "../logic/database/DFZDataBaseClient";
import { PostLobbyOptions } from "../logic/lobby/interfaces/PostLobbyOptions";
import { LobbyPostManipulator } from "../logic/lobby/LobbyPostManipulator";

/**
 * Checks if lobby exists and posts lobby post depending on lobby type
 * @param {Discord.Message} message coaches message that triggered the lobby post
 * @param {mysql.Pool} dbHandle bot database handle
 */
export default async (message: Message, dbClient: DFZDataBaseClient) => {
  await tryPostLobby(message, dbClient);
};

async function tryPostLobby(message: Message, dbClient: DFZDataBaseClient) {
  try {
    const options = tryGetLobbyOptionsFromMessage(message);
    await LobbyPostManipulator.postLobby(dbClient, message.channel, options);
    reactPositive(message);
  } catch (e) {
    reactNegative(message, e);
  }
}

function tryGetLobbyOptionsFromMessage(message: Message): PostLobbyOptions {
  const type = getLobbyTypeFromMessage(message);

  if (!message.member || !isTypeAllowedForMember(type, message.member))
    throw new Error("You are not allowed to post this kind of lobby");

  return getLobbyOptions(message, type);
}

function isTypeAllowedForMember(type: number, member: GuildMember): boolean {
  // only allow companions to host meeting lobbies
  if (findRole(member, [companionRole]) && type !== lobbyTypes.meeting)
    return false;

  return true;
}

function getLobbyTypeBasedTimeIndex(lobbyType: number) {
  const simpleLobbyIndex = 1;
  const roleBasedLobbyIndex = 3;
  return isSimpleLobbyType(lobbyType) ? simpleLobbyIndex : roleBasedLobbyIndex;
}

function getLobbyOptions(message: Message, type: number) {
  if (isRoleBasedLobbyType(type)) {
    return getRoleBasedLobbyOptions(message, type);
  } else {
    return getNonRoleBasedLobbyOptions(message, type);
  }
}

function getRoleBasedLobbyOptions(
  message: Message,
  type: number
): PostLobbyOptions {
  return {
    type: type,
    regionRole: getLobbyRegionRole(message),
    userRoles: getAllowedTiers(message),
    time: getLobbyTime(message, type),
    coaches: [message.author.id],
    optionalText: "",
  };
}

function getLobbyRegionRole(message: Message) {
  const argIndex = 1;
  return getLobbyRegionRoleFromMessage(message, argIndex);
}

function getAllowedTiers(message: Message) {
  const rolesIdxInMessage = 2;
  const minRole = 0;
  const maxRole = 4;
  const numbers = getNumbersFromMessage(
    message,
    rolesIdxInMessage,
    minRole,
    maxRole
  );
  return getBeginnerRolesFromNumbers(numbers);
}

function getLobbyTime(message: Message, type: number) {
  const lobbyIndex = getLobbyTypeBasedTimeIndex(type);
  const timeResult = getTimeFromMessage(message, lobbyIndex);
  return timeResult.time;
}

function getNonRoleBasedLobbyOptions(
  message: Message,
  type: number
): PostLobbyOptions {
  var options: PostLobbyOptions = {
    type: type,
    regionRole: "",
    userRoles: [],
    time: getLobbyTime(message, type),
    coaches: [message.author.id],
    optionalText: "",
  };

  switch (options.type) {
    case lobbyTypes.replayAnalysis:
      setReplayAnalysisOptions(options);
      break;
    case lobbyTypes.tryout:
      setTryoutOptions(options);
      break;
    case lobbyTypes.meeting:
      setMeetingOptions(message, options);
      break;
    default:
      options.userRoles = beginnerRoles.concat(adminRoles);
  }

  return options;
}

function setReplayAnalysisOptions(options: PostLobbyOptions) {
  options.userRoles = beginnerRoles;
}

function setTryoutOptions(options: PostLobbyOptions) {
  const tryoutRoleNumber = 5;
  options.userRoles = getBeginnerRolesFromNumbers(new Set([tryoutRoleNumber]));
}

function setMeetingOptions(message: Message, options: PostLobbyOptions) {
  const args = getArguments(message);
  setAllowedUserRoles(args, options);
  trySetOptionalText(args, options);
}

function setAllowedUserRoles(args: string[], options: PostLobbyOptions) {
  options.userRoles = beginnerRoles.concat(adminRoles);

  const inviteeIndex = 3;
  if (args.length > inviteeIndex)
    trySetMeetingForPlayersOrCoaches(args[inviteeIndex], options);
}

function trySetMeetingForPlayersOrCoaches(
  inviteeString: string,
  options: PostLobbyOptions
) {
  if (inviteeString === "coaches") options.userRoles = adminRoles;
  else if (inviteeString === "players") options.userRoles = beginnerRoles;
}

function trySetOptionalText(args: string[], options: PostLobbyOptions) {
  let optionalTextFrom = 4;
  if (options.userRoles.length === beginnerRoles.length + adminRoles.length)
    optionalTextFrom = 3;
  if (args.length > optionalTextFrom)
    options.optionalText = args.slice(optionalTextFrom).join(" ");
}

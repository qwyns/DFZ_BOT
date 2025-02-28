import {
  Client,
  ClientOptions,
  Guild,
  NewsChannel,
  TextChannel,
} from "discord.js";
import { readdirSync } from "fs";
import { ChannelManager } from "./ChannelManager";
import { guildId } from "../../misc/constants";
import {
  insertScheduledLobbies,
  postSchedules,
  tryRemoveDeprecatedSchedules,
} from "../../misc/scheduleManagement";
import { DFZDataBaseClient } from "../database/DFZDataBaseClient";
import { ReferrerLeaderBoardHandler } from "../highscore/ReferrerLeaderBoardHandler";
import { Schedule } from "../serializables/schedule";
import { LobbySerializer } from "../serializers/lobbySerializer";
import { ScheduleSerializer } from "../serializers/scheduleSerializer";
import { IScheduleInfo } from "./interfaces/ScheduleInfo";
import { LobbyTimeController } from "../lobby/LobbyTimeController";
import { LobbyTimeout } from "../lobby/interfaces/LobbyTimeout";

export class DFZDiscordClient extends Client {
  dbClient: DFZDataBaseClient;
  timeouts: LobbyTimeout[] = [];
  constructor(options?: ClientOptions | undefined) {
    super(options);

    this.setupDiscordEventHandlers();
    this.dbClient = new DFZDataBaseClient();
  }

  private setupDiscordEventHandlers() {
    const files = readdirSync("./build/src/events/");
    for (const file of files) {
      const eventHandler = require(`../../events/${file}`);
      const eventName = file.split(".")[0];
      this.on(eventName, (...args: any) => eventHandler(this, ...args));
    }
  }

  public async onReady() {
    try {
      await this.setupBot();
    } catch (error) {
      console.log(`Error while setting up bot: ${error}`);
    }
  }

  private async setupBot() {
    await this.dbClient.tryCreateDataBaseTables();
    await this.fetchDiscordData();
    await this.setIntervalTasks();
  }

  private async fetchDiscordData() {
    await this.fetchLobbyMessages();
    await this.fetchScheduleMessages();
  }

  private async setIntervalTasks() {
    await this.setLobbyPostUpdateTimer();
    await this.setDeleteDeprecatedSchedulesTimer();
    await this.setSchedulePostUpdateTimer();
    await this.setPostLobbyFromScheduleTimer();
    await this.setLeaderBoardPostTimer();
  }

  private async fetchLobbyMessages() {
    const guild = await this.getGuild();
    for (const channelId of ChannelManager.lobbyChannels) {
      await this.fetchLobbyMessagesInChannel(guild, channelId);
    }
  }

  private async getGuild() {
    return await this.guilds.fetch(guildId);
  }

  private async fetchLobbyMessagesInChannel(guild: Guild, channelId: string) {
    const gc = this.findChannel(guild, channelId);
    const lobbies = await this.getChannelLobbies(channelId);
    for (const lobby of lobbies) {
      await gc.messages.fetch(lobby.messageId);
    }
  }

  private async getChannelLobbies(channelId: string) {
    const serializer = new LobbySerializer(this.dbClient, channelId);
    return await serializer.get();
  }

  private async fetchScheduleMessages() {
    const schedules = await this.fetchSchedules();
    var fetchedSchedulePosts = this.getUniqueSchedulePosts(schedules);

    var guild = await this.getGuild();
    for (const post of fetchedSchedulePosts) {
      const channel = this.findChannel(guild, post.channelId);

      channel.messages.fetch(post.messageId);
    }
  }

  private async fetchSchedules() {
    const serializer = new ScheduleSerializer(this.dbClient);
    return await serializer.get();
  }

  private getUniqueSchedulePosts(schedules: Array<Schedule>): IScheduleInfo[] {
    var fetchedSchedulePosts: IScheduleInfo[] = [];

    for (const schedule of schedules) {
      this.maybeFetchSchedulePost(schedule, fetchedSchedulePosts);
    }
    return fetchedSchedulePosts;
  }

  private async maybeFetchSchedulePost(
    schedule: Schedule,
    fetchedSchedulePosts: IScheduleInfo[]
  ) {
    const containsPost: boolean = this.isScheduleFetched(
      schedule,
      fetchedSchedulePosts
    );
    if (!containsPost)
      fetchedSchedulePosts.push({
        messageId: schedule.messageId,
        channelId: schedule.channelId,
      });
  }

  private isScheduleFetched(
    schedule: Schedule,
    fetchedSchedulePosts: IScheduleInfo[]
  ): boolean {
    const index = fetchedSchedulePosts.findIndex(
      (fetched) =>
        fetched.messageId === schedule.messageId &&
        fetched.channelId === schedule.channelId
    );
    return index !== -1;
  }

  private findChannel(
    guild: Guild,
    channelId: string
  ): TextChannel | NewsChannel {
    const channel = guild.channels.cache.find((chan) => chan.id === channelId);
    if (channel === undefined || !channel.isText()) {
      throw new Error("Did not find channel when fetching messages");
    }

    return channel;
  }

  private createIntervalTask(
    taskFun: (client: DFZDiscordClient) => Promise<void>
  ) {
    return async () => {
      try {
        await taskFun(this);
      } catch {
        (err: string) => console.log(err);
      }
    };
  }

  private async setLobbyPostUpdateTimer() {
    const updateFun = async (client: DFZDiscordClient) => {
      await LobbyTimeController.checkAndUpdateLobbies(client);
    };

    const intervalFun = this.createIntervalTask(updateFun);
    await intervalFun();
    setInterval(intervalFun, oncePerMinute);
  }

  private async setDeleteDeprecatedSchedulesTimer() {
    const updateFun = async (client: DFZDiscordClient) => {
      await tryRemoveDeprecatedSchedules(client.dbClient);
    };
    const intervalFun = this.createIntervalTask(updateFun);
    await intervalFun();
    setInterval(intervalFun, oncePerHour);
  }

  private async setSchedulePostUpdateTimer() {
    const scheduleWriter = async (client: DFZDiscordClient) => {
      await postSchedules(client);
    };
    const intervalFun = this.createIntervalTask(scheduleWriter);
    await intervalFun();
    setInterval(intervalFun, oncePerHour);
  }

  private async setPostLobbyFromScheduleTimer() {
    const lobbyPoster = async (client: DFZDiscordClient) => {
      const guild = await client.getGuild();
      await insertScheduledLobbies(guild.channels, client.dbClient);
    };
    const intervalFun = this.createIntervalTask(lobbyPoster);
    await intervalFun();
    setInterval(intervalFun, oncePerHour);
  }

  private async setLeaderBoardPostTimer() {
    const intervalFun = this.createIntervalTask(
      ReferrerLeaderBoardHandler.postReferralLeaderboard
    );
    await ReferrerLeaderBoardHandler.findLeaderBoardMessage(this);
    await intervalFun();
    setInterval(intervalFun, oncePerHour);
  }
}

const oncePerMinute = 60000;
const oncePerHour = oncePerMinute * 60;

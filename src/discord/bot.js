const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
  Partials,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const { CONFIG } = require('../config');
const payhip = require('../payhip/service');
const supportService = require('../support/service');
const sse = require('../support/sse');
const { isDbConfigured } = require('../db');

const CUSTOMER_LOUNGE_CHANNEL_ID = '1468663410848698440';

async function startDiscordBot() {
  if (!CONFIG.DISCORD_BOT_TOKEN) {
    console.warn('[discord] Bot not started: missing bot token.');
    return createDiscordStubs();
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  async function handleAutoRoleAndWelcome(discordId) {
    if (!discordId) return;
    if (!CONFIG.DISCORD_GUILD_ID || !CONFIG.DISCORD_ROLE_ID) return;

    try {
      const guild = await client.guilds.fetch(CONFIG.DISCORD_GUILD_ID);
      const member = await guild.members.fetch(discordId);
      if (!member) return;

      const hasRole = member.roles.cache.has(CONFIG.DISCORD_ROLE_ID);
      if (!hasRole) {
        await member.roles.add(CONFIG.DISCORD_ROLE_ID);
      } else {
        return;
      }

      const channel = await client.channels.fetch(CUSTOMER_LOUNGE_CHANNEL_ID);
      if (channel && channel.isTextBased()) {
        await channel.send(`<@${discordId}> has entered the customer lounge.`);
      }
    } catch (err) {
      console.warn(`[discord] Auto-role failed: ${err.message}`);
    }
  }

  async function sendSupportChannelMessage(content, ticket) {
    if (!CONFIG.DISCORD_SUPPORT_NOTIFY_CHANNEL_ID) return;
    if (!content) return;
    try {
      const channel = await client.channels.fetch(
        CONFIG.DISCORD_SUPPORT_NOTIFY_CHANNEL_ID
      );
      if (!channel || !channel.isTextBased()) return;
      const link = ticket?.public_id
        ? `${CONFIG.BASE_URL}/staff/tickets/${ticket.public_id}`
        : CONFIG.BASE_URL;
      await channel.send(`${content}\n${link}`);
    } catch (err) {
      console.warn(`[discord] Notify channel failed: ${err.message}`);
    }
  }

  async function sendTicketDmReply(ticket, payload) {
    if (!ticket?.creator_discord_id) return;
    try {
      const user = await client.users.fetch(ticket.creator_discord_id);
      if (!user) return;
      const content = `Ticket ${ticket.public_id} reply:\n${payload.body}`;
      await user.send({
        content,
        files: payload.files || [],
      });
    } catch (err) {
      console.warn(`[discord] DM reply failed: ${err.message}`);
    }
  }

  async function sendTicketUpdateDm(ticket, body) {
    if (!ticket?.creator_discord_id) return;
    try {
      const user = await client.users.fetch(ticket.creator_discord_id);
      if (!user) return;
      const content = `Ticket ${ticket.public_id} has an update:\n${body}`;
      await user.send({ content });
    } catch (err) {
      console.warn(`[discord] DM update failed: ${err.message}`);
    }
  }

  async function registerSlashCommand() {
    if (!CONFIG.DISCORD_APP_ID) return;

    const linkCommand = new SlashCommandBuilder()
      .setName('link')
      .setDescription('Link your Payhip purchase to your Discord account');

    const claimCommand = new SlashCommandBuilder()
      .setName('claim')
      .setDescription('Claim your purchase with order ID and email')
      .addStringOption((opt) =>
        opt
          .setName('order_id')
          .setDescription('Your Payhip order ID')
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('email')
          .setDescription('Email used for the purchase')
          .setRequired(true)
      );

    const reprintCommand = new SlashCommandBuilder()
      .setName('reprint')
      .setDescription('Admin: resend receipt for a purchase')
      .addStringOption((opt) =>
        opt
          .setName('order_id')
          .setDescription('Payhip order ID')
          .setRequired(true)
      );

    const lookupCommand = new SlashCommandBuilder()
      .setName('lookup')
      .setDescription('Admin: lookup a Payhip order by ID')
      .addStringOption((opt) =>
        opt
          .setName('order_id')
          .setDescription('Payhip order ID')
          .setRequired(true)
      );

    const ticketCommand = new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Open a support ticket in DMs');

    const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_BOT_TOKEN);
    const data = [
      linkCommand.toJSON(),
      claimCommand.toJSON(),
      reprintCommand.toJSON(),
      lookupCommand.toJSON(),
      ticketCommand.toJSON(),
    ];

    if (CONFIG.DISCORD_COMMAND_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          CONFIG.DISCORD_APP_ID,
          CONFIG.DISCORD_COMMAND_GUILD_ID
        ),
        { body: data }
      );
      console.log('[discord] Registered guild commands');
    } else {
      await rest.put(Routes.applicationCommands(CONFIG.DISCORD_APP_ID), {
        body: data,
      });
      console.log('[discord] Registered global commands');
    }
  }

  async function updatePresence() {
    let memberCount = 0;
    try {
      const guild = await client.guilds.fetch(CONFIG.DISCORD_GUILD_ID);
      memberCount = guild?.memberCount || 0;
    } catch (err) {
      console.warn(`[discord] Presence update failed: ${err.message}`);
    }

    const presences = [
      { name: 'Watching orders...', type: 3 },
      { name: `Watching ${memberCount} members`, type: 3 },
      { name: 'Helping customers...', type: 0 },
    ];

    const next = presences[Math.floor(Math.random() * presences.length)];
    try {
      client.user.setPresence({
        status: 'online',
        activities: [{ name: next.name, type: next.type }],
      });
    } catch (err) {
      console.warn(`[discord] Presence set failed: ${err.message}`);
    }
  }

  client.once('clientReady', async () => {
    console.log(`[discord] Logged in as ${client.user.tag}`);
    try {
      await registerSlashCommand();
    } catch (err) {
      console.error(`[discord] Command registration failed: ${err.message}`);
    }

    await updatePresence();
    setInterval(updatePresence, 30 * 60 * 1000);
  });

  client.on('interactionCreate', async (interaction) => {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId !== 'ticket_panel') return;
      const panelId = Number(interaction.values[0] || 0) || null;
      if (!panelId) {
        return interaction.reply({
          content: 'Panel selection failed. Try again.',
          flags: MessageFlags.Ephemeral,
        });
      }
      if (!isDbConfigured()) {
        return interaction.reply({
          content: 'Support database is not configured.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const userRecord = await supportService.ensureUserFromDiscordUser(
        interaction.user
      );
      const ticket = await supportService.createTicket({
        panel_id: panelId,
        creator_user_id: userRecord?.id || null,
        creator_discord_id: interaction.user.id,
        creator_email: userRecord?.email || '',
        subject: 'Discord support ticket',
        source: 'discord',
      });

      await supportService.addTicketMessage({
        ticket_id: ticket.id,
        author_type: 'system',
        author_user_id: userRecord?.id || null,
        author_discord_id: interaction.user.id,
        body: 'Ticket created via Discord.',
        source: 'discord',
      });

      await supportService.logAudit({
        actor_user_id: userRecord?.id || null,
        actor_discord_id: interaction.user.id,
        actor_type: 'user',
        action: 'ticket.created',
        entity_type: 'ticket',
        entity_id: ticket.public_id,
        metadata: { source: 'discord' },
      });

      sse.publish({
        type: 'ticket.created',
        ticket_id: ticket.id,
        public_id: ticket.public_id,
        creator_user_id: userRecord?.id || null,
      });

      return interaction.update({
        content: `Ticket ${ticket.public_id} created. Reply here with your issue.`,
        components: [],
      });
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ticket') {
      if (!isDbConfigured()) {
        return interaction.reply({
          content: 'Support database is not configured.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const panels = await supportService.listPanels();
      if (panels.length === 0) {
        return interaction.reply({
          content: 'No ticket panels are configured yet.',
          flags: MessageFlags.Ephemeral,
        });
      }
      if (panels.length > 25) {
        return interaction.reply({
          content:
            'Too many panels are configured. Please open a ticket on the website.',
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        const dm = await interaction.user.createDM();
        const menu = new StringSelectMenuBuilder()
          .setCustomId('ticket_panel')
          .setPlaceholder('Select a support panel')
          .addOptions(
            panels.map((panel) => ({
              label: panel.name,
              description: panel.description?.slice(0, 90) || 'Support ticket',
              value: String(panel.id),
            }))
          );
        await dm.send({
          content: 'Select a panel to start your ticket.',
          components: [new ActionRowBuilder().addComponents(menu)],
        });
        return interaction.reply({
          content: 'Check your DMs to pick a panel.',
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        return interaction.reply({
          content:
            'I could not DM you. Please open your DMs or use the website.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (
      interaction.commandName !== 'link' &&
      interaction.commandName !== 'claim' &&
      interaction.commandName !== 'reprint' &&
      interaction.commandName !== 'lookup'
    ) {
      return;
    }

    try {
      const dbEnabled = payhip.isDbConfigured();
      const store = payhip.shouldWriteJson() ? payhip.loadStoreCached() : null;
      const purchasesById = store ? payhip.STORE_CACHE.indexes.byId : new Map();
      const purchasesForUser = dbEnabled
        ? await payhip.dbGetPurchasesByDiscordId(interaction.user.id)
        : store
            ? payhip.STORE_CACHE.indexes.byDiscord.get(interaction.user.id) || []
            : [];
      const pending = purchasesForUser.find((p) => !p.redeemed_at);
      const alreadyLinked = purchasesForUser.find((p) => p.redeemed_at);

      const guild = await client.guilds.fetch(CONFIG.DISCORD_GUILD_ID);
      let member;
      try {
        member = await guild.members.fetch(interaction.user.id);
      } catch {
        return interaction.reply({
          content: 'You need to join the server before I can assign your role.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const hasRole = member.roles.cache.has(CONFIG.DISCORD_ROLE_ID);

      if (interaction.commandName === 'lookup') {
        if (!interaction.memberPermissions?.has('ManageGuild')) {
          return interaction.reply({
            content: 'You do not have permission to use this command.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const orderId = interaction.options.getString('order_id', true).trim();
        const order = dbEnabled
          ? await payhip.dbGetPurchaseById(orderId)
          : purchasesById.get(orderId);

        if (!order) {
          return interaction.reply({
            content: `No order found for ID: ${orderId}`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const embed = payhip.buildOrderEmbedFromOrder(order);
        await payhip.attachDiscordThumbnail(embed, order.discord_id);
        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.commandName === 'reprint') {
        if (!interaction.memberPermissions?.has('ManageGuild')) {
          return interaction.reply({
            content: 'You do not have permission to use this command.',
            flags: MessageFlags.Ephemeral,
          });
        }
        const orderId = interaction.options.getString('order_id', true).trim();
        const order = dbEnabled
          ? await payhip.dbGetPurchaseById(orderId)
          : purchasesById.get(orderId);

        if (!order) {
          return interaction.reply({
            content: `No order found for ID: ${orderId}`,
            flags: MessageFlags.Ephemeral,
          });
        }

        await payhip.sendReprintWebhookEmbed(order);
        if (order.discord_id) {
          await handleAutoRoleAndWelcome(order.discord_id);
        }
        return interaction.reply({
          content: `Receipt reprinted for order ${orderId}.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.commandName === 'link') {
        if (!pending) {
          if (alreadyLinked) {
            if (!hasRole) {
              await member.roles.add(CONFIG.DISCORD_ROLE_ID);
              console.log(
                `[discord] Role re-assigned to ${interaction.user.id} (already linked)`
              );
              return interaction.reply({
                content: 'Welcome back! Your role has been re-assigned.',
                flags: MessageFlags.Ephemeral,
              });
            }
            return interaction.reply({
              content: 'You are already linked.',
              flags: MessageFlags.Ephemeral,
            });
          }
          return interaction.reply({
            content:
              'No unpaid or unmatched purchase found for your Discord ID. Make sure you entered the correct ID at checkout.',
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      let claimedOrder = null;
      if (interaction.commandName === 'claim') {
        const orderId = interaction.options.getString('order_id', true).trim();
        const email = interaction.options.getString('email', true).trim().toLowerCase();
        const order = dbEnabled
          ? await payhip.dbGetPurchaseById(orderId)
          : purchasesById.get(orderId);
        const emailMatches =
          order && String(order.email || '').trim().toLowerCase() === email;

        if (!order || !emailMatches) {
          return interaction.reply({
            content: 'Order ID and email did not match a paid purchase.',
            flags: MessageFlags.Ephemeral,
          });
        }

        order.discord_id = interaction.user.id;
        if (!order.redeemed_at) {
          order.redeemed_at = new Date().toISOString();
        }
        order.discord_user_id = interaction.user.id;
        if (dbEnabled) {
          await payhip.dbUpsertPurchase(order);
        }
        if (store) {
          payhip.saveStoreCached(store);
        }
        claimedOrder = order;
      }

      if (!hasRole) {
        await member.roles.add(CONFIG.DISCORD_ROLE_ID);
      }

      if (interaction.commandName === 'link' && pending) {
        pending.redeemed_at = new Date().toISOString();
        pending.discord_user_id = interaction.user.id;
        if (dbEnabled) {
          await payhip.dbUpsertPurchase(pending);
        }
        if (store) {
          payhip.saveStoreCached(store);
        }
      }

      const orderRef = pending || claimedOrder;
      console.log(
        `[discord] Role assigned via /${interaction.commandName} to ${interaction.user.id} for order ${orderRef?.transaction_id || 'unknown'}`
      );

      const responseMessage =
        interaction.commandName === 'claim'
          ? 'Thanks! Your purchase is linked and your role has been assigned.'
          : hasRole
              ? 'You are already linked. Your role is already assigned.'
              : 'Success! Your role has been assigned.';
      return interaction.reply({
        content: responseMessage,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error(`[discord] /link failed: ${err.message}`);
      return interaction.reply({
        content:
          'Something went wrong while assigning your role. Please contact support.',
        flags: MessageFlags.Ephemeral,
      });
    }
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channel.type !== ChannelType.DM) return;
    if (!isDbConfigured()) {
      await message.channel.send('Support database is not configured.');
      return;
    }

    const content = String(message.content || '').trim();
    if (!content && message.attachments.size === 0) return;

    const discordId = message.author.id;
    const userRecord = await supportService.ensureUserFromDiscordUser(
      message.author
    );

    let ticket = null;
    const match = content.match(/^#([A-Z0-9]{6,16})/i);
    if (match) {
      ticket = await supportService.getTicketByPublicId(match[1].toUpperCase());
    } else {
      const tickets = await supportService.listActiveDiscordTickets(discordId);
      if (tickets.length === 1) {
        ticket = tickets[0];
      } else if (tickets.length > 1) {
        const ids = tickets.map((t) => `#${t.public_id}`).join(', ');
        await message.channel.send(
          `You have multiple open tickets (${ids}). Reply with the ticket ID, e.g. #${tickets[0].public_id}.`
        );
        return;
      }
    }

    if (!ticket) {
      await message.channel.send(
        'No open ticket found. Use /ticket in the server or the website to start one.'
      );
      return;
    }

    const body = content.replace(/^#([A-Z0-9]{6,16})\s*/i, '');
    const msg = await supportService.addTicketMessage({
      ticket_id: ticket.id,
      author_type: 'user',
      author_user_id: userRecord?.id || null,
      author_discord_id: discordId,
      body,
      source: 'discord',
    });

    await supportService.logAudit({
      actor_user_id: userRecord?.id || null,
      actor_discord_id: discordId,
      actor_type: 'user',
      action: 'ticket.reply',
      entity_type: 'ticket',
      entity_id: ticket.public_id,
      metadata: { source: 'discord' },
    });

    for (const attachment of message.attachments.values()) {
      await supportService.addAttachmentRecord({
        ticket_message_id: msg.id,
        filename: attachment.name || 'attachment',
        storage_url: attachment.url,
        mime_type: attachment.contentType || '',
        size_bytes: attachment.size || 0,
      });
    }

    sse.publish({
      type: 'ticket.message',
      ticket_id: ticket.id,
      public_id: ticket.public_id,
      creator_user_id: ticket.creator_user_id,
    });
  });

  if (payhip.isDbConfigured()) {
    try {
      await payhip.initPayhipDb();
      const store = payhip.loadStoreCached();
      await payhip.dbSeedFromJson(store);
    } catch (err) {
      console.warn(`[db] Init/seed failed: ${err.message}`);
    }
  }

  client.login(CONFIG.DISCORD_BOT_TOKEN).catch((err) => {
    console.error(`[discord] Login failed: ${err.message}`);
  });

  return {
    client,
    handleAutoRoleAndWelcome,
    sendSupportChannelMessage,
    sendTicketDmReply,
    sendTicketUpdateDm,
  };
}

function createDiscordStubs() {
  return {
    client: null,
    handleAutoRoleAndWelcome: async () => {},
    sendSupportChannelMessage: async () => {},
    sendTicketDmReply: async () => {},
    sendTicketUpdateDm: async () => {},
  };
}

module.exports = { startDiscordBot };

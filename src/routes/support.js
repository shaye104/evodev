const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  ensureUser,
  ensureStaff,
  ensureAdmin,
  ensurePermission,
} = require('../auth');
const supportService = require('../support/service');
const sse = require('../support/sse');
const { CONFIG } = require('../config');
const { nowMysql } = require('../db');

const PERMISSIONS = [
  { id: 'tickets.view', label: 'View tickets' },
  { id: 'tickets.reply', label: 'Reply to tickets' },
  { id: 'tickets.claim', label: 'Claim/unclaim tickets' },
  { id: 'tickets.assign', label: 'Assign tickets' },
  { id: 'tickets.status', label: 'Change ticket status' },
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

function createSupportRouter({ discord }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.render('index', { pageTitle: 'Support' });
  });

  router.get('/login', (req, res) => {
    res.render('login', { pageTitle: 'Login' });
  });

  router.get('/logout', (req, res) => {
    req.logout(() => {
      res.redirect('/');
    });
  });

  router.get('/events', ensureUser, (req, res) => {
    sse.subscribe(req, res, (event) => {
      if (req.staff) return true;
      return event.creator_user_id === req.user.id;
    });
  });

  router.get('/tickets', ensureUser, async (req, res) => {
    const tickets = await supportService.listTicketsForUser(req.user.id);
    res.render('user/tickets', {
      pageTitle: 'Your Tickets',
      tickets,
      useSse: true,
    });
  });

  router.get('/tickets/new', ensureUser, async (req, res) => {
    const panels = await supportService.listPanels();
    res.render('user/new_ticket', {
      pageTitle: 'New Ticket',
      panels,
    });
  });

  router.post('/tickets', ensureUser, upload.array('attachments'), async (req, res) => {
    const { panel_id, subject, message, email, notifications_enabled } = req.body;
    const panelId = Number(panel_id || 0) || null;
    const emailInput = String(email || '').trim();
    const creatorEmail = emailInput || req.user?.email || '';
    if (!panelId || !subject || !message) {
      return res.redirect('/tickets/new?error=missing');
    }

    const ticket = await supportService.createTicket({
      panel_id: panelId,
      creator_user_id: req.user.id,
      creator_discord_id: req.user.discord_id,
      creator_email: creatorEmail,
      subject,
      source: 'web',
    });

    const msg = await supportService.addTicketMessage({
      ticket_id: ticket.id,
      author_type: 'user',
      author_user_id: req.user.id,
      author_discord_id: req.user.discord_id,
      body: message,
      source: 'web',
    });

    await saveAttachments(ticket.public_id, msg.id, req.files || []);
    await supportService.toggleUserNotifications(
      req.user.id,
      notifications_enabled === '1'
    );

    await supportService.logAudit({
      actor_user_id: req.user.id,
      actor_discord_id: req.user.discord_id,
      actor_type: 'user',
      action: 'ticket.created',
      entity_type: 'ticket',
      entity_id: ticket.public_id,
      metadata: { source: 'web' },
    });

    sse.publish({
      type: 'ticket.created',
      ticket_id: ticket.id,
      public_id: ticket.public_id,
      creator_user_id: req.user.id,
    });

    res.redirect(`/tickets/${ticket.public_id}`);
  });

  router.get('/tickets/:publicId', ensureUser, async (req, res) => {
    const ticket = await supportService.getTicketByPublicId(req.params.publicId);
    if (!ticket) return res.status(404).send('Ticket not found.');
    if (!req.staff && ticket.creator_user_id !== req.user.id) {
      return res.status(403).send('Access denied.');
    }

    const messages = await supportService.listTicketMessages(ticket.id);
    const attachmentsByMessage = new Map();
    for (const msg of messages) {
      const attachments = await supportService.listMessageAttachments(msg.id);
      attachmentsByMessage.set(msg.id, attachments);
    }

    res.render('user/ticket_detail', {
      pageTitle: `Ticket ${ticket.public_id}`,
      ticket,
      messages,
      attachmentsByMessage,
      useSse: true,
    });
  });

  router.post(
    '/tickets/:publicId/reply',
    ensureUser,
    upload.array('attachments'),
    async (req, res) => {
      const ticket = await supportService.getTicketByPublicId(req.params.publicId);
      if (!ticket) return res.status(404).send('Ticket not found.');
      if (!req.staff && ticket.creator_user_id !== req.user.id) {
        return res.status(403).send('Access denied.');
      }

      const messageBody = String(req.body.message || '').trim();
      if (!messageBody) {
        return res.redirect(`/tickets/${ticket.public_id}?error=missing`);
      }

      const msg = await supportService.addTicketMessage({
        ticket_id: ticket.id,
        author_type: req.staff ? 'staff' : 'user',
        author_user_id: req.user.id,
        author_discord_id: req.user.discord_id,
        body: messageBody,
        source: 'web',
      });

      await saveAttachments(ticket.public_id, msg.id, req.files || []);

      if (!req.staff && ticket.source === 'web') {
        await notifyWebTicketUpdate(discord, {
          ticket,
          actor: req.user,
          note: 'User replied on web ticket.',
        });
      }

      if (req.staff && ticket.source === 'discord' && discord) {
        await discord.sendTicketDmReply(ticket, {
          body: messageBody,
          files: await collectAttachmentsForMessage(msg.id),
        });
      }

      if (req.staff && ticket.source === 'web') {
        const creator = await supportService.getUserById(ticket.creator_user_id);
        if (creator?.discord_id && creator.notifications_enabled && discord) {
          await discord.sendTicketUpdateDm(ticket, messageBody);
        }
      }

      await supportService.logAudit({
        actor_user_id: req.user.id,
        actor_discord_id: req.user.discord_id,
        actor_type: req.staff ? 'staff' : 'user',
        action: 'ticket.reply',
        entity_type: 'ticket',
        entity_id: ticket.public_id,
      });

      sse.publish({
        type: 'ticket.message',
        ticket_id: ticket.id,
        public_id: ticket.public_id,
        creator_user_id: ticket.creator_user_id,
      });

      res.redirect(`/tickets/${ticket.public_id}`);
    }
  );

  router.get('/staff', ensureStaff, async (req, res) => {
    const statuses = await supportService.listStatuses();
    const panels = await supportService.listPanels({ includeInactive: true });
    const tickets = await supportService.listTicketsForStaff({
      status_id: req.query.status_id || null,
      panel_id: req.query.panel_id || null,
      assigned_staff_id: req.query.assigned_staff_id || null,
    });

    res.render('staff/tickets', {
      pageTitle: 'Staff Dashboard',
      tickets,
      statuses,
      panels,
      query: req.query,
      useSse: true,
    });
  });

  router.get('/staff/tickets/:publicId', ensureStaff, async (req, res) => {
    const ticket = await supportService.getTicketByPublicId(req.params.publicId);
    if (!ticket) return res.status(404).send('Ticket not found.');
    const messages = await supportService.listTicketMessages(ticket.id);
    const attachmentsByMessage = new Map();
    for (const msg of messages) {
      const attachments = await supportService.listMessageAttachments(msg.id);
      attachmentsByMessage.set(msg.id, attachments);
    }
    const statuses = await supportService.listStatuses();
    const staffMembers = await supportService.listStaffMembers();

    res.render('staff/ticket_detail', {
      pageTitle: `Ticket ${ticket.public_id}`,
      ticket,
      messages,
      attachmentsByMessage,
      statuses,
      staffMembers,
      useSse: true,
    });
  });

  router.post(
    '/staff/tickets/:publicId/reply',
    ensureStaff,
    ensurePermission('tickets.reply'),
    upload.array('attachments'),
    async (req, res) => {
      const ticket = await supportService.getTicketByPublicId(req.params.publicId);
      if (!ticket) return res.status(404).send('Ticket not found.');

      const messageBody = String(req.body.message || '').trim();
      if (!messageBody) {
        return res.redirect(`/staff/tickets/${ticket.public_id}?error=missing`);
      }

      const msg = await supportService.addTicketMessage({
        ticket_id: ticket.id,
        author_type: 'staff',
        author_user_id: req.user.id,
        author_discord_id: req.user.discord_id,
        body: messageBody,
        source: 'web',
      });

      await saveAttachments(ticket.public_id, msg.id, req.files || []);

      if (ticket.source === 'discord' && discord) {
        await discord.sendTicketDmReply(ticket, {
          body: messageBody,
          files: await collectAttachmentsForMessage(msg.id),
        });
      }

      if (ticket.source === 'web') {
        const creator = await supportService.getUserById(ticket.creator_user_id);
        if (creator?.discord_id && creator.notifications_enabled && discord) {
          await discord.sendTicketUpdateDm(ticket, messageBody);
        }
      }

      await supportService.logAudit({
        actor_user_id: req.user.id,
        actor_discord_id: req.user.discord_id,
        actor_type: 'staff',
        action: 'ticket.reply',
        entity_type: 'ticket',
        entity_id: ticket.public_id,
      });

      sse.publish({
        type: 'ticket.message',
        ticket_id: ticket.id,
        public_id: ticket.public_id,
        creator_user_id: ticket.creator_user_id,
      });

      res.redirect(`/staff/tickets/${ticket.public_id}`);
    }
  );

  router.post(
    '/staff/tickets/:publicId/claim',
    ensureStaff,
    ensurePermission('tickets.claim'),
    async (req, res) => {
      const ticket = await supportService.getTicketByPublicId(req.params.publicId);
      if (!ticket) return res.status(404).send('Ticket not found.');
      const action = req.body.action === 'unclaim' ? 'unclaim' : 'claim';

      if (action === 'claim') {
        await supportService.assignTicket(ticket.id, req.staff.id);
        await supportService.addClaimRecord(ticket.id, req.staff.id, 'claim');
      } else {
        await supportService.assignTicket(ticket.id, null);
        await supportService.addClaimRecord(ticket.id, req.staff.id, 'unclaim');
      }

      await supportService.logAudit({
        actor_user_id: req.user.id,
        actor_discord_id: req.user.discord_id,
        actor_type: 'staff',
        action: `ticket.${action}`,
        entity_type: 'ticket',
        entity_id: ticket.public_id,
      });

      sse.publish({
        type: 'ticket.updated',
        ticket_id: ticket.id,
        public_id: ticket.public_id,
        creator_user_id: ticket.creator_user_id,
      });

      res.redirect(`/staff/tickets/${ticket.public_id}`);
    }
  );

  router.post(
    '/staff/tickets/:publicId/status',
    ensureStaff,
    ensurePermission('tickets.status'),
    async (req, res) => {
      const ticket = await supportService.getTicketByPublicId(req.params.publicId);
      if (!ticket) return res.status(404).send('Ticket not found.');
      const statusId = Number(req.body.status_id || 0) || null;
      if (!statusId) return res.redirect(`/staff/tickets/${ticket.public_id}`);
      const status = await supportService.getTicketStatusById(statusId);
      await supportService.updateTicketStatus(
        ticket.id,
        statusId,
        status?.is_closed ? nowMysql() : null
      );
      await supportService.logAudit({
        actor_user_id: req.user.id,
        actor_discord_id: req.user.discord_id,
        actor_type: 'staff',
        action: 'ticket.status',
        entity_type: 'ticket',
        entity_id: ticket.public_id,
        metadata: { status_id: statusId },
      });
      sse.publish({
        type: 'ticket.updated',
        ticket_id: ticket.id,
        public_id: ticket.public_id,
        creator_user_id: ticket.creator_user_id,
      });
      res.redirect(`/staff/tickets/${ticket.public_id}`);
    }
  );

  router.post(
    '/staff/tickets/:publicId/assign',
    ensureStaff,
    ensurePermission('tickets.assign'),
    async (req, res) => {
      const ticket = await supportService.getTicketByPublicId(req.params.publicId);
      if (!ticket) return res.status(404).send('Ticket not found.');
      const staffId = Number(req.body.staff_id || 0) || null;
      await supportService.assignTicket(ticket.id, staffId);
      await supportService.logAudit({
        actor_user_id: req.user.id,
        actor_discord_id: req.user.discord_id,
        actor_type: 'staff',
        action: 'ticket.assign',
        entity_type: 'ticket',
        entity_id: ticket.public_id,
        metadata: { staff_id: staffId },
      });
      sse.publish({
        type: 'ticket.updated',
        ticket_id: ticket.id,
        public_id: ticket.public_id,
        creator_user_id: ticket.creator_user_id,
      });
      res.redirect(`/staff/tickets/${ticket.public_id}`);
    }
  );

  router.get('/admin', ensureAdmin, async (_req, res) => {
    res.render('admin/dashboard', { pageTitle: 'Admin' });
  });

  router.get('/admin/panels', ensureAdmin, async (_req, res) => {
    const panels = await supportService.listPanels({ includeInactive: true });
    res.render('admin/panels', { pageTitle: 'Panels', panels });
  });

  router.post('/admin/panels', ensureAdmin, async (req, res) => {
    const panelId = await supportService.createPanel({
      name: req.body.name,
      description: req.body.description,
      is_active: req.body.is_active === '1',
      sort_order: req.body.sort_order,
    });
    await supportService.logAudit({
      actor_user_id: req.user.id,
      actor_discord_id: req.user.discord_id,
      actor_type: 'admin',
      action: 'panel.create',
      entity_type: 'panel',
      entity_id: panelId,
    });
    res.redirect('/admin/panels');
  });

  router.post('/admin/panels/:id', ensureAdmin, async (req, res) => {
    await supportService.updatePanel(req.params.id, {
      name: req.body.name,
      description: req.body.description,
      is_active: req.body.is_active === '1',
      sort_order: req.body.sort_order,
    });
    await supportService.logAudit({
      actor_user_id: req.user.id,
      actor_discord_id: req.user.discord_id,
      actor_type: 'admin',
      action: 'panel.update',
      entity_type: 'panel',
      entity_id: req.params.id,
    });
    res.redirect('/admin/panels');
  });

  router.get('/admin/statuses', ensureAdmin, async (_req, res) => {
    const statuses = await supportService.listStatuses();
    res.render('admin/statuses', { pageTitle: 'Statuses', statuses });
  });

  router.post('/admin/statuses', ensureAdmin, async (req, res) => {
    const statusId = await supportService.createStatus({
      name: req.body.name,
      slug: req.body.slug,
      is_default_open: req.body.is_default_open === '1',
      is_closed: req.body.is_closed === '1',
      sort_order: req.body.sort_order,
    });
    await supportService.logAudit({
      actor_user_id: req.user.id,
      actor_discord_id: req.user.discord_id,
      actor_type: 'admin',
      action: 'status.create',
      entity_type: 'status',
      entity_id: statusId,
    });
    res.redirect('/admin/statuses');
  });

  router.post('/admin/statuses/:id', ensureAdmin, async (req, res) => {
    await supportService.updateStatus(req.params.id, {
      name: req.body.name,
      slug: req.body.slug,
      is_default_open: req.body.is_default_open === '1',
      is_closed: req.body.is_closed === '1',
      sort_order: req.body.sort_order,
    });
    await supportService.logAudit({
      actor_user_id: req.user.id,
      actor_discord_id: req.user.discord_id,
      actor_type: 'admin',
      action: 'status.update',
      entity_type: 'status',
      entity_id: req.params.id,
    });
    res.redirect('/admin/statuses');
  });

  router.get('/admin/staff', ensureAdmin, async (_req, res) => {
    const staffMembers = await supportService.listStaffMembers();
    const roles = await supportService.listRoles();
    res.render('admin/staff', { pageTitle: 'Staff', staffMembers, roles });
  });

  router.post('/admin/staff', ensureAdmin, async (req, res) => {
    const staffId = await supportService.createStaffMember({
      discord_id: req.body.discord_id,
      role_id: req.body.role_id,
      is_active: req.body.is_active === '1',
    });
    await supportService.logAudit({
      actor_user_id: req.user.id,
      actor_discord_id: req.user.discord_id,
      actor_type: 'admin',
      action: 'staff.create',
      entity_type: 'staff',
      entity_id: staffId,
    });
    res.redirect('/admin/staff');
  });

  router.post('/admin/staff/:id', ensureAdmin, async (req, res) => {
    await supportService.updateStaffMember(req.params.id, {
      role_id: req.body.role_id,
      is_active: req.body.is_active === '1',
    });
    await supportService.logAudit({
      actor_user_id: req.user.id,
      actor_discord_id: req.user.discord_id,
      actor_type: 'admin',
      action: 'staff.update',
      entity_type: 'staff',
      entity_id: req.params.id,
    });
    res.redirect('/admin/staff');
  });

  router.get('/admin/roles', ensureAdmin, async (_req, res) => {
    const roles = await supportService.listRoles();
    res.render('admin/roles', {
      pageTitle: 'Roles',
      roles,
      permissionsList: PERMISSIONS,
    });
  });

  router.post('/admin/roles', ensureAdmin, async (req, res) => {
    const permissions = String(req.body.permissions || '')
      .split(',')
      .map((val) => val.trim())
      .filter(Boolean);
    const roleId = await supportService.createRole({
      name: req.body.name,
      permissions,
      is_admin: req.body.is_admin === '1',
    });
    await supportService.logAudit({
      actor_user_id: req.user.id,
      actor_discord_id: req.user.discord_id,
      actor_type: 'admin',
      action: 'role.create',
      entity_type: 'role',
      entity_id: roleId,
    });
    res.redirect('/admin/roles');
  });

  router.post('/admin/roles/:id', ensureAdmin, async (req, res) => {
    const permissions = String(req.body.permissions || '')
      .split(',')
      .map((val) => val.trim())
      .filter(Boolean);
    await supportService.updateRole(req.params.id, {
      name: req.body.name,
      permissions,
      is_admin: req.body.is_admin === '1',
    });
    await supportService.logAudit({
      actor_user_id: req.user.id,
      actor_discord_id: req.user.discord_id,
      actor_type: 'admin',
      action: 'role.update',
      entity_type: 'role',
      entity_id: req.params.id,
    });
    res.redirect('/admin/roles');
  });

  router.get('/admin/audit', ensureAdmin, async (_req, res) => {
    const logs = await supportService.listAuditLogs(200);
    res.render('admin/audit', { pageTitle: 'Audit Log', logs });
  });

  router.get('/attachments/:id', ensureUser, async (req, res) => {
    const attachment = await supportService.getAttachmentById(req.params.id);
    if (!attachment) return res.status(404).send('Attachment not found.');
    if (attachment.storage_url) {
      return res.redirect(attachment.storage_url);
    }
    const ticketMessage = await supportService.getTicketMessageById(
      attachment.ticket_message_id
    );
    if (!ticketMessage) return res.status(404).send('Attachment not found.');
    const ticket = await supportService.getTicketById(ticketMessage.ticket_id);
    if (!ticket) return res.status(404).send('Attachment not found.');
    if (!req.staff && ticket.creator_user_id !== req.user.id) {
      return res.status(403).send('Access denied.');
    }
    const filePath = path.join(process.cwd(), attachment.storage_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File missing.');
    }
    res.sendFile(filePath);
  });

  return router;
}

async function saveAttachments(ticketPublicId, messageId, files) {
  if (!files || files.length === 0) return;
  const dir = await supportService.ensureUploadDir(ticketPublicId);
  for (const file of files) {
    const safeName = `${Date.now()}-${file.originalname}`.replace(
      /[^A-Za-z0-9_.-]/g,
      '_'
    );
    const fullPath = path.join(dir, safeName);
    await fs.promises.writeFile(fullPath, file.buffer);
    const relativePath = path.relative(process.cwd(), fullPath);
    await supportService.addAttachmentRecord({
      ticket_message_id: messageId,
      filename: file.originalname,
      storage_path: relativePath,
      mime_type: file.mimetype,
      size_bytes: file.size,
    });
  }
}

async function collectAttachmentsForMessage(messageId) {
  const attachments = await supportService.listMessageAttachments(messageId);
  return attachments.map((attachment) => {
    if (attachment.storage_url) {
      return { attachment: attachment.storage_url, name: attachment.filename };
    }
    return {
      attachment: path.join(process.cwd(), attachment.storage_path),
      name: attachment.filename,
    };
  });
}

async function notifyWebTicketUpdate(discord, { ticket, actor, note }) {
  if (!discord || !CONFIG.DISCORD_SUPPORT_NOTIFY_CHANNEL_ID) return;
  const mention =
    ticket.assigned_discord_id ? `<@${ticket.assigned_discord_id}>` : '';
  await discord.sendSupportChannelMessage(
    `${mention} Ticket ${ticket.public_id} update: ${note}`,
    ticket
  );
  if (actor?.discord_id) {
    await supportService.logAudit({
      actor_user_id: actor.id,
      actor_discord_id: actor.discord_id,
      actor_type: 'user',
      action: 'ticket.notify',
      entity_type: 'ticket',
      entity_id: ticket.public_id,
      metadata: { note },
    });
  }
}

module.exports = { createSupportRouter };

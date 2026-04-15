/**
 * graphCalendar.ts
 * Sends Outlook calendar invites to KUMii staff (22onsloane.co) via Microsoft
 * Graph API using app-only (client credentials) authentication.
 *
 * Required env vars:
 *   MS_TENANT_ID      – 7ecb6702-3bbc-4ed1-a666-e203977bab9b
 *   MS_CLIENT_ID      – 7f8c0e70-291b-4d30-998a-4c839d51ca96
 *   MS_CLIENT_SECRET  – from Azure App Registration → Certificates & secrets
 *
 * Required Graph permissions (Application, not Delegated):
 *   Calendars.ReadWrite
 */

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import logger from '../logger.js';
import config from '../config.js';

// ── Graph client (lazy singleton) ─────────────────────────────────────────────

let _graphClient: Client | null = null;

function getGraphClient(): Client | null {
  if (!config.MS_TENANT_ID || !config.MS_CLIENT_ID || !config.MS_CLIENT_SECRET) {
    return null; // Graph not configured — skip calendar invites
  }
  if (_graphClient) return _graphClient;

  const credential = new ClientSecretCredential(
    config.MS_TENANT_ID,
    config.MS_CLIENT_ID,
    config.MS_CLIENT_SECRET,
  );

  _graphClient = Client.init({
    authProvider: async (done) => {
      try {
        const token = await credential.getToken('https://graph.microsoft.com/.default');
        done(null, token.token);
      } catch (err: any) {
        done(err, null);
      }
    },
  });

  return _graphClient;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalendarInviteOptions {
  /** Recipient's email address (must be in the tenant or a guest) */
  recipientEmail: string;
  recipientName:  string;
  roomName:       string;
  slotStart:      string; // ISO UTC e.g. "2026-04-16T08:00:00.000Z"
  slotEnd:        string; // ISO UTC e.g. "2026-04-16T09:00:00.000Z"
  notes?:         string;
  bookingId:      string;
  /** Organiser UPN — the mailbox used to send the invite (must have Calendars.ReadWrite) */
  organizerUpn?:  string;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Creates a calendar event in the organiser's calendar and sends an invite to
 * the recipient.  Silently no-ops if Graph credentials are not configured.
 */
export async function sendCalendarInvite(opts: CalendarInviteOptions): Promise<void> {
  const client = getGraphClient();
  if (!client) {
    logger.info('Graph not configured — skipping calendar invite', { bookingId: opts.bookingId });
    return;
  }

  // Default organiser: bookings@22onsloane.co (or configurable via env)
  const organizer = opts.organizerUpn ?? config.MS_CALENDAR_ORGANIZER ?? 'bookings@22onsloane.co';

  // Format the slot as SAST for the subject line
  const startSAST = new Date(new Date(opts.slotStart).getTime() + 2 * 60 * 60 * 1000);
  const endSAST   = new Date(new Date(opts.slotEnd).getTime()   + 2 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}T${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}:00`;

  const event = {
    subject: `Boardroom booking – ${opts.roomName}`,
    body: {
      contentType: 'HTML',
      content: `
        <p>Hi ${opts.recipientName},</p>
        <p>Your boardroom booking at <strong>22 On Sloane</strong> is confirmed.</p>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
          <tr><td style="padding:4px 12px 4px 0;color:#666;">Room</td><td><strong>${opts.roomName}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666;">Date</td><td><strong>${startSAST.toUTCString().slice(0,16)}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666;">Time</td><td><strong>${String(startSAST.getUTCHours()).padStart(2,'0')}:00 – ${String(endSAST.getUTCHours()).padStart(2,'0')}:00 SAST</strong></td></tr>
          ${opts.notes ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Notes</td><td>${opts.notes}</td></tr>` : ''}
        </table>
        <p style="color:#888;font-size:12px;margin-top:16px;">Booking ID: ${opts.bookingId}</p>
      `,
    },
    start: {
      dateTime: fmt(startSAST),
      timeZone: 'South Africa Standard Time',
    },
    end: {
      dateTime: fmt(endSAST),
      timeZone: 'South Africa Standard Time',
    },
    location: {
      displayName: `${opts.roomName} – 22 On Sloane, Sandton`,
    },
    attendees: [
      {
        emailAddress: {
          address: opts.recipientEmail,
          name:    opts.recipientName,
        },
        type: 'required',
      },
    ],
    isOnlineMeeting:      false,
    showAs:               'busy',
    reminderMinutesBeforeStart: 15,
    isReminderOn:         true,
    responseRequested:    false,   // no RSVP — it's already confirmed
    transactionId:        opts.bookingId, // idempotency key
  };

  try {
    await client.api(`/users/${organizer}/events`).post(event);
    logger.info('Outlook calendar invite sent', {
      bookingId: opts.bookingId,
      recipient: opts.recipientEmail,
      organizer,
    });
  } catch (err: any) {
    // Calendar invite failures must NEVER break the booking confirmation
    logger.error('Failed to send Outlook calendar invite', {
      bookingId:   opts.bookingId,
      recipient:   opts.recipientEmail,
      error:       err?.message,
      statusCode:  err?.statusCode,
    });
  }
}

/**
 * Deletes a previously created calendar event by its booking ID (transactionId).
 * Used when a booking is cancelled — silently no-ops if Graph is not configured
 * or the event is not found.
 */
export async function deleteCalendarEvent(
  bookingId:    string,
  organizerUpn?: string,
): Promise<void> {
  const client = getGraphClient();
  if (!client) return;

  const organizer = organizerUpn ?? config.MS_CALENDAR_ORGANIZER ?? 'bookings@22onsloane.co';

  try {
    // Find the event by transactionId (subject contains booking ID as fallback)
    const response = await client
      .api(`/users/${organizer}/events`)
      .filter(`transactionId eq '${bookingId}'`)
      .select('id')
      .get();

    const events = response?.value ?? [];
    for (const ev of events) {
      await client.api(`/users/${organizer}/events/${ev.id}`).delete();
      logger.info('Outlook calendar event deleted', { bookingId, eventId: ev.id });
    }
  } catch (err: any) {
    logger.warn('Could not delete Outlook calendar event', { bookingId, error: err?.message });
  }
}

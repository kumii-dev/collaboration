import { Resend } from 'resend';
import config from '../config.js';
import logger from '../logger.js';
import { retry } from '../utils/helpers.js';

// Initialize Resend only if API key is available
const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send email with retry logic
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  // Skip if email is not configured
  if (!resend || !config.RESEND_API_KEY || !config.RESEND_FROM_EMAIL) {
    logger.warn('Email service not configured, skipping email send', {
      to: options.to,
      subject: options.subject,
    });
    return false;
  }

  try {
    await retry(async () => {
      const result = await resend.emails.send({
        from: options.from || config.RESEND_FROM_EMAIL!,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
        id: result.data?.id,
      });
    }, 3, 2000);

    return true;
  } catch (error) {
    logger.error('Failed to send email', {
      error,
      to: options.to,
      subject: options.subject,
    });
    return false;
  }
}

/**
 * Send mention notification email
 */
export async function sendMentionEmail(
  to: string,
  mentionedBy: string,
  context: string,
  link: string
): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4f46e5; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9fafb; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>You've been mentioned on Kumii</h2>
        </div>
        <div class="content">
          <p><strong>${mentionedBy}</strong> mentioned you:</p>
          <blockquote style="border-left: 3px solid #4f46e5; padding-left: 15px; margin: 20px 0;">
            ${context}
          </blockquote>
          <a href="${link}" class="button">View Full Discussion</a>
        </div>
        <div class="footer">
          <p>You're receiving this email because you have notifications enabled on Kumii.</p>
          <p>To unsubscribe or manage your notification preferences, visit your account settings.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `${mentionedBy} mentioned you on Kumii`,
    html,
  });
}

/**
 * Send reply notification email
 */
export async function sendReplyEmail(
  to: string,
  repliedBy: string,
  originalContent: string,
  replyContent: string,
  link: string
): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4f46e5; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9fafb; }
        .original { background-color: #e5e7eb; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .reply { background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 3px solid #4f46e5; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>New Reply to Your Post</h2>
        </div>
        <div class="content">
          <p><strong>${repliedBy}</strong> replied to your post:</p>
          <div class="original">
            <small>Your post:</small>
            <p>${originalContent}</p>
          </div>
          <div class="reply">
            <small>${repliedBy}'s reply:</small>
            <p>${replyContent}</p>
          </div>
          <a href="${link}" class="button">View Full Thread</a>
        </div>
        <div class="footer">
          <p>You're receiving this email because you have notifications enabled on Kumii.</p>
          <p>To unsubscribe or manage your notification preferences, visit your account settings.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `${repliedBy} replied to your post on Kumii`,
    html,
  });
}

/**
 * Send moderation notice email
 */
export async function sendModerationEmail(
  to: string,
  action: string,
  reason: string,
  duration?: string
): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #ef4444; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9fafb; }
        .warning { background-color: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Moderation Notice</h2>
        </div>
        <div class="content">
          <p>A moderation action has been taken on your account:</p>
          <div class="warning">
            <p><strong>Action:</strong> ${action}</p>
            <p><strong>Reason:</strong> ${reason}</p>
            ${duration ? `<p><strong>Duration:</strong> ${duration}</p>` : ''}
          </div>
          <p>If you believe this action was taken in error, please contact our support team.</p>
          <p>Please review our community guidelines to ensure future compliance.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Kumii Platform. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: 'Kumii Moderation Notice',
    html,
  });
}

export default { sendEmail, sendMentionEmail, sendReplyEmail, sendModerationEmail };

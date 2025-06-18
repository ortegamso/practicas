import nodemailer, { Transporter } from 'nodemailer';
import Mail from 'nodemailer/lib/mailer'; // For Mail.Options type
import config from '../../config';
import { IUser } from '../../models/mongodb/user.model'; // To get user email
import { Order as CcxtOrder } from 'ccxt'; // For trade notification details

// Define a simple structure for email options
export interface EmailOptions {
  to: string; // Recipient's email address
  subject: string;
  text?: string; // Plain text body
  html?: string; // HTML body
  // from?: string; // Optional: defaults to config.smtp.fromAddress
}

class NotificationService {
  private transporter: Transporter | null = null;

  constructor() {
    if (config.smtp && config.smtp.host && config.smtp.user && config.smtp.pass) {
      const smtpConfig = {
        host: config.smtp.host,
        port: config.smtp.port || 587,
        secure: config.smtp.secure || false, // true for 465, false for other ports (STARTTLS)
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass,
        },
        // Optional: Add TLS options if needed, e.g. for self-signed certs
        // tls: {
        //   rejectUnauthorized: false // Only for testing with self-signed certs
        // }
      };
      this.transporter = nodemailer.createTransport(smtpConfig);

      this.transporter.verify((error, success) => {
        if (error) {
          console.error('[NotificationService] SMTP transporter verification failed:', error);
          this.transporter = null; // Disable email sending if verification fails
        } else {
          console.log('[NotificationService] SMTP transporter is ready to send emails.');
        }
      });
    } else {
      console.warn('[NotificationService] SMTP configuration is incomplete. Email notifications will be disabled.');
    }
  }

  public async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      console.warn('[NotificationService] Email not sent: SMTP transporter is not configured or failed verification.');
      return false;
    }

    const mailOptions: Mail.Options = {
      from: \`"\${config.smtp?.fromName || 'Crypto Platform'}" <\${config.smtp?.fromAddress || 'noreply@example.com'}>\`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(\`[NotificationService] Email sent successfully to \${options.to}. Message ID: \${info.messageId}\`);
      // For Ethereal, log the preview URL: console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
      return true;
    } catch (error) {
      console.error(\`[NotificationService] Error sending email to \${options.to}:\`, error);
      return false;
    }
  }

  // --- Specific Notification Methods ---

  /**
   * Sends a notification about a new user registration.
   * @param user The newly registered user.
   */
  public async sendWelcomeEmail(user: Pick<IUser, 'email' | 'username'>): Promise<void> {
    if (!user || !user.email) return;
    await this.sendEmail({
      to: user.email,
      subject: 'Welcome to Our Crypto Trading Platform!',
      html: \`<h1>Hi \${user.username || 'there'},</h1>
             <p>Welcome to the platform! We're excited to have you.</p>
             <p>Start exploring our features now.</p>\`,
      text: \`Hi \${user.username || 'there'},

Welcome to the platform! We're excited to have you.
Start exploring our features now.\`
    });
  }

  /**
   * Sends a notification about a successfully executed trade.
   * @param user User object containing at least email.
   * @param orderDetails The CCXT order object for the executed trade.
   */
  public async sendTradeNotification(user: Pick<IUser, 'email' | 'username'>, orderDetails: CcxtOrder): Promise<void> {
    if (!user || !user.email) return;
    if (!orderDetails || !orderDetails.symbol) return;

    const subject = \`Trade Executed: \${orderDetails.side.toUpperCase()} \${orderDetails.filled || orderDetails.amount} \${orderDetails.symbol}\`;
    const htmlBody = \`
      <h1>Trade Confirmation</h1>
      <p>Hi \${user.username || 'User'},</p>
      <p>Your trade has been executed:</p>
      <ul>
        <li><strong>Symbol:</strong> \${orderDetails.symbol}</li>
        <li><strong>Side:</strong> \${orderDetails.side.toUpperCase()}</li>
        <li><strong>Amount:</strong> \${orderDetails.filled || orderDetails.amount} \${orderDetails.symbol.split('/')[0]}</li>
        <li><strong>Price:</strong> \${orderDetails.average || orderDetails.price} \${orderDetails.symbol.split('/')[1]}</li>
        <li><strong>Status:</strong> \${orderDetails.status}</li>
        <li><strong>Order ID:</strong> \${orderDetails.id}</li>
        <li><strong>Timestamp:</strong> \${new Date(orderDetails.timestamp).toLocaleString()}</li>
      </ul>
      <p>Thank you for trading with us!</p>
    \`;
    const textBody = \`
      Trade Confirmation
      Hi \${user.username || 'User'},
      Your trade has been executed:
      - Symbol: \${orderDetails.symbol}
      - Side: \${orderDetails.side.toUpperCase()}
      - Amount: \${orderDetails.filled || orderDetails.amount} \${orderDetails.symbol.split('/')[0]}
      - Price: \${orderDetails.average || orderDetails.price} \${orderDetails.symbol.split('/')[1]}
      - Status: \${orderDetails.status}
      - Order ID: \${orderDetails.id}
      - Timestamp: \${new Date(orderDetails.timestamp).toLocaleString()}
      Thank you for trading with us!
    \`;

    await this.sendEmail({
      to: user.email,
      subject: subject,
      html: htmlBody,
      text: textBody,
    });
  }

  // TODO: Add other notification methods:
  // - Password reset email
  // - Order status update (e-commerce)
  // - Support ticket update
  // - Price alerts (if implementing)
  // - Liquidation warnings (if managing positions)
}

export default new NotificationService();

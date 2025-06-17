import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUser } from './user.model';

export enum TicketStatus {
  OPEN = 'open',           // Newly created by user, or reopened
  PENDING_USER_REPLY = 'pending_user_reply', // Agent replied, waiting for user
  PENDING_AGENT_REPLY = 'pending_agent_reply', // User replied, waiting for agent
  IN_PROGRESS = 'in_progress', // Agent is actively working on it
  RESOLVED = 'resolved',     // Issue resolved, solution provided
  CLOSED = 'closed',         // Ticket closed after resolution or inactivity
  // ON_HOLD = 'on_hold',    // Waiting for external factors or information
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export interface ITicketReply extends Document {
  user: mongoose.Types.ObjectId | IUser; // User who made the reply (can be customer or agent)
  message: string;
  isAgentReply: boolean; // True if reply is from a support agent
  createdAt: Date;
  // attachments?: string[]; // URLs to attachments for this reply
}

const TicketReplySchema: Schema<ITicketReply> = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    minlength: [1, 'Reply message cannot be empty.'],
    maxlength: [5000, 'Reply message too long.'],
  },
  isAgentReply: {
    type: Boolean,
    default: false,
  },
  // attachments: [{ type: String }],
}, { timestamps: { createdAt: true, updatedAt: false } }); // Only createdAt for replies

export interface ISupportTicket extends Document {
  user: mongoose.Types.ObjectId | IUser; // User who created the ticket
  ticketId: string; // Custom, human-readable ticket ID (e.g., TKT-YYYYMMDD-XXXXX)
  subject: string;
  initialMessage: string; // The first message from the user when creating the ticket
  category?: string; // e.g., 'Billing', 'Technical', 'General Inquiry', 'Bug Report'
  status: TicketStatus | string;
  priority: TicketPriority | string;
  replies: ITicketReply[];
  assignedAgent?: mongoose.Types.ObjectId | IUser; // Support agent assigned to this ticket
  lastReplyAt: Date; // Timestamp of the last reply (either user or agent)
  // attachments?: string[]; // URLs to attachments for the initial message
  // tags?: string[];
  // relatedOrder?: mongoose.Types.ObjectId; // Link to an order if relevant
  // relatedProduct?: mongoose.Types.ObjectId; // Link to a product if relevant
  createdAt: Date;
  updatedAt: Date; // Used for general updates, lastReplyAt for conversation flow
  resolvedAt?: Date;
  closedAt?: Date;
}

export interface ISupportTicketModel extends Model<ISupportTicket> {}

const SupportTicketSchema: Schema<ISupportTicket, ISupportTicketModel> = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  ticketId: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },
  subject: {
    type: String,
    required: [true, 'Subject is required.'],
    trim: true,
    minlength: [5, 'Subject must be at least 5 characters.'],
    maxlength: [200, 'Subject cannot exceed 200 characters.'],
  },
  initialMessage: { // Storing initial message separately for clarity
    type: String,
    required: [true, 'An initial message is required to create a ticket.'],
    trim: true,
    minlength: [10, 'Initial message must be at least 10 characters.'],
    maxlength: [5000, 'Initial message too long.'],
  },
  category: {
    type: String,
    trim: true,
    // enum: ['Billing', 'Technical', 'General Inquiry', 'Bug Report', 'Account'], // Example categories
  },
  status: {
    type: String,
    enum: Object.values(TicketStatus),
    default: TicketStatus.OPEN,
    required: true,
    index: true,
  },
  priority: {
    type: String,
    enum: Object.values(TicketPriority),
    default: TicketPriority.MEDIUM,
    required: true,
    index: true,
  },
  replies: [TicketReplySchema],
  assignedAgent: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Assuming agents are also Users with a specific role
    index: true,
    default: null,
  },
  lastReplyAt: { // Important for sorting and tracking SLA
    type: Date,
    default: Date.now, // Initially set to creation time, updated with each reply
    index: true,
  },
  // attachments: [{ type: String }],
  // tags: [{ type: String, trim: true, lowercase: true }],
  // relatedOrder: { type: Schema.Types.ObjectId, ref: 'Order' },
  // relatedProduct: { type: Schema.Types.ObjectId, ref: 'Product' },
  resolvedAt: { type: Date },
  closedAt: { type: Date },
}, { timestamps: true }); // createdAt, updatedAt for the ticket itself

// Pre-save hook to generate custom ticketId
SupportTicketSchema.pre<ISupportTicket>('save', function(next) {
  if (this.isNew && !this.ticketId) { // Only if new and ticketId not already set
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2); // Last 2 digits of year
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
    this.ticketId = \`TKT-\${year}\${month}\${day}-\${randomPart}\`;
  }
  // If it's a new ticket, the initial message is part of the main document.
  // If first reply is added and it's the initial creation, this hook ensures lastReplyAt is set.
  if (this.isNew) {
      this.lastReplyAt = this.createdAt || new Date();
  }
  next();
});

const SupportTicket: ISupportTicketModel = mongoose.model<ISupportTicket, ISupportTicketModel>('SupportTicket', SupportTicketSchema);
export default SupportTicket;
console.log('SupportTicket model loaded.');

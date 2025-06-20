import SupportTicket, { ISupportTicket, TicketStatus, TicketPriority, ITicketReply } from '../../models/mongodb/supportTicket.model';
import User, { IUser, UserRole } from '../../models/mongodb/user.model'; // To check if replier is agent
import { AppError, HttpCode } from '../../utils/appError';
import mongoose from 'mongoose';

// DTO for creating a support ticket
export interface TicketCreateDto {
  userId: string | mongoose.Types.ObjectId;
  subject: string;
  initialMessage: string;
  category?: string;
  priority?: TicketPriority | string;
  // attachments?: string[];
}

// DTO for adding a reply
export interface TicketReplyDto {
  ticketId: string; // Custom TKT-ID or MongoDB _id
  userId: string | mongoose.Types.ObjectId; // User making the reply
  message: string;
  // attachments?: string[];
}

// DTO for admin/agent updates to a ticket
export interface TicketUpdateAdminDto {
  status?: TicketStatus | string;
  priority?: TicketPriority | string;
  category?: string;
  assignedAgentId?: string | mongoose.Types.ObjectId | null; // null to unassign
}

export type SupportTicketResponseDto = ISupportTicket; // For now, return full document

class SupportTicketService {

  public async createTicket(data: TicketCreateDto): Promise<SupportTicketResponseDto> {
    const { userId, subject, initialMessage, category, priority } = data;

    const newTicket = new SupportTicket({
      user: userId,
      subject,
      initialMessage,
      category: category || 'General Inquiry', // Default category
      priority: priority || TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      // ticketId is auto-generated by pre-save hook
      // lastReplyAt is also set by pre-save hook initially
    });

    try {
      const savedTicket = await newTicket.save();
      // TODO: Send notification to support team / user
      return savedTicket;
    } catch (error: any) {
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((err: any) => err.message).join(' ');
        throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: messages});
      }
      console.error("Error creating support ticket:", error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to create support ticket.' });
    }
  }

  public async addReply(data: TicketReplyDto): Promise<SupportTicketResponseDto | null> {
    const { ticketId: ticketIdParam, userId, message } = data;

    const ticket = await this.findTicketByIdOrTicketId(ticketIdParam);
    if (!ticket) {
      throw new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Support ticket not found.' });
    }

    // Check if the user adding reply is the ticket owner or an admin/agent
    const replier = await User.findById(userId);
    if (!replier) {
        throw new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Replying user not found.' });
    }

    const isAgentReply = replier.roles.includes(UserRole.ADMIN) || replier.roles.includes('support_agent' as UserRole); // Assuming 'support_agent' role

    // Ensure ticket is not in a state that prevents replies (e.g. closed, resolved by some policies)
    if ([TicketStatus.CLOSED, TicketStatus.RESOLVED].includes(ticket.status as TicketStatus) && !isAgentReply) {
        throw new AppError({ httpCode: HttpCode.FORBIDDEN, description: \`Ticket is \${ticket.status} and cannot be replied to by user.\` });
    }


    const reply: Partial<ITicketReply> = { // Partial because _id, createdAt will be added by Mongoose
      user: userId,
      message,
      isAgentReply,
      // attachments: data.attachments,
    };

    ticket.replies.push(reply as ITicketReply); // Cast needed as it's not a full Document yet
    ticket.lastReplyAt = new Date();

    // Update ticket status based on who replied
    if (isAgentReply) {
      ticket.status = TicketStatus.PENDING_USER_REPLY; // Agent replied, waiting for user
    } else {
      // User is replying. If ticket was PENDING_USER_REPLY, it becomes PENDING_AGENT_REPLY.
      // If it was OPEN, it can remain OPEN or move to PENDING_AGENT_REPLY.
      ticket.status = TicketStatus.PENDING_AGENT_REPLY;
    }
    // If ticket was RESOLVED and user replies, it should probably re-open to PENDING_AGENT_REPLY
    if (ticket.status === TicketStatus.RESOLVED && !isAgentReply) {
        ticket.status = TicketStatus.PENDING_AGENT_REPLY;
        ticket.resolvedAt = undefined; // Clear resolvedAt
        ticket.closedAt = undefined; // Clear closedAt
    }


    try {
      const updatedTicket = await ticket.save();
      // TODO: Send notifications about the new reply
      return updatedTicket;
    } catch (error: any) {
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((err: any) => err.message).join(' ');
        throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: messages});
      }
      console.error("Error adding reply to ticket:", error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to add reply.' });
    }
  }

  // --- User Access ---
  public async findUserTickets(userId: string | mongoose.Types.ObjectId, page: number = 1, limit: number = 10, status?: TicketStatus | string): Promise<any> {
    const query: mongoose.FilterQuery<ISupportTicket> = { user: userId };
    if (status) query.status = status;

    const total = await SupportTicket.countDocuments(query);
    const tickets = await SupportTicket.find(query)
      .populate('replies.user', 'username email roles') // Populate user info in replies
      .sort({ lastReplyAt: -1 }) // Sort by most recent activity
      .skip((page - 1) * limit)
      .limit(limit);
    return { tickets, total, page, pages: Math.ceil(total / limit) };
  }

  public async findUserTicketById(ticketIdParam: string, userId: string | mongoose.Types.ObjectId): Promise<SupportTicketResponseDto | null> {
    const ticket = await this.findTicketByIdOrTicketId(ticketIdParam);
    if (ticket && ticket.user.toString() === userId.toString()) {
      // Optionally populate more details if needed for single view
      await ticket.populate('replies.user', 'username email roles');
      return ticket;
    }
    return null; // Not found or not owned by user
  }

  // --- Admin/Agent Access ---
  public async findAllTickets(page: number = 1, limit: number = 10, status?: TicketStatus | string, assignedAgentId?: string): Promise<any> {
    const query: mongoose.FilterQuery<ISupportTicket> = {};
    if (status) query.status = status;
    if (assignedAgentId) query.assignedAgent = assignedAgentId;
    // Add more filters: priority, category, user search etc.

    const total = await SupportTicket.countDocuments(query);
    const tickets = await SupportTicket.find(query)
      .populate('user', 'username email') // Populate ticket creator info
      .populate('assignedAgent', 'username email') // Populate assigned agent info
      .populate('replies.user', 'username email roles')
      .sort({ lastReplyAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    return { tickets, total, page, pages: Math.ceil(total / limit) };
  }

  public async findTicketByIdAsAdmin(ticketIdParam: string): Promise<SupportTicketResponseDto | null> {
    const ticket = await this.findTicketByIdOrTicketId(ticketIdParam);
    if (ticket) {
        await ticket.populate([
            { path: 'user', select: 'username email' },
            { path: 'assignedAgent', select: 'username email' },
            { path: 'replies.user', select: 'username email roles' }
        ]);
    }
    return ticket;
  }

  public async updateTicketByAdmin(ticketIdParam: string, adminId: string | mongoose.Types.ObjectId, updateData: TicketUpdateAdminDto): Promise<SupportTicketResponseDto | null> {
    const ticket = await this.findTicketByIdOrTicketId(ticketIdParam);
    if (!ticket) {
      return null; // Or throw Not Found
    }

    let changed = false;
    if (updateData.status && ticket.status !== updateData.status) {
        // TODO: Add more robust status transition logic if needed
        ticket.status = updateData.status;
        if (updateData.status === TicketStatus.RESOLVED && !ticket.resolvedAt) ticket.resolvedAt = new Date();
        else if (updateData.status !== TicketStatus.RESOLVED) ticket.resolvedAt = undefined;

        if (updateData.status === TicketStatus.CLOSED && !ticket.closedAt) ticket.closedAt = new Date();
        else if (updateData.status !== TicketStatus.CLOSED) ticket.closedAt = undefined;
        changed = true;
    }
    if (updateData.priority && ticket.priority !== updateData.priority) {
        ticket.priority = updateData.priority;
        changed = true;
    }
    if (updateData.category && ticket.category !== updateData.category) {
        ticket.category = updateData.category;
        changed = true;
    }
    if (updateData.assignedAgentId !== undefined) { // Allows assigning to null (unassign)
        if (updateData.assignedAgentId === null) {
            ticket.assignedAgent = undefined; // Mongoose way to set to null/undefined
        } else {
            if (!mongoose.Types.ObjectId.isValid(updateData.assignedAgentId.toString())) {
                 throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid assignedAgentId format.' });
            }
            // Optional: verify agent exists and has 'support_agent' role
            ticket.assignedAgent = updateData.assignedAgentId as mongoose.Types.ObjectId;
        }
        changed = true;
    }

    if (!changed) { // No actual changes to save besides potentially updatedAt
        return ticket;
    }

    try {
      const updatedTicket = await ticket.save();
      // TODO: Notify user/agent of changes
      return updatedTicket;
    } catch (error: any) {
      console.error(\`Error updating ticket \${ticketIdParam} by admin:\`, error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to update support ticket.' });
    }
  }

  // Helper to find by MongoDB _id or custom ticketId string
  private async findTicketByIdOrTicketId(idParam: string): Promise<ISupportTicket | null> {
    if (mongoose.Types.ObjectId.isValid(idParam)) {
      return SupportTicket.findById(idParam);
    } else if (idParam.startsWith('TKT-')) {
      return SupportTicket.findOne({ ticketId: idParam });
    }
    return null; // Invalid format or not found
  }
}

export default new SupportTicketService();

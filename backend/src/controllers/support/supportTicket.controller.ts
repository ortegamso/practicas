import { Request, Response, NextFunction } from 'express';
import SupportTicketService, { TicketCreateDto, TicketReplyDto, TicketUpdateAdminDto } from '../../services/support/supportTicket.service';
import { AppError, HttpCode } from '../../utils/appError';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { TicketStatus, TicketPriority } from '../../models/mongodb/supportTicket.model'; // For validation
import mongoose from 'mongoose';


class SupportTicketController {
  // --- User Routes ---
  public async createTicket(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { subject, initialMessage, category, priority } = req.body;

      if (!subject || !initialMessage) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Subject and initial message are required.' });
      }
      if (priority && !Object.values(TicketPriority).includes(priority as TicketPriority)) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid priority value.' });
      }

      const createDto: TicketCreateDto = {
        userId: req.user.id,
        subject,
        initialMessage,
        category,
        priority: priority as TicketPriority,
      };
      const ticket = await SupportTicketService.createTicket(createDto);
      res.status(HttpCode.CREATED).json(ticket);
    } catch (error) {
      next(error);
    }
  }

  public async addReply(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { ticketId } = req.params; // Custom TKT-ID or MongoDB _id
      const { message } = req.body;

      if (!message) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Reply message is required.' });
      }

      const replyDto: TicketReplyDto = {
        ticketId,
        userId: req.user.id,
        message,
      };
      const updatedTicket = await SupportTicketService.addReply(replyDto);
      res.status(HttpCode.OK).json(updatedTicket);
    } catch (error) {
      next(error);
    }
  }

  public async getUserTickets(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const status = req.query.status as TicketStatus | undefined;

      if (isNaN(page) || page <=0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'page' parameter."});
      if (isNaN(limit) || limit <=0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'limit' parameter."});
      if (status && !Object.values(TicketStatus).includes(status)) {
          throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid status filter value.' });
      }

      const result = await SupportTicketService.findUserTickets(req.user.id, page, limit, status);
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async getUserTicketById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { ticketId } = req.params;
      const ticket = await SupportTicketService.findUserTicketById(ticketId, req.user.id);
      if (!ticket) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Support ticket not found or access denied.' }));
      }
      res.status(HttpCode.OK).json(ticket);
    } catch (error) {
      next(error);
    }
  }

  // --- Admin/Agent Routes ---
  public async getAllTickets(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    // Assumes isAdmin middleware has already verified user role
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const status = req.query.status as TicketStatus | undefined;
      const assignedAgentId = req.query.agentId as string | undefined;

      if (isNaN(page) || page <=0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'page' parameter."});
      if (isNaN(limit) || limit <=0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'limit' parameter."});
      if (status && !Object.values(TicketStatus).includes(status)) {
          throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid status filter value.' });
      }
      if (assignedAgentId && !mongoose.Types.ObjectId.isValid(assignedAgentId)) {
          throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid agentId format.' });
      }


      const result = await SupportTicketService.findAllTickets(page, limit, status, assignedAgentId);
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async getTicketByIdAsAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ticketId } = req.params;
      const ticket = await SupportTicketService.findTicketByIdAsAdmin(ticketId);
      if (!ticket) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Support ticket not found.' }));
      }
      res.status(HttpCode.OK).json(ticket);
    } catch (error) {
      next(error);
    }
  }

  public async updateTicketByAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
     try {
      if (!req.user) { // Should be caught by 'protect' middleware already
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'Admin/Agent not authenticated.' }));
      }
      const { ticketId } = req.params;
      const { status, priority, category, assignedAgentId } = req.body;

      const updateDto: TicketUpdateAdminDto = {};
      if (status) {
          if (!Object.values(TicketStatus).includes(status as TicketStatus)) {
              throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid status value.' });
          }
          updateDto.status = status as TicketStatus;
      }
      if (priority) {
          if (!Object.values(TicketPriority).includes(priority as TicketPriority)) {
              throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid priority value.' });
          }
          updateDto.priority = priority as TicketPriority;
      }
      if (category !== undefined) updateDto.category = category; // Allow empty string for category
      if (assignedAgentId !== undefined) { // Allows null to unassign
          if (assignedAgentId !== null && !mongoose.Types.ObjectId.isValid(assignedAgentId)) {
              throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid assignedAgentId format.' });
          }
          updateDto.assignedAgentId = assignedAgentId;
      }

      if (Object.keys(updateDto).length === 0) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'No update data provided.' });
      }

      const updatedTicket = await SupportTicketService.updateTicketByAdmin(ticketId, req.user.id, updateDto);
      if (!updatedTicket) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Support ticket not found or update failed.' }));
      }
      res.status(HttpCode.OK).json(updatedTicket);
    } catch (error) {
      next(error);
    }
  }
}

export default new SupportTicketController();

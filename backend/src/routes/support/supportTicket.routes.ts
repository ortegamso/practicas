import { Router } from 'express';
import SupportTicketController from '../../controllers/support/supportTicket.controller';
import { protect, isAdmin } from '../../middlewares/auth.middleware'; // Assuming isAdmin implies support agent rights or a new isSupportAgent middleware

const router = Router();

// --- User Authenticated Routes for their own tickets ---
router.post('/', protect, SupportTicketController.createTicket);
router.get('/', protect, SupportTicketController.getUserTickets); // Get list of my tickets
router.get('/:ticketId', protect, SupportTicketController.getUserTicketById); // Get my specific ticket
router.post('/:ticketId/replies', protect, SupportTicketController.addReply); // Add reply to my ticket


// --- Admin/Agent Routes (Consider a distinct prefix like /admin/support-tickets if preferred) ---
// For simplicity, adding them here with isAdmin guard.
// A more granular role 'isSupportAgent' could be created.
router.get('/manage/all', protect, isAdmin, SupportTicketController.getAllTickets); // Admin: Get all tickets
router.get('/manage/:ticketId', protect, isAdmin, SupportTicketController.getTicketByIdAsAdmin); // Admin: Get any ticket by ID
router.put('/manage/:ticketId', protect, isAdmin, SupportTicketController.updateTicketByAdmin); // Admin: Update ticket status, priority, assignment
// Admin can also use POST /:ticketId/replies if the service logic for addReply checks for agent role for status updates.

export default router;

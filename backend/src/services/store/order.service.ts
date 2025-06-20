import Order, { IOrder, IOrderItem, OrderStatus } from '../../models/mongodb/order.model';
import Product, { IProduct } from '../../models/mongodb/product.model';
import { AppError, HttpCode } from '../../utils/appError';
import mongoose from 'mongoose';

// DTO for creating an order
export interface OrderItemCreateDto {
  productId: string | mongoose.Types.ObjectId;
  quantity: number;
}
export interface OrderCreateDto {
  userId: string | mongoose.Types.ObjectId;
  items: OrderItemCreateDto[];
  currency?: string; // Optional, defaults to USD or product's currency
  shippingAddress?: any; // Simplified, use IShippingAddress for strong typing
  // Payment details would usually come from a payment gateway callback, not directly from user create DTO
}

// DTO for updating an order (typically by admin)
export interface OrderUpdateDto {
  status?: OrderStatus | string;
  shippingAddress?: any;
  trackingNumber?: string;
  notes?: string;
  // Other fields admin might update
}

export type OrderResponseDto = IOrder; // For now, return full order document

class OrderService {
  public async create(data: OrderCreateDto): Promise<OrderResponseDto> {
    const { userId, items, currency = 'USD', shippingAddress } = data;

    if (!items || items.length === 0) {
      throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Order must contain at least one item.' });
    }

    const populatedOrderItems: IOrderItem[] = [];
    let calculatedTotalAmount = 0;

    // --- Validate items and calculate total ---
    for (const itemDto of items) {
      if (!mongoose.Types.ObjectId.isValid(itemDto.productId)) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: \`Invalid product ID format: \${itemDto.productId}.\` });
      }
      const product = await Product.findById(itemDto.productId);
      if (!product) {
        throw new AppError({ httpCode: HttpCode.NOT_FOUND, description: \`Product with ID \${itemDto.productId} not found.\` });
      }
      if (!product.isActive) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: \`Product '\${product.name}' is not currently available.\` });
      }
      if (product.stock !== null && product.stock < itemDto.quantity) {
        throw new AppError({ httpCode: HttpCode.CONFLICT, description: \`Not enough stock for product '\${product.name}'. Available: \${product.stock}, Requested: \${itemDto.quantity}.\`});
      }

      // Denormalize product info for the order item
      const orderItem = {
        product: product._id,
        name: product.name,
        image: product.images && product.images.length > 0 ? product.images[0] : undefined,
        quantity: itemDto.quantity,
        price: product.price, // Price at time of order
        // currency: product.currency, // If items can have different currencies
      } as IOrderItem; // Cast to ensure type compatibility, _id will be handled by Mongoose for subdoc if schema allows

      populatedOrderItems.push(orderItem);
      calculatedTotalAmount += product.price * itemDto.quantity;
    }

    // TODO: Add shipping cost, taxes, subtract discounts from calculatedTotalAmount
    // For now, totalAmount is just sum of item prices.

    const newOrder = new Order({
      user: userId,
      items: populatedOrderItems,
      totalAmount: calculatedTotalAmount, // Pre-save hook will also calculate this
      currency: currency.toUpperCase(),
      status: OrderStatus.PENDING_PAYMENT, // Initial status
      shippingAddress: shippingAddress, // Assuming validation happens in controller or here
      // orderId will be auto-generated by pre-save hook
    });

    try {
      const savedOrder = await newOrder.save();

      // --- Update stock after order is successfully saved (if stock management is enabled) ---
      // This should ideally be in a transaction with order creation if DB supports it (MongoDB transactions)
      for (const item of savedOrder.items) {
          const product = await Product.findById(item.product); // Re-fetch product
          if (product && product.stock !== null) {
              product.stock -= item.quantity;
              await product.save(); // This could also fail, highlighting need for transactions
          }
      }
      return savedOrder;
    } catch (error: any) {
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((err: any) => err.message).join(' ');
        throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: messages});
      }
      console.error("Error creating order:", error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to create order.' });
    }
  }

  public async findUserOrders(userId: string | mongoose.Types.ObjectId, page: number = 1, limit: number = 10): Promise<{ orders: OrderResponseDto[], total: number, page: number, pages: number }> {
    const query = { user: userId };
    try {
        const total = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .populate('items.product', 'name slug images category') // Populate product details within items
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .exec();
        return { orders, total, page, pages: Math.ceil(total / limit) };
    } catch (error: any) {
        console.error("Error finding user orders:", error);
        throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to retrieve user orders.' });
    }
  }

  public async findOrderByIdForUser(orderId: string, userId: string | mongoose.Types.ObjectId): Promise<OrderResponseDto | null> {
     if (!mongoose.Types.ObjectId.isValid(orderId) && !orderId.startsWith('ORD-')) {
        // If it's not an ObjectId and not our custom format, it's likely invalid
        return null;
    }
    try {
        let query: mongoose.FilterQuery<IOrder>;
        if (mongoose.Types.ObjectId.isValid(orderId)) {
            query = { _id: orderId, user: userId };
        } else {
            query = { orderId: orderId, user: userId }; // Search by custom orderId
        }
        const order = await Order.findOne(query)
            .populate('items.product', 'name slug images category');
        return order;
    } catch (error: any) {
        console.error(\`Error finding order \${orderId} for user \${userId}:\`, error);
        throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to retrieve order.' });
    }
  }

  // --- Admin Methods ---
  public async findAllOrders(page: number = 1, limit: number = 10, status?: OrderStatus | string): Promise<{ orders: OrderResponseDto[], total: number, page: number, pages: number }> {
    const query: mongoose.FilterQuery<IOrder> = {};
    if (status) {
        query.status = status;
    }
    try {
        const total = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .populate('user', 'username email') // Populate user info for admin view
            .populate('items.product', 'name sku') // sku if you add it to product
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .exec();
        return { orders, total, page, pages: Math.ceil(total / limit) };
    } catch (error: any) {
        console.error("Error finding all orders (admin):", error);
        throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to retrieve orders.' });
    }
  }

  public async findOrderByIdAsAdmin(orderIdParam: string): Promise<OrderResponseDto | null> {
    let query: mongoose.FilterQuery<IOrder>;
    if (mongoose.Types.ObjectId.isValid(orderIdParam)) {
        query = { _id: orderIdParam };
    } else if (orderIdParam.startsWith('ORD-')) {
        query = { orderId: orderIdParam };
    } else {
        return null; // Invalid ID format
    }
    try {
        const order = await Order.findOne(query)
            .populate('user', 'username email')
            .populate('items.product', 'name');
        return order;
    } catch (error: any) {
        console.error(\`Error finding order \${orderIdParam} (admin):\`, error);
        throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to retrieve order.' });
    }
  }


  public async updateOrderStatus(orderIdParam: string, newStatus: OrderStatus | string, adminNotes?: string): Promise<OrderResponseDto | null> {
    let order = await this.findOrderByIdAsAdmin(orderIdParam); // Use admin find to get the order
    if (!order) {
      return null; // Or throw Not Found
    }

    // Basic state transition validation (can be more complex)
    if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELED || order.status === OrderStatus.REFUNDED) {
        if (order.status !== newStatus) { // Allow setting same status (idempotency)
            throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: \`Order in status '\${order.status}' cannot be changed to '\${newStatus}'.\` });
        }
    }

    // If order is being marked as paid or processing/shipped/completed after payment
    if (newStatus === OrderStatus.PAID ||
        (newStatus === OrderStatus.PROCESSING && order.status === OrderStatus.PENDING_PAYMENT) ||
        (newStatus === OrderStatus.SHIPPED && (order.status === OrderStatus.PROCESSING || order.status === OrderStatus.PAID)) ||
        (newStatus === OrderStatus.COMPLETED && (order.status === OrderStatus.PROCESSING || order.status === OrderStatus.PAID || order.status === OrderStatus.SHIPPED))
       ) {
        if (!order.paidAt) order.paidAt = new Date();
        if (!order.paymentStatus || order.paymentStatus === 'pending') order.paymentStatus = 'succeeded';
    }


    order.status = newStatus;
    if (adminNotes) {
        order.notes = order.notes ? order.notes + "\nAdmin: " + adminNotes : "Admin: " + adminNotes;
    }

    try {
      const updatedOrder = await order.save();
      // TODO: Emit event for order status update (e.g., for notifications, referrals)
      // eventEmitter.emit('order.status.updated', updatedOrder);
      return updatedOrder;
    } catch (error: any) {
      console.error(\`Error updating order status for \${orderIdParam}:\`, error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to update order status.' });
    }
  }
}

export default new OrderService();

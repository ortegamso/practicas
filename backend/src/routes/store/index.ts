import { Router } from 'express';
import productRouter from './product.routes';
import orderRouter from './order.routes'; // To be added later

const storeRouter = Router();

storeRouter.use('/products', productRouter);
storeRouter.use('/orders', orderRouter); // To be added later

export default storeRouter;

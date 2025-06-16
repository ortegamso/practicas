import { Router } from 'express';
import exchangeConfigRouter from './exchangeConfig.routes';
import walletRouter from './wallet.routes';
import marketDataRouter from './marketData.routes';
// import otherTradingRelatedRouters from './otherTrading.routes'; // Example

const tradingRouter = Router();

tradingRouter.use('/exchange-configs', exchangeConfigRouter);
tradingRouter.use('/wallets', walletRouter);
tradingRouter.use('/market-data', marketDataRouter);
// tradingRouter.use('/orders', orderRouter); // Example for future

export default tradingRouter;

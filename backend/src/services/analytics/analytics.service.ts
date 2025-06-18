import { query as pgQuery } from '../../database/timescaledb';
import mongoose from 'mongoose';
import { AppError, HttpCode } from '../../utils/appError';

// Define a structure for PNL results
export interface PnlResult {
  userId: string;
  symbol?: string; // Optional: PNL per symbol
  totalBuyAmount: number;
  totalSellAmount: number;
  netPnl: number;
  currency?: string; // Assuming all trades for a symbol are in a consistent quote currency
  // More detailed metrics could include:
  // numberOfTrades: number;
  // winningTrades: number;
  // losingTrades: number;
  // averageWin: number;
  // averageLoss: number;
}

class AnalyticsService {

  /**
   * Calculates a simplified Profit and Loss (PNL) for a user.
   * This is a very basic calculation: (Total Sell Value) - (Total Buy Value).
   * It does not account for fees, cost basis methods (FIFO/LIFO), or open positions.
   * Assumes transactions are for futures/contracts where PNL is realized per trade closure or funding.
   * For spot, true PNL requires tracking asset inventory and cost basis.
   *
   * @param userId The ID of the user.
   * @param symbol Optional: Specific symbol to calculate PNL for (e.g., 'BTC/USDT').
   * @param startDate Optional: Start date for PNL calculation.
   * @param endDate Optional: End date for PNL calculation.
   * @returns Promise<PnlResult | null>
   */
  public async calculateUserPnl(
    userId: string | mongoose.Types.ObjectId,
    symbol?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<PnlResult | null> {
    // This query assumes bot_transactions stores executed trades with price and quantity
    // and that 'side' is implicitly part of the transaction (e.g. positive quantity for buy, negative for sell, or a 'side' column)
    // For simplicity, let's assume 'bot_transactions' has 'price', 'quantity', and 'side' ('buy' or 'sell')
    // and 'fee' and 'fee_currency'. We will ignore fees for this basic PNL.
    // Also, we need a common currency for PNL. If trades are in different quote currencies, this becomes complex.
    // Let's assume for a given symbol (e.g., BTC/USDT), the PNL is in USDT.

    const params: any[] = [userId.toString()];
    let sql = \`
      SELECT
        bt.side,
        SUM(bt.price * bt.quantity) as total_value,
        -- For spot, we'd also need to group by the quote currency if not always USD/USDT
        -- For futures, PNL is usually in the quote currency of the contract
        s.quote_asset as currency -- Assuming 'symbols' table has base_asset and quote_asset
      FROM bot_transactions bt
      JOIN bot_orders bo ON bt.bot_order_id = bo.id
      JOIN symbols s ON bo.symbol_id = s.id -- To get currency if needed
      WHERE bo.user_id = \$1
    \`;

    let paramIndex = 2;
    if (symbol) {
      // This requires symbol_id. If symbol string is 'BTC/USDT', we'd need to look up its ID.
      // For now, let's assume the 'symbols' table has a 'name' column like 'BTC/USDT'
      // and bot_orders directly or indirectly links to this symbol name or symbol_id.
      // Let's adjust to query based on symbol name from symbols table directly.
      sql += \` AND s.name = \$${paramIndex++}\`;
      params.push(symbol.toUpperCase());
    }
    if (startDate) {
      sql += \` AND bt.transaction_time >= \$${paramIndex++}\`;
      params.push(startDate);
    }
    if (endDate) {
      sql += \` AND bt.transaction_time <= \$${paramIndex++}\`;
      params.push(endDate);
    }

    sql += \` GROUP BY bt.side, s.quote_asset\`;

    try {
      const result = await pgQuery(sql, params);

      let totalBuyAmount = 0;
      let totalSellAmount = 0;
      let pnlCurrency: string | undefined = undefined;

      if (result.rows.length === 0 && !symbol) {
          // No transactions at all for this user
          return { userId: userId.toString(), totalBuyAmount: 0, totalSellAmount: 0, netPnl: 0, currency: 'N/A' };
      }
      if (result.rows.length === 0 && symbol) {
          // No transactions for this specific symbol
          // We need a way to determine currency if there are no trades.
          // For now, return null or PNL 0 with undefined currency.
          const symbolInfo = await pgQuery("SELECT quote_asset FROM symbols WHERE name = \$1", [symbol.toUpperCase()]);
          pnlCurrency = symbolInfo.rows[0]?.quote_asset || 'N/A';
          return { userId: userId.toString(), symbol, totalBuyAmount: 0, totalSellAmount: 0, netPnl: 0, currency: pnlCurrency };
      }


      result.rows.forEach(row => {
        if (!pnlCurrency && row.currency) {
            pnlCurrency = row.currency;
        } else if (row.currency && pnlCurrency !== row.currency) {
            // This indicates trades in different quote currencies for the selection.
            // Simple PNL sum is not meaningful. Throw error or handle more complex conversion.
            console.error(\`[AnalyticsService] PNL calculation error: Mixed quote currencies found (\${pnlCurrency} vs \${row.currency}) for user \${userId}, symbol \${symbol || 'all'}. This basic PNL cannot sum them.\`);
            // For now, we'll just use the first currency found and sum, which is inaccurate for mixed currencies.
            // A better approach would be to convert all to a base currency like USD.
        }

        if (row.side && row.side.toLowerCase() === 'buy') {
          totalBuyAmount += parseFloat(row.total_value);
        } else if (row.side && row.side.toLowerCase() === 'sell') {
          totalSellAmount += parseFloat(row.total_value);
        }
      });

      if (!pnlCurrency && symbol) { // Try to get currency if no trades but symbol provided
         const symbolInfo = await pgQuery("SELECT quote_asset FROM symbols WHERE name = \$1", [symbol.toUpperCase()]);
         pnlCurrency = symbolInfo.rows[0]?.quote_asset;
      }


      return {
        userId: userId.toString(),
        symbol: symbol,
        totalBuyAmount,
        totalSellAmount,
        netPnl: totalSellAmount - totalBuyAmount,
        currency: pnlCurrency || 'N/A', // Default if no trades determined currency
      };

    } catch (error: any) {
      console.error(\`[AnalyticsService] Error calculating PNL for user \${userId}:\`, error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to calculate PNL.' });
    }
  }

  // TODO: More analytics methods:
  // - Win/loss ratio
  // - Sharpe ratio (requires risk-free rate, more complex PNL series)
  // - Trade frequency, volume
  // - Performance per strategy
}

export default new AnalyticsService();

import { IMarketplaceScript } from '../../models/mongodb/script.model'; // Just an example if needed later, likely not for this model

// Represents a single price level within a footprint bar/candle
export interface IFootprintLevel {
  price: number;
  bidVolume: number; // Total volume of aggressive sell orders (trades hitting the bid) at this price
  askVolume: number; // Total volume of aggressive buy orders (trades hitting the ask) at this price
  delta: number;     // askVolume - bidVolume for this price level
  totalVolumeAtPrice: number; // bidVolume + askVolume
  imbalanceFlag?: 'bid' | 'ask' | 'none' | null; // Indicates significant imbalance with a diagonal level
                                               // 'bid': Bid imbalance (strong selling pressure at this level compared to ask at level below)
                                               // 'ask': Ask imbalance (strong buying pressure at this level compared to bid at level above)
}

// Represents a full footprint bar/candle for a specific interval
export interface IFootprintCandle {
  // --- From footprints_futures TimescaleDB table ---
  id?: string | number; // Optional, if directly mapping from DB record ID
  symbolId?: number;    // Internal symbol ID from 'symbols' table
  exchange: string;
  symbol: string;      // Trading pair, e.g., BTC/USDT
  intervalType: string; // e.g., '1m', '5m', '1000v' (volume), '100d' (delta)
  startTime: Date | string; // ISO string or Date object
  endTime: Date | string;   // ISO string or Date object

  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  closePrice?: number;

  totalVolume?: number;   // Total volume for the entire bar/candle
  totalDelta?: number;    // Total (Ask Volume - Bid Volume) for the entire bar/candle

  pocPrice?: number;      // Point of Control: Price level with the highest volume in this bar
  valueAreaHigh?: number; // Highest price of the value area (e.g., 70% of volume) for this bar
  valueAreaLow?: number;  // Lowest price of the value area for this bar

  footprintData: IFootprintLevel[]; // Array of price levels and their bid/ask volumes

  // --- Additional calculated or contextual fields (optional, may not be stored directly in DB 'footprint_data' JSONB) ---
  maxDelta?: number;      // Maximum delta observed across price levels in this bar
  minDelta?: number;      // Minimum delta observed
  cumulatedDelta?: number; // Cumulative delta from the start of the bar (often shown at bottom of bar)
  // Add any other metrics derived from the footprint candle
}

// Example: Input data structure for the OrderFlowProcessorService if it processes raw trades
export interface RawTradeData {
    timestamp: number;
    price: number;
    quantity: number;
    // side: 'buy' | 'sell'; // This is the aggressor side for footprint calculation
    aggressorSide: 'buy' | 'sell' | 'unknown'; // 'buy' if buyer was aggressor, 'sell' if seller was
    tradeId?: string;
    // Potentially other fields like exchange, symbol if processing a mixed stream
}

console.log('orderFlow.model.ts loaded: Defines IFootprintLevel and IFootprintCandle interfaces.');

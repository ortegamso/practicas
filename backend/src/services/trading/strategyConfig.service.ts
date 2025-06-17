import StrategyConfig, { IStrategyConfig } from '../../models/mongodb/strategyConfig.model';
import ExchangeConfig from '../../models/mongodb/exchangeConfig.model'; // To verify exchangeConfig ownership
import { AppError, HttpCode } from '../../utils/appError';
import mongoose from 'mongoose';

export interface StrategyConfigCreateDto {
  userId: string | mongoose.Types.ObjectId;
  name: string;
  description?: string;
  exchangeConfigId: string | mongoose.Types.ObjectId;
  symbol: string;
  parameters: Record<string, any>; // JSON-like object
  isActive?: boolean;
}

export interface StrategyConfigUpdateDto {
  name?: string;
  description?: string;
  exchangeConfigId?: string | mongoose.Types.ObjectId;
  symbol?: string;
  parameters?: Record<string, any>;
  isActive?: boolean;
  // Note: 'status' should generally be updated by the engine, not directly by user here
}

// For returning to the client
export interface StrategyConfigResponseDto extends Omit<IStrategyConfig, 'user' | 'exchangeConfig' | '__v' | 'healthMessage'> {
  id: string;
  userId: string;
  exchangeConfigId: string;
  // healthMessage might be excluded by default or added based on specific needs
}


class StrategyConfigService {
  // Helper to map to response DTO
  private mapToResponseDto(config: IStrategyConfig): StrategyConfigResponseDto {
    const { _id, user, exchangeConfig, healthMessage, __v, ...rest } = config.toObject();
    return {
      id: _id.toString(),
      userId: (user as mongoose.Types.ObjectId).toString(), // Assuming user is populated or just ID
      exchangeConfigId: (exchangeConfig as mongoose.Types.ObjectId).toString(), // Assuming populated or just ID
      ...rest,
    } as StrategyConfigResponseDto;
  }

  public async create(data: StrategyConfigCreateDto): Promise<StrategyConfigResponseDto> {
    const { userId, exchangeConfigId, name, symbol, parameters } = data;

    // Verify that the referenced exchangeConfigId belongs to the user and exists
    const exConfig = await ExchangeConfig.findOne({ _id: exchangeConfigId, user: userId });
    if (!exConfig) {
      throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid exchange configuration ID or not owned by user.' });
    }
    if (!exConfig.isActive) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'The selected exchange configuration is not active.' });
    }

    const newStrategyConfig = new StrategyConfig({
      ...data,
      user: userId,
      exchangeConfig: exchangeConfigId, // Store the ObjectId
      symbol: symbol.toUpperCase().trim(),
      status: data.isActive ? 'pending_start' : 'stopped', // Initial status based on isActive intent
    });

    try {
      const savedConfig = await newStrategyConfig.save();
      return this.mapToResponseDto(savedConfig);
    } catch (error: any) {
      if (error.code === 11000 || error.message.includes('duplicate key error')) {
        if (error.message.includes('user_strategy_name_unique')) {
             throw new AppError({ httpCode: HttpCode.CONFLICT, description: \`A strategy with the name '\${name}' already exists.\` });
        }
      }
      console.error("Error creating strategy config:", error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to save strategy configuration.' });
    }
  }

  public async findByUserId(userId: string | mongoose.Types.ObjectId): Promise<StrategyConfigResponseDto[]> {
    const configs = await StrategyConfig.find({ user: userId })
      .populate('exchangeConfig', 'exchangeName friendlyName isTestnet') // Populate some useful fields
      .sort({ createdAt: -1 });
    return configs.map(config => this.mapToResponseDto(config));
  }

  public async findByIdForUser(id: string, userId: string | mongoose.Types.ObjectId): Promise<StrategyConfigResponseDto | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const config = await StrategyConfig.findOne({ _id: id, user: userId })
        .populate('exchangeConfig', 'exchangeName friendlyName isTestnet isActive');
    return config ? this.mapToResponseDto(config) : null;
  }

  // For internal use by strategy engine - gets full document
  public async getFullConfigById(id: string): Promise<IStrategyConfig | null> {
      if (!mongoose.Types.ObjectId.isValid(id)) return null;
      return StrategyConfig.findById(id).populate('exchangeConfig'); // Engine might need full exchange config
  }


  public async update(id: string, userId: string | mongoose.Types.ObjectId, updateData: StrategyConfigUpdateDto): Promise<StrategyConfigResponseDto | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    const strategyConfig = await StrategyConfig.findOne({ _id: id, user: userId });
    if (!strategyConfig) {
      return null; // Or throw Not Found AppError
    }

    // If exchangeConfigId is being updated, verify new one
    if (updateData.exchangeConfigId && updateData.exchangeConfigId.toString() !== strategyConfig.exchangeConfig.toString()) {
        const exConfig = await ExchangeConfig.findOne({ _id: updateData.exchangeConfigId, user: userId });
        if (!exConfig) {
            throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid new exchange configuration ID or not owned by user.' });
        }
        if (!exConfig.isActive) {
            throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'The new selected exchange configuration is not active.' });
        }
        strategyConfig.exchangeConfig = exConfig._id; // Assign ObjectId
    }

    if (updateData.name !== undefined) strategyConfig.name = updateData.name;
    if (updateData.description !== undefined) strategyConfig.description = updateData.description;
    if (updateData.symbol !== undefined) strategyConfig.symbol = updateData.symbol.toUpperCase().trim();
    if (updateData.parameters !== undefined) strategyConfig.parameters = updateData.parameters;

    // Handle isActive changes and corresponding status updates
    if (updateData.isActive !== undefined && strategyConfig.isActive !== updateData.isActive) {
        strategyConfig.isActive = updateData.isActive;
        if (updateData.isActive) {
            // If user activates it, and it's currently stopped/error, set to pending_start. Engine will pick it up.
            // If it was paused by user, user activating it means it should become pending_start or running (engine decides).
            if (['stopped', 'error'].includes(strategyConfig.status)) {
                 strategyConfig.status = 'pending_start';
            } // If 'paused', engine might resume or user explicitly resumes via another action.
              // For now, user toggling isActive to true from any non-running state could mean "try to run".
        } else {
            // If user deactivates it, engine should stop it.
            // We can set to 'stopped' or let engine handle based on current 'status'.
            // For simplicity, user deactivating means it should stop.
            strategyConfig.status = 'stopped';
        }
    }

    try {
        const updatedConfig = await strategyConfig.save();
        // Repopulate if needed for response, or mapToResponseDto handles it
        const populated = await StrategyConfig.findById(updatedConfig._id).populate('exchangeConfig', 'exchangeName friendlyName isTestnet');
        return populated ? this.mapToResponseDto(populated) : null;
    } catch (error: any) {
         if (error.code === 11000 || error.message.includes('duplicate key error')) {
             if (error.message.includes('user_strategy_name_unique') && updateData.name) {
                throw new AppError({ httpCode: HttpCode.CONFLICT, description: \`A strategy with the name '\${updateData.name}' already exists.\` });
            }
        }
        console.error("Error updating strategy config:", error);
        throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to update strategy configuration.' });
    }
  }

  public async delete(id: string, userId: string | mongoose.Types.ObjectId): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(id)) return false;
    const strategyConfig = await StrategyConfig.findOne({ _id: id, user: userId });
    if (!strategyConfig) return false;

    // Ensure strategy is not in a state that prevents deletion (e.g. running - engine should stop it first)
    if (strategyConfig.status === 'running' || strategyConfig.status === 'pending_start') {
        // Or, first update status to 'stopped' and let engine clean up, then delete.
        // This requires more coordination. For now, prevent deletion of active-like strategies.
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Cannot delete a strategy that is currently running or pending start. Please stop it first.' });
    }

    const result = await StrategyConfig.deleteOne({ _id: id, user: userId });
    return result.deletedCount === 1;
  }

  // Method for Strategy Engine to update status
  public async updateStrategyStatus(id: string, status: IStrategyConfig['status'], healthMessage?: string): Promise<IStrategyConfig | null> {
      if (!mongoose.Types.ObjectId.isValid(id)) return null;
      const strategy = await StrategyConfig.findById(id);
      if (!strategy) return null;

      strategy.status = status;
      if (healthMessage !== undefined) { // Allow clearing healthMessage by passing empty string
          strategy.healthMessage = healthMessage;
      }
      if (status === 'running') strategy.isActive = true; // If engine successfully runs it, ensure isActive is true.
      if (status === 'stopped' || status === 'error') strategy.isActive = false; // If engine stops it due to error or completion, mark inactive.

      return strategy.save();
  }

  public async findAllStrategiesByStatusOrActivity(isActive?: boolean, statuses?: IStrategyConfig['status'][]): Promise<IStrategyConfig[]> {
    const query: mongoose.FilterQuery<IStrategyConfig> = {};
    const orConditions: mongoose.FilterQuery<IStrategyConfig>[] = [];

    if (isActive !== undefined) {
      orConditions.push({ isActive: isActive });
    }
    if (statuses && statuses.length > 0) {
      orConditions.push({ status: { $in: statuses } });
    }

    if (orConditions.length > 0) {
        query.$or = orConditions;
    } else {
        // If no conditions, maybe fetch all? Or throw error? For now, fetch all.
        // console.warn("[StrategyConfigService] findAllByStatusOrActivity called without specific conditions, fetching all.");
    }

    // Populate exchangeConfig to get exchangeName for Redis keys later
    return StrategyConfig.find(query).populate('exchangeConfig', 'exchangeName').exec();
  }
}

export default new StrategyConfigService();

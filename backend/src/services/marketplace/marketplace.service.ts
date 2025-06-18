import MarketplaceScript, { IMarketplaceScript, ScriptApprovalStatus, ScriptLanguage, ScriptCategory } from '../../models/mongodb/script.model';
import User, { IUser } from '../../models/mongodb/user.model';
import { AppError, HttpCode } from '../../utils/appError';
import mongoose from 'mongoose';

// DTO for creating/submitting a script
export interface ScriptCreateDto {
  authorId: string | mongoose.Types.ObjectId;
  name: string;
  description: string;
  longDescription?: string;
  language: ScriptLanguage | string;
  code: string; // Or reference/link
  version: string; // e.g., "1.0.0"
  price?: number; // Defaults to 0 if not provided
  currency?: string; // Defaults to 'USD'
  tags?: string[];
  category: ScriptCategory | string;
  // isActive is false by default, approvalStatus is PENDING_APPROVAL by default
}

// DTO for updating a script (by author)
export interface ScriptUpdateDto {
  name?: string;
  description?: string;
  longDescription?: string;
  language?: ScriptLanguage | string;
  code?: string;
  version?: string; // Author might update version (e.g. new submission for existing slug)
  price?: number;
  currency?: string;
  tags?: string[];
  category?: ScriptCategory | string;
  isActive?: boolean; // Author can activate/deactivate their approved scripts
}

// DTO for admin actions
export interface ScriptAdminUpdateDto {
  approvalStatus?: ScriptApprovalStatus | string;
  adminFeedback?: string;
  isActive?: boolean; // Admin can also deactivate scripts
  // Admin might also edit other fields if necessary, but typically focuses on status/feedback
  category?: ScriptCategory | string; // Admin might re-categorize
  tags?: string[]; // Admin might add/remove tags
}


export type MarketplaceScriptResponseDto = IMarketplaceScript; // For now, return full document

// Query options for listing scripts
export interface ScriptListQueryOptions {
  limit?: number;
  page?: number;
  category?: string;
  language?: string;
  tag?: string;
  authorId?: string;
  approvalStatus?: ScriptApprovalStatus | string; // For admin/author to filter by status
  isActive?: boolean; // Filter by author's active status
  sortBy?: 'price' | 'createdAt' | 'publishedAt' | 'name' | 'averageRating' | 'downloadCount';
  sortOrder?: 'asc' | 'desc';
  search?: string;
}


class MarketplaceService {
  public async submitScript(data: ScriptCreateDto): Promise<MarketplaceScriptResponseDto> {
    const { authorId, name, version } = data;
    // Check if a script with the same name/slug and version by this author already exists
    // Slug is auto-generated from name.
    // The unique index is on (author, slug, version)
    const tempSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+/, '').replace(/-+$/, '') || new mongoose.Types.ObjectId().toString();

    const existingScript = await MarketplaceScript.findOne({
        author: authorId,
        slug: tempSlug,
        version: version
    });
    if (existingScript) {
        throw new AppError({ httpCode: HttpCode.CONFLICT, description: \`You have already submitted a script named '\${name}' with version '\${version}'. Please use a different name or version.\` });
    }

    const newScript = new MarketplaceScript({
      ...data,
      author: authorId,
      price: data.price === undefined ? 0 : data.price, // Default price to 0 if not set
      currency: data.currency || 'USD',
      isActive: false, // Scripts are inactive until approved and explicitly activated by author
      approvalStatus: ScriptApprovalStatus.PENDING_APPROVAL,
    });

    try {
      const savedScript = await newScript.save();
      // TODO: Notify admin about new script submission
      return savedScript;
    } catch (error: any) {
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((err: any) => err.message).join(' ');
        throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: messages});
      }
      // Handle other potential errors like unique index violations if not caught by pre-check
      if (error.code === 11000) {
           throw new AppError({ httpCode: HttpCode.CONFLICT, description: 'A script with similar identifying information (name, version) might already exist.' });
      }
      console.error("Error submitting script:", error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to submit script.' });
    }
  }

  // Author updates their own script
  public async updateMyScript(scriptId: string, authorId: string, updateData: ScriptUpdateDto): Promise<MarketplaceScriptResponseDto | null> {
    if (!mongoose.Types.ObjectId.isValid(scriptId)) return null;

    const script = await MarketplaceScript.findOne({ _id: scriptId, author: authorId });
    if (!script) {
      return null; // Not found or not owner
    }

    // Certain fields might require re-approval if changed, e.g., code, version (if it implies new code)
    // For now, allow updates. If code/version changes, admin might need to review again.
    if (updateData.code || (updateData.version && updateData.version !== script.version)) {
        script.approvalStatus = ScriptApprovalStatus.PENDING_APPROVAL; // Reset to pending if critical parts change
        script.adminFeedback = "Code or version changed, requires re-approval."; // Auto-feedback
        script.isActive = false; // Deactivate while pending re-approval
        script.publishedAt = undefined; // Clear published date
    }

    Object.assign(script, updateData); // Apply updates

    try {
      const updatedScript = await script.save(); // Triggers pre-save hook for slug, publishedAt
      return updatedScript;
    } catch (error: any) {
      // Handle validation errors or unique constraint violations (e.g. if slug/version becomes non-unique for author)
      if (error.name === 'ValidationError') throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: Object.values(error.errors).map((e:any) => e.message).join(', ')});
      if (error.code === 11000) throw new AppError({ httpCode: HttpCode.CONFLICT, description: 'Update resulted in a conflict with an existing script (e.g., name/version).'});
      console.error(\`Error updating script \${scriptId}:\`, error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to update script.' });
    }
  }

  // Admin updates a script (status, feedback, etc.)
  public async updateScriptByAdmin(scriptId: string, adminUpdateData: ScriptAdminUpdateDto): Promise<MarketplaceScriptResponseDto | null> {
    if (!mongoose.Types.ObjectId.isValid(scriptId)) return null;
    const script = await MarketplaceScript.findById(scriptId);
    if (!script) return null;

    Object.assign(script, adminUpdateData);
    // If admin approves and it wasn't published, or re-approves
    if (adminUpdateData.approvalStatus === ScriptApprovalStatus.APPROVED && !script.publishedAt) {
        // Model pre-save hook also handles this, but can be explicit here too
        script.publishedAt = new Date();
    } else if (adminUpdateData.approvalStatus && adminUpdateData.approvalStatus !== ScriptApprovalStatus.APPROVED) {
        script.isActive = false; // If not approved, it cannot be active on marketplace
        // script.publishedAt = undefined; // Optionally clear published date if rejected/needs revision
    }


    try {
      return await script.save();
    } catch (error: any) {
      if (error.name === 'ValidationError') throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: Object.values(error.errors).map((e:any) => e.message).join(', ')});
      console.error(\`Error updating script by admin \${scriptId}:\`, error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to update script (admin).' });
    }
  }

  public async findScripts(queryOptions: ScriptListQueryOptions = {}): Promise<{ scripts: MarketplaceScriptResponseDto[], total: number, page: number, pages: number }> {
    const {
        limit = 10,
        page = 1,
        category,
        language,
        tag,
        authorId,
        approvalStatus, // For admin/author view
        isActive, // For public view, usually true + approved
        sortBy = 'publishedAt',
        sortOrder = 'desc',
        search
    } = queryOptions;

    const query: mongoose.FilterQuery<IMarketplaceScript> = {};

    if (category) query.category = category;
    if (language) query.language = language;
    if (tag) query.tags = { \$in: [tag.toLowerCase()] };
    if (authorId) query.author = authorId;

    // For public listings, typically: isActive: true, approvalStatus: ScriptApprovalStatus.APPROVED
    // For admin/author listings, these can be passed as filters.
    if (isActive !== undefined) query.isActive = isActive;
    if (approvalStatus) query.approvalStatus = approvalStatus;


    if (search) {
      query.\$text = { \$search: search }; // Uses the text index defined in the model
    }

    const sortCriteria: Record<string, mongoose.SortOrder> = {};
    sortCriteria[sortBy] = sortOrder === 'asc' ? 1 : -1;

    try {
      const total = await MarketplaceScript.countDocuments(query);
      const scripts = await MarketplaceScript.find(query)
        .populate('author', 'username') // Populate author's username
        .sort(sortCriteria)
        .skip((page - 1) * limit)
        .limit(limit)
        .exec();

      return { scripts, total, page, pages: Math.ceil(total / limit) };
    } catch (error: any) {
      console.error("Error finding marketplace scripts:", error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to retrieve scripts.' });
    }
  }

  public async findScriptByIdOrSlug(idOrSlug: string, forAuthorId?: string | mongoose.Types.ObjectId): Promise<MarketplaceScriptResponseDto | null> {
    let query: mongoose.FilterQuery<IMarketplaceScript>;
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      query = { _id: idOrSlug };
    } else {
      query = { slug: idOrSlug.toLowerCase() };
    }
    // If forAuthorId is provided, ensure the script belongs to that author
    if (forAuthorId) {
        query.author = forAuthorId;
    }

    try {
      const script = await MarketplaceScript.findOne(query).populate('author', 'username email'); // Populate more author details if needed
      return script;
    } catch (error: any) {
      console.error(\`Error finding script by ID/slug \${idOrSlug}:\`, error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to retrieve script.' });
    }
  }

  // For authors to delete their own scripts (if status allows, e.g. not yet approved or no sales)
  public async deleteMyScript(scriptId: string, authorId: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(scriptId)) return false;
    const script = await MarketplaceScript.findOne({ _id: scriptId, author: authorId });
    if (!script) return false; // Not found or not owner

    // Business logic: e.g., can only delete if PENDING_APPROVAL or REJECTED.
    // Or if no sales have been made. For now, simple deletion by author.
    if (script.approvalStatus === ScriptApprovalStatus.APPROVED && script.isActive) {
        // throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Cannot delete an active, approved script. Please deactivate it first or contact support."})
    }

    const result = await MarketplaceScript.deleteOne({ _id: scriptId, author: authorId });
    return result.deletedCount === 1;
  }

  // For admins to delete any script
  public async deleteScriptByAdmin(scriptId: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(scriptId)) return false;
    const result = await MarketplaceScript.deleteOne({ _id: scriptId });
    return result.deletedCount === 1;
  }

}

export default new MarketplaceService();

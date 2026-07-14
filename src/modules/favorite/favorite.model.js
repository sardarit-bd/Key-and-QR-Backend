import mongoose from "mongoose";

/**
 * Favorite Schema with Type and Soft Delete
 * Supports both Product and Quote favorites
 */
const favoriteSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            default: null,
        },
        quote: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Quote",
            default: null,
        },
        // NEW: Type field for filtering
        type: {
            type: String,
            enum: ["product", "quote"],
            required: true,
            index: true,
        },
        // NEW: Soft delete support
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        // NEW: Metadata for future use
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        // NEW: Notes for personalization
        notes: {
            type: String,
            default: null,
            trim: true,
            maxlength: 500,
        },
    },
    {
        timestamps: true,
    }
);

// Unique index: User + Product (only for product favorites)
favoriteSchema.index(
    { user: 1, product: 1 },
    {
        unique: true,
        partialFilterExpression: {
            product: { $ne: null },
            isDeleted: false,
        },
    }
);

// Unique index: User + Quote (only for quote favorites)
favoriteSchema.index(
    { user: 1, quote: 1 },
    {
        unique: true,
        partialFilterExpression: {
            quote: { $ne: null },
            isDeleted: false,
        },
    }
);

// Compound index for dashboard queries
favoriteSchema.index(
    { user: 1, type: 1, createdAt: -1 },
    { partialFilterExpression: { isDeleted: false } }
);

// Index for soft delete queries
favoriteSchema.index(
    { user: 1, isDeleted: 1 }
);

// Pre-save middleware to set type
favoriteSchema.pre('save', function(next) {
    if (this.product) {
        this.type = 'product';
    } else if (this.quote) {
        this.type = 'quote';
    } else {
        return next(new Error('Favorite must have either product or quote'));
    }
    next();
});

// Virtual for favorite type display
favoriteSchema.virtual('favoriteType').get(function() {
    return this.type;
});

// Transform toJSON to remove sensitive data
favoriteSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    }
});

const Favorite = mongoose.model("Favorite", favoriteSchema);
export default Favorite;
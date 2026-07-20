import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: [
                'favorite_added',
                'favorite_removed',
                'order_placed',
                'tag_activated',
                'qr_scanned',
                'quote_viewed',
                'profile_updated',
                'tag_assigned',
                'payment_completed',
                'subscription_created',
                'subscription_cancelled',
            ],
            required: true,
            index: true,
        },
        targetType: {
            type: String,
            enum: ['product', 'quote', 'order', 'tag', 'user', 'subscription', 'payment'],
            required: true,
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        timestamp: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for efficient queries
activitySchema.index(
    { user: 1, timestamp: -1 }
);

activitySchema.index(
    { user: 1, type: 1, timestamp: -1 }
);

// Index for cleanup jobs (expire after 30 days)
activitySchema.index(
    { timestamp: 1 },
    { expireAfterSeconds: 2592000 } // 30 days
);

// Virtual for formatted timestamp
activitySchema.virtual('formattedTimestamp').get(function() {
    return this.timestamp ? new Date(this.timestamp).toLocaleString() : '';
});

// Virtual for time ago
activitySchema.virtual('timeAgo').get(function() {
    const now = new Date();
    const diffMs = now - new Date(this.timestamp);
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffMonth / 12);
    
    if (diffYear > 0) return `${diffYear} year${diffYear > 1 ? 's' : ''} ago`;
    if (diffMonth > 0) return `${diffMonth} month${diffMonth > 1 ? 's' : ''} ago`;
    if (diffDay > 0) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    if (diffHour > 0) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    if (diffMin > 0) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    return 'Just now';
});

// Transform toJSON
activitySchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret.__v;
        delete ret._id;
        ret.id = doc._id;
        return ret;
    }
});

// Transform toObject
activitySchema.set('toObject', {
    virtuals: true,
});

const Activity = mongoose.model("Activity", activitySchema);
export default Activity;
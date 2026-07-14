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
            ],
            required: true,
            index: true,
        },
        targetType: {
            type: String,
            enum: ['product', 'quote', 'order', 'tag', 'user'],
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

// Index for cleanup jobs
activitySchema.index(
    { timestamp: 1 },
    { expireAfterSeconds: 2592000 } // 30 days
);

const Activity = mongoose.model("Activity", activitySchema);
export default Activity;
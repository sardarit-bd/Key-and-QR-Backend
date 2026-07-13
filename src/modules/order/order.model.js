import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        unitPrice: {
            type: Number,
            required: true,
            min: 0,
        },
        subtotal: {
            type: Number,
            required: true,
            min: 0,
        },
        purchaseType: {
            type: String,
            enum: ["self", "gift"],
            default: "self",
        },
        giftMessage: {
            type: String,
            default: null,
        },
        assignedTags: {
            type: [mongoose.Schema.Types.ObjectId],
            ref: "Tag",
            default: [],
        },
    },
    { _id: true }
);

const guestCustomerSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: false,
            trim: true,
        },
        email: {
            type: String,
            required: false,
            lowercase: true,
            trim: true,
        },
        phone: {
            type: String,
            default: null,
            trim: true,
        },
    },
    { _id: false }
);

// ✅ LEGACY: Assigned tag schema (kept for backward compatibility)
const assignedTagSchema = new mongoose.Schema(
    {
        tag: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tag",
            required: true,
        },
        assignedAt: {
            type: Date,
            default: Date.now,
        },
        assignedBy: {
            type: String,
            enum: ["auto", "admin"],
            default: "auto",
        },
    },
    { _id: false }
);

const orderSchema = new mongoose.Schema(
    {
        // ============================================================
        // USER
        // ============================================================
        
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
            index: true,
        },

        guestCustomer: {
            type: guestCustomerSchema,
            default: null,
        },

        isGuestOrder: {
            type: Boolean,
            default: false,
            index: true,
        },

        // ============================================================
        // 🆕 ITEMS - NEW MULTI-PRODUCT SUPPORT
        // ============================================================
        
        items: {
            type: [orderItemSchema],
            default: [],
            validate: {
                validator: function(items) {
                    return items && items.length > 0;
                },
                message: "Order must have at least one item",
            },
        },

        // ============================================================
        // LEGACY FIELDS - Kept for backward compatibility
        // ============================================================
        
        // ⚠️ DEPRECATED: Use items[].product instead
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            default: null,
        },

        // ⚠️ DEPRECATED: Use items[].quantity instead
        quantity: {
            type: Number,
            default: 1,
            min: 1,
        },

        // ⚠️ DEPRECATED: Use items[].assignedTags instead
        assignedTag: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tag",
            default: null,
        },

        assignedTags: {
            type: [assignedTagSchema],
            default: [],
        },

        tagAssignmentStatus: {
            type: String,
            enum: ["none", "partial", "complete"],
            default: "none",
            index: true,
        },

        // ============================================================
        // ORDER DETAILS
        // ============================================================
        
        purchaseType: {
            type: String,
            enum: ["self", "gift"],
            default: "self",
        },

        // Legacy gift message (kept for backward compatibility)
        giftMessage: {
            type: String,
            default: null,
        },

        giftMessageStatus: {
            type: String,
            enum: ["none", "pending", "approved", "rejected"],
            default: "none",
        },

        giftMessageReviewedAt: {
            type: Date,
            default: null,
        },

        giftMessageAdminNote: {
            type: String,
            default: null,
        },

        shippingAddress: {
            fullName: { type: String, required: false, default: null },
            email: { type: String, required: false, default: null },
            phone: { type: String, default: null },
            address: { type: String, default: null },
            city: { type: String, default: null },
            postalCode: { type: String, default: null },
            country: { type: String, default: null },
        },

        giftStatus: {
            type: String,
            enum: ["none", "pending_claim", "claimed"],
            default: "none",
        },

        giftClaimedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        giftClaimedAt: {
            type: Date,
            default: null,
        },

        // ============================================================
        // FINANCIAL
        // ============================================================
        
        subtotal: {
            type: Number,
            required: true,
            min: 0,
        },

        shippingCost: {
            type: Number,
            default: 0,
            min: 0,
        },

        discount: {
            type: Number,
            default: 0,
            min: 0,
        },

        grandTotal: {
            type: Number,
            required: true,
            min: 0,
        },

        // ============================================================
        // PAYMENT
        // ============================================================
        
        paymentStatus: {
            type: String,
            enum: ["pending", "paid", "refunded", "failed"],
            default: "pending",
        },

        fulfillmentStatus: {
            type: String,
            enum: [
                "pending",
                "assigned",
                "shipped",
                "delivered",
                "cancelled",
                "returned",
            ],
            default: "pending",
        },

        stripePaymentIntentId: {
            type: String,
            default: null,
        },

        stripeSessionId: {
            type: String,
            default: null,
        },

        // ============================================================
        // REFUND & RETURN
        // ============================================================
        
        refundStatus: {
            type: String,
            enum: [
                "none",
                "requested",
                "approved",
                "processing",
                "completed",
                "rejected",
            ],
            default: "none",
        },

        refundAmount: {
            type: Number,
            default: 0,
        },

        refundReason: {
            type: String,
            default: null,
        },

        refundRequestedAt: {
            type: Date,
            default: null,
        },

        refundProcessedAt: {
            type: Date,
            default: null,
        },

        refundTransactionId: {
            type: String,
            default: null,
        },

        cancellationReason: {
            type: String,
            default: null,
        },

        cancelledAt: {
            type: Date,
            default: null,
        },

        cancelledBy: {
            type: String,
            enum: ["user", "admin"],
            default: null,
        },

        returnStatus: {
            type: String,
            enum: [
                "none",
                "requested",
                "approved",
                "shipped",
                "received",
                "completed",
                "rejected",
            ],
            default: "none",
        },

        returnReason: {
            type: String,
            default: null,
        },

        returnRequestedAt: {
            type: Date,
            default: null,
        },

        returnApprovedAt: {
            type: Date,
            default: null,
        },

        returnShippedAt: {
            type: Date,
            default: null,
        },

        returnReceivedAt: {
            type: Date,
            default: null,
        },

        returnTrackingNumber: {
            type: String,
            default: null,
        },

        deliveredAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// ============================================================
// INDEXES
// ============================================================

// Legacy indexes
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ fulfillmentStatus: 1 });
orderSchema.index({ paymentStatus: 1 });

// NEW: Items indexes
orderSchema.index({ "items.product": 1 });
orderSchema.index({ "items.assignedTags": 1 });

// Guest indexes
orderSchema.index({ isGuestOrder: 1 });
orderSchema.index({ "guestCustomer.email": 1 });

// NEW: Virtuals
orderSchema.virtual('hasMultipleItems').get(function() {
    return this.items && this.items.length > 1;
});

orderSchema.virtual('isLegacyOrder').get(function() {
    return !this.items || this.items.length === 0;
});

orderSchema.virtual('totalQuantity').get(function() {
    if (this.items && this.items.length > 0) {
        return this.items.reduce((sum, item) => sum + item.quantity, 0);
    }
    return this.quantity || 1;
});

orderSchema.virtual('itemCount').get(function() {
    if (this.items && this.items.length > 0) {
        return this.items.length;
    }
    return 1;
});

// NEW: Method to get all tags from order
orderSchema.methods.getAllTags = function() {
    const tags = [];
    const seenIds = new Set();

    // Get from items
    if (this.items && this.items.length > 0) {
        for (const item of this.items) {
            if (item.assignedTags && item.assignedTags.length > 0) {
                for (const tagId of item.assignedTags) {
                    if (!seenIds.has(tagId.toString())) {
                        seenIds.add(tagId.toString());
                        tags.push(tagId);
                    }
                }
            }
        }
    }

    // Legacy: assignedTag
    if (this.assignedTag && !seenIds.has(this.assignedTag.toString())) {
        tags.push(this.assignedTag);
    }

    return tags;
};

// NEW: Method to check if all tags are assigned
orderSchema.methods.hasAllRequiredTags = function() {
    const totalTags = this.getAllTags().length;
    const totalItems = this.items?.length || 1;
    return totalTags >= totalItems;
};

const Order = mongoose.model("Order", orderSchema);

export default Order;
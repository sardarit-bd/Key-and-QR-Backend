import mongoose from "mongoose";
import logger from "../../utils/logger.js";
import Order from "../order/order.model.js";
import Tag from "../tag/tag.model.js";


class GuestAccountClaimService {
    /**
     * ✅ Claim all guest resources for a user
     * @param {string} userId - Authenticated user ID
     * @param {string} email - User's email
     * @returns {Promise<ClaimResult>}
     */
    async claimGuestResources(userId, email) {
        const result = {
            success: true,
            ordersClaimed: 0,
            tagsClaimed: 0,
            errors: [],
            timestamp: new Date(),
        };

        try {
            // ✅ 1. Find guest orders
            const guestOrders = await this.findGuestOrdersByEmail(email);
            
            if (guestOrders.length === 0) {
                logger.info(`No guest orders found for email: ${email}`);
                return result;
            }

            logger.info(`Found ${guestOrders.length} guest orders for email: ${email}`);

            // ✅ 2. Process each order
            for (const order of guestOrders) {
                try {
                    await this.claimOrder(userId, order);
                    result.ordersClaimed++;

                    // ✅ 3. Claim tags for this order
                    const tagsClaimed = await this.claimOrderTags(userId, order);
                    result.tagsClaimed += tagsClaimed;

                } catch (error) {
                    logger.error(`Failed to claim order ${order._id}:`, error);
                    result.errors.push({
                        orderId: order._id,
                        error: error.message,
                    });
                }
            }

            logger.info(`Guest claim completed for user ${userId}: ${result.ordersClaimed} orders, ${result.tagsClaimed} tags`);

        } catch (error) {
            logger.error(`Guest claim failed for user ${userId}:`, error);
            result.success = false;
            result.errors.push({
                error: error.message,
            });
        }

        return result;
    }

    /**
     * ✅ Find guest orders by email
     * Only orders where:
     * - isGuestOrder: true
     * - user: null
     * - guestCustomer.email: matches
     * - Not already claimed
     */
    async findGuestOrdersByEmail(email) {
        return Order.find({
            isGuestOrder: true,
            user: null,
            "guestCustomer.email": { $regex: new RegExp(`^${email}$`, 'i') },
        })
        .populate("product")
        .populate("assignedTag")
        .populate("assignedTags.tag")
        .lean();
    }

    /**
     * ✅ Claim a single order
     * Update user from null to userId
     * Maintain all other data
     * Idempotent: skip if already claimed
     */
    async claimOrder(userId, order) {
        // ✅ Check if already claimed (idempotency)
        if (order.user && order.user.toString() === userId.toString()) {
            logger.info(`Order ${order._id} already claimed by user ${userId}`);
            return order;
        }

        // ✅ Verify email matches (security)
        const guestEmail = order.guestCustomer?.email;
        if (!guestEmail) {
            throw new Error(`Order ${order._id} has no guest email`);
        }

        // ✅ Update order with user ID
        const updatedOrder = await Order.findByIdAndUpdate(
            order._id,
            {
                user: userId,
                // ✅ Keep isGuestOrder flag for history
                // ✅ Keep guestCustomer for audit
            },
            { 
                new: true,
                runValidators: true,
            }
        );

        if (!updatedOrder) {
            throw new Error(`Failed to claim order ${order._id}`);
        }

        // ✅ Log the claim
        logger.info(`Claimed order ${order._id} for user ${userId}`);

        return updatedOrder;
    }

    /**
     * ✅ Claim all tags associated with an order
     * Tags can be in:
     * - assignedTag (single)
     * - assignedTags (array)
     * 
     * Idempotent: skip if already owned by user
     */
    async claimOrderTags(userId, order) {
        let tagsClaimed = 0;
        const tagIds = [];

        // ✅ Collect all tag IDs from order
        if (order.assignedTag) {
            tagIds.push(order.assignedTag._id || order.assignedTag);
        }

        if (order.assignedTags && order.assignedTags.length > 0) {
            for (const assigned of order.assignedTags) {
                if (assigned.tag) {
                    tagIds.push(assigned.tag._id || assigned.tag);
                }
            }
        }

        if (tagIds.length === 0) {
            logger.info(`No tags found for order ${order._id}`);
            return 0;
        }

        logger.info(`Found ${tagIds.length} tags for order ${order._id}`);

        // ✅ Claim each tag
        for (const tagId of tagIds) {
            try {
                const claimed = await this.claimTag(userId, tagId);
                if (claimed) {
                    tagsClaimed++;
                }
            } catch (error) {
                logger.error(`Failed to claim tag ${tagId}:`, error);
                // ✅ Continue with other tags
            }
        }

        return tagsClaimed;
    }

    /**
     * ✅ Claim a single tag
     * Update owner from null to userId
     * Maintain all other properties
     * Idempotent: skip if already owned by user
     */
    async claimTag(userId, tagId) {
        // ✅ Find tag
        const tag = await Tag.findById(tagId);
        if (!tag) {
            throw new Error(`Tag ${tagId} not found`);
        }

        // ✅ Check if already claimed (idempotency)
        if (tag.owner && tag.owner.toString() === userId.toString()) {
            logger.info(`Tag ${tagId} already claimed by user ${userId}`);
            return true;
        }

        // ✅ Verify tag is not owned by someone else (security)
        if (tag.owner && tag.owner.toString() !== userId.toString()) {
            throw new Error(`Tag ${tagId} is owned by another user`);
        }

        // ✅ Update tag with user ID
        const updatedTag = await Tag.findByIdAndUpdate(
            tagId,
            {
                owner: userId,
                // ✅ Maintain all other properties
                // ✅ isActivated: true (already set)
                // ✅ activatedAt: existing
                // ✅ personalMessage: existing
            },
            { 
                new: true,
                runValidators: true,
            }
        );

        if (!updatedTag) {
            throw new Error(`Failed to claim tag ${tagId}`);
        }

        logger.info(`Claimed tag ${tagId} for user ${userId}`);

        return true;
    }

    /**
     * ✅ Check if user has guest resources
     * Used for onboarding/notification
     */
    async hasGuestResources(email) {
        const count = await Order.countDocuments({
            isGuestOrder: true,
            user: null,
            "guestCustomer.email": { $regex: new RegExp(`^${email}$`, 'i') },
        });
        return count > 0;
    }

    /**
     * ✅ Get guest resource summary
     * For displaying to user
     */
    async getGuestResourceSummary(email) {
        const guestOrders = await this.findGuestOrdersByEmail(email);
        
        let totalTags = 0;
        for (const order of guestOrders) {
            if (order.assignedTag) totalTags++;
            if (order.assignedTags) totalTags += order.assignedTags.length;
        }

        return {
            orderCount: guestOrders.length,
            tagCount: totalTags,
            orders: guestOrders.map(order => ({
                id: order._id,
                productName: order.product?.name || 'Unknown Product',
                date: order.createdAt,
                tags: order.assignedTags?.length || (order.assignedTag ? 1 : 0),
            })),
        };
    }
}

export default new GuestAccountClaimService();
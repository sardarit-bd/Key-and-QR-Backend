import stripe from "../../config/stripe.js";
import PAYMENT_CONFIG from "../../config/payment.config.js";
import PAYMENT_STATUS from "../../config/paymentStatus.js";
import AppError from "../../utils/AppError.js";
import httpStatus from "../../constants/httpStatus.js";
import orderService from "../order/order.service.js";

/**
 * Payment Service - Handles all payment-related operations
 */
class PaymentService {
    /**
     * Create Stripe Checkout Session
     */
    async createCheckoutSession(orderId, customerEmail, metadata = {}) {
        try {
            // Get order with items
            const order = await orderService.getOrderById(orderId);
            if (!order) {
                throw new AppError(httpStatus.NOT_FOUND, "Order not found");
            }

            // Build line items
            const lineItems = this.buildLineItems(order);

            // Build metadata
            const sessionMetadata = {
                orderId: orderId.toString(),
                ...metadata,
            };

            // Create Stripe session
            const session = await stripe.checkout.sessions.create({
                payment_method_types: PAYMENT_CONFIG.getPaymentMethodTypes(),
                mode: PAYMENT_CONFIG.stripe.mode,
                customer_email: customerEmail,
                line_items: lineItems,
                success_url: PAYMENT_CONFIG.getSuccessUrl(orderId),
                cancel_url: PAYMENT_CONFIG.getCancelUrl(),
                metadata: sessionMetadata,
                expires_at: Math.floor(Date.now() / 1000) + PAYMENT_CONFIG.getSessionExpiry(),
            });

            // Update order with session ID
            await orderService.updateOrder(orderId, {
                stripeSessionId: session.id,
                paymentStatus: PAYMENT_STATUS.PENDING,
            });

            return session;
        } catch (error) {
            console.error("Failed to create Stripe session:", error);
            
            // Update order status on failure
            try {
                await orderService.updateOrder(orderId, {
                    paymentStatus: PAYMENT_STATUS.FAILED,
                });
            } catch (updateError) {
                console.error("Failed to update order status:", updateError);
            }

            throw new AppError(
                httpStatus.INTERNAL_SERVER_ERROR,
                "Failed to initiate payment. Please try again."
            );
        }
    }

    /**
     * Build Stripe Line Items from Order
     */
    buildLineItems(order) {
        const lineItems = [];

        if (order.items && order.items.length > 0) {
            for (const item of order.items) {
                const product = item.product || {};
                lineItems.push({
                    price_data: {
                        currency: PAYMENT_CONFIG.getCurrency(),
                        product_data: {
                            name: product.name || "Product",
                            images: product.image?.url ? [product.image.url] : [],
                        },
                        unit_amount: Math.round(item.unitPrice * 100),
                    },
                    quantity: item.quantity,
                });
            }
        } else if (order.product) {
            // Legacy: single product
            const product = order.product || {};
            lineItems.push({
                price_data: {
                    currency: PAYMENT_CONFIG.getCurrency(),
                    product_data: {
                        name: product.name || "Product",
                        images: product.image?.url ? [product.image.url] : [],
                    },
                    unit_amount: Math.round((order.product.price || 0) * 100),
                },
                quantity: order.quantity || 1,
            });
        }

        return lineItems;
    }

    /**
     * Get order by Stripe session ID
     */
    async getOrderBySessionId(sessionId) {
        try {
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            const orderId = session.metadata?.orderId;
            if (!orderId) {
                throw new AppError(httpStatus.NOT_FOUND, "Order not found for session");
            }
            return orderService.getOrderById(orderId);
        } catch (error) {
            console.error("Failed to retrieve session:", error);
            throw new AppError(
                httpStatus.INTERNAL_SERVER_ERROR,
                "Failed to verify payment session"
            );
        }
    }

    /**
     * Verify payment status
     */
    async verifyPaymentStatus(orderId) {
        const order = await orderService.getOrderById(orderId);
        if (!order) {
            throw new AppError(httpStatus.NOT_FOUND, "Order not found");
        }

        // If already paid, return success
        if (order.paymentStatus === PAYMENT_STATUS.SUCCEEDED) {
            return {
                status: PAYMENT_STATUS.SUCCEEDED,
                order,
                verified: true,
            };
        }

        // If has stripe payment intent, check status
        if (order.stripePaymentIntentId) {
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(
                    order.stripePaymentIntentId
                );

                const statusMap = {
                    succeeded: PAYMENT_STATUS.SUCCEEDED,
                    requires_payment_method: PAYMENT_STATUS.PENDING,
                    requires_confirmation: PAYMENT_STATUS.PROCESSING,
                    requires_action: PAYMENT_STATUS.PROCESSING,
                    processing: PAYMENT_STATUS.PROCESSING,
                    requires_capture: PAYMENT_STATUS.PROCESSING,
                    canceled: PAYMENT_STATUS.CANCELLED,
                };

                const mappedStatus = statusMap[paymentIntent.status] || PAYMENT_STATUS.PENDING;

                // Update order if status changed
                if (mappedStatus !== order.paymentStatus) {
                    if (mappedStatus === PAYMENT_STATUS.SUCCEEDED && !order.isStockDeducted) {
                        await orderService.confirmPaymentAndAssignTag(
                            orderId,
                            order.stripePaymentIntentId
                        );
                    } else {
                        await orderService.updateOrder(orderId, {
                            paymentStatus: mappedStatus,
                        });
                    }
                }

                return {
                    status: mappedStatus,
                    order: await orderService.getOrderById(orderId),
                    verified: true,
                };
            } catch (error) {
                console.error("Failed to verify payment intent:", error);
                return {
                    status: order.paymentStatus,
                    order,
                    verified: false,
                    error: "Failed to verify payment status",
                };
            }
        }

        return {
            status: order.paymentStatus,
            order,
            verified: true,
        };
    }

    /**
     * Handle payment cancellation
     */
    async handleCancellation(orderId) {
        const order = await orderService.getOrderById(orderId);
        if (!order) {
            throw new AppError(httpStatus.NOT_FOUND, "Order not found");
        }

        if (order.paymentStatus === PAYMENT_STATUS.SUCCEEDED) {
            throw new AppError(
                httpStatus.BAD_REQUEST,
                "Cannot cancel a completed payment"
            );
        }

        if (order.paymentStatus === PAYMENT_STATUS.CANCELLED) {
            return order;
        }

        return orderService.updateOrder(orderId, {
            paymentStatus: PAYMENT_STATUS.CANCELLED,
            fulfillmentStatus: "cancelled",
            cancelledAt: new Date(),
            cancellationReason: "Payment cancelled by customer",
        });
    }
}

export default new PaymentService();
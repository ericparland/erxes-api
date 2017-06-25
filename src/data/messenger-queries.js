import _ from 'underscore';
import { Integrations, Conversations, Messages, Users } from './connectors';
import { checkAvailability } from './check-availability';
import { getIntegration } from './utils';

const unreadMessagesQuery = (conversations) => {
  const conversationIds = _.pluck(conversations, '_id');

  return {
    conversationId: { $in: conversationIds },
    userId: { $exists: true },
    internal: false,
    isCustomerRead: { $exists: false },
  }
}

export default {
  getMessengerIntegration(root, args) {
    return getIntegration(args.brandCode, 'messenger');
  },

  conversations(root, args) {
    const { integrationId, customerId } = args;

    return Conversations.find({
      integrationId,
      customerId,
    }).sort({ createdAt: -1 });
  },

  messages(root, { conversationId }) {
    return Messages.find({
      conversationId,
      internal: false,
    }).sort({ createdAt: 1 });
  },

  lastUnreadMessage(root, args) {
    const { integrationId, customerId } = args;

    // find conversations
    return Conversations.find({
      integrationId,
      customerId,

    // find read messages count
    }).then(convs => Messages.findOne(unreadMessagesQuery(convs)));
  },

  unreadCount(root, { conversationId }) {
    return Messages.count({
      conversationId,
      userId: { $exists: true },
      internal: false,
      isCustomerRead: { $exists: false },
    });
  },

  totalUnreadCount(root, args) {
    const { integrationId, customerId } = args;

    // find conversations
    return Conversations.find({
      integrationId,
      customerId,

    // find read messages count
    }).then(convs => Messages.count(unreadMessagesQuery(convs)));
  },

  conversationLastStaff(root, args) {
    const messageQuery = {
      conversationId: args._id,
      userId: { $exists: true },
    };

    return Messages.findOne(messageQuery).then(message =>
      Users.findOne({ _id: message && message.userId }),
    );
  },

  isMessengerOnline(root, args) {
    return Integrations.findOne({ _id: args.integrationId }).then(integ => {
      const integration = integ;
      const messengerData = integration.messengerData || {};

      integration.availabilityMethod = messengerData.availabilityMethod;
      integration.isOnline = messengerData.isOnline;
      integration.onlineHours = messengerData.onlineHours;

      return checkAvailability(integration, new Date());
    });
  },
};
